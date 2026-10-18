const asyncHandler = require("express-async-handler");
const Tenant = require("../models/Tenant");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");
const gateway = require("../services/paymentGatewayService");
const {
  sanitizePaymentConfig,
  publicView,
  credsFor,
  SELECT_SECRETS,
} = require("../utils/paymentConfig");
const { build } = require("./invoiceController");
const { statusFor, r2 } = require("../utils/invoice");
const { notifyPatient } = require("../utils/whatsapp");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// ---- settings (admins only) ----
const getConfig = asyncHandler(async (req, res) => {
  const t = await Tenant.findById(req.tenantId).select(
    `paymentConfig ${SELECT_SECRETS}`,
  );
  res.json({ success: true, data: publicView(t?.paymentConfig) });
});

const updateConfig = asyncHandler(async (req, res) => {
  let set;
  try {
    set = sanitizePaymentConfig(req.body);
  } catch (err) {
    fail(res, 400, err.message);
  }
  const t = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $set: set },
    { new: true },
  ).select(`paymentConfig ${SELECT_SECRETS}`);
  const view = publicView(t.paymentConfig);
  // Never leave "enabled" on with an incomplete gateway: bookings would then fail at checkout.
  if (view.enabled && !view.configured) {
    await Tenant.updateOne(
      { _id: req.tenantId },
      { $set: { "paymentConfig.enabled": false } },
    );
    view.enabled = false;
    fail(
      res,
      400,
      "Enter all keys for the selected gateway before turning online payments on",
    );
  }
  res.json({ success: true, data: view });
});

// Is online payment available for this org? Safe for any signed-in user of the tenant.
const status = asyncHandler(async (req, res) => {
  const c = await credsFor(req.tenantId);
  res.json({
    success: true,
    data: { enabled: !!c, provider: c?.gateway || null },
  });
});

// ---- appointment fee: order + verify (shared by staff dashboard and patient portal) ----
// `scope` narrows which appointments the caller may pay for (staff: whole tenant; patient: own profiles).
const returnUrlFor = (apptId, orderId, as) =>
  `${(process.env.CLIENT_URL || "http://localhost:8080").split(",")[0].trim()}/payment-return?appointmentId=${apptId}&orderId=${orderId}&as=${as}`;

async function createOrder(req, res, scope, as) {
  const appt = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...scope,
  });
  if (!appt) fail(res, 404, "Appointment not found");
  if (appt.status === "cancelled")
    fail(res, 409, "This appointment is cancelled");
  if (appt.paymentStatus !== "unpaid")
    fail(res, 409, "This appointment is already settled");
  if (!(appt.fee > 0)) fail(res, 400, "This appointment has no fee to pay");
  const c = await credsFor(req.tenantId);
  if (!c)
    fail(
      res,
      400,
      "Online payments are not set up for this organisation. Pay at the clinic.",
    );

  const orderId = `appt_${Date.now()}_${String(appt._id).slice(-6)}`;
  let order;
  try {
    order = await gateway.createOrder(c.gateway, c.creds, {
      amount: appt.fee,
      orderId,
      customer: {
        id: String(req.user._id),
        name: req.user.name || "Patient",
        phone: req.user.phone,
        email: req.user.email,
      },
      returnUrl: returnUrlFor(appt._id, orderId, as),
    });
  } catch (err) {
    fail(res, 502, err.message || "The payment gateway rejected the request");
  }
  await Appointment.updateOne(
    { _id: appt._id },
    {
      $set: { "payment.gateway": c.gateway, "payment.orderId": order.orderId },
    },
  );
  const {
    gateway: g,
    checkoutMode,
    keyId,
    appId,
    paymentSessionId,
    checkoutUrl,
    redirectUrl,
    redirectFields,
  } = order;
  res.json({
    success: true,
    data: {
      appointmentId: appt._id,
      gateway: g,
      checkoutMode,
      orderId: order.orderId,
      keyId,
      appId,
      paymentSessionId,
      checkoutUrl,
      redirectUrl,
      redirectFields,
      amount: appt.fee,
      currency: "INR",
    },
  });
}

// Re-asks the gateway itself (never trusts the browser), flips the appointment to paid exactly once,
// then books the money on the invoice so billing and reports stay in step without anyone re-typing it.
async function verify(req, res, scope) {
  const { appointmentId, orderId, razorpayPaymentId, razorpaySignature } =
    req.body;
  if (!appointmentId || !orderId)
    fail(res, 400, "appointmentId and orderId are required");
  const appt = await Appointment.findOne({
    _id: appointmentId,
    tenantId: req.tenantId,
    ...scope,
  }).select("+payment.orderId");
  if (!appt || appt.payment?.orderId !== orderId)
    fail(res, 404, "Payment not found for this appointment");
  if (appt.paymentStatus === "paid")
    return res.json({ success: true, data: { paymentStatus: "paid" } });

  const c = await credsFor(req.tenantId);
  if (!c || c.gateway !== appt.payment.gateway)
    fail(
      res,
      409,
      "Payment settings changed while paying. Contact the clinic.",
    );
  const r = await gateway.confirmPayment(c.gateway, c.creds, orderId, {
    razorpayOrderId: orderId,
    razorpayPaymentId,
    razorpaySignature,
  });
  if (!r.isSuccess) fail(res, 400, "Payment could not be verified");

  const paymentId = razorpayPaymentId || orderId;
  const won = await Appointment.findOneAndUpdate(
    { _id: appt._id, paymentStatus: "unpaid" },
    {
      $set: {
        paymentStatus: "paid",
        "payment.paymentId": paymentId,
        "payment.paidAt": new Date(),
      },
    },
    { new: true },
  );
  if (won) {
    await recordOnInvoice(req, won, paymentId);
    notifyPatient({
      tenantId: req.tenantId,
      patientId: won.patientId,
      key: "payment_receipt",
      extra: { amount: r2(won.fee), reference: paymentId },
      ref: { kind: "appointment", id: won._id },
    });
  }
  res.json({ success: true, data: { paymentStatus: "paid" } });
}

async function recordOnInvoice(req, appt, paymentId) {
  const amount = r2(appt.fee);
  const pay = {
    amount,
    mode: "online",
    reference: String(paymentId).slice(0, 100),
    receivedBy: req.user._id,
  };
  const open = await Invoice.findOne({
    tenantId: req.tenantId,
    appointmentId: appt._id,
    status: { $in: ["unpaid", "partial"] },
  });
  if (open) {
    const due = r2(open.total - open.paid);
    pay.amount = Math.min(amount, due);
    open.payments.push(pay);
    open.paid = r2(open.paid + pay.amount);
    open.status = statusFor(open.total, open.paid, open.status);
    return open.save();
  }
  if (
    await Invoice.exists({
      tenantId: req.tenantId,
      appointmentId: appt._id,
      status: { $ne: "void" },
    })
  )
    return; // already fully paid some other way
  const items = [
    {
      description: "Consultation fee",
      qty: 1,
      rate: amount,
      gstRate: 0,
      source: { kind: "appointment", refId: String(appt._id), key: "" },
    },
  ];
  const resStub = { status() {} };
  return build(req, resStub, {
    patientId: appt.patientId,
    appointmentId: appt._id,
    doctorId: appt.doctorId,
    items,
    discount: 0,
    notes: "Paid online",
    initialPayment: { amount, mode: "online", reference: pay.reference },
  });
}

const staffOrder = asyncHandler((req, res) =>
  createOrder(req, res, {}, "staff"),
);
const staffVerify = asyncHandler((req, res) => verify(req, res, {}));

module.exports = {
  getConfig,
  updateConfig,
  status,
  staffOrder,
  staffVerify,
  createOrder,
  verify,
};
