const express = require("express");
const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const { protect, authorize, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const Tenant = require("../models/Tenant");
const Subscription = require("../models/Subscription");
const Doctor = require("../models/Doctor");
const { PLANS, TRIAL, GST_RATE, calculatePricing } = require("../utils/pricing");

const router = express.Router();

const razorpay = () => {
  const { RAZORPAY_KEY_ID: key_id, RAZORPAY_KEY_SECRET: key_secret } = process.env;
  if (!key_id || !key_secret) {
    throw new Error("Online payments are not configured");
  }
  const Razorpay = require("razorpay");
  return new Razorpay({ key_id, key_secret });
};

const DAY = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = { monthly: 30, yearly: 365 };
const STAFF_PER_DOCTOR = 5;

// Public: plan cards for the register / billing pages.
router.get("/plans", (req, res) => {
  res.json({ success: true, data: { plans: PLANS, trial: TRIAL, gstRate: GST_RATE } });
});

// Below: tenant admins only. No requirePlan on purpose — an expired tenant must be able to pay.
router.use(protect, tenantScope, authorize(...ADMINS));

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const [tenant, subscription, doctors] = await Promise.all([
      // name / contact / gstDetails fill the "Bill To" block of the invoice PDF
      Tenant.findById(req.tenantId).select("name plan planExpiresAt limits status contact gstDetails"),
      Subscription.findOne({ tenant: req.tenantId }),
      Doctor.countDocuments({ tenantId: req.tenantId }),
    ]);
    res.json({ success: true, data: { tenant, subscription, usage: { doctors } } });
  }),
);

router.post(
  "/order",
  asyncHandler(async (req, res) => {
    const { plan, doctors, billingCycle = "monthly" } = req.body;
    if (!["monthly", "yearly"].includes(billingCycle)) {
      res.status(400);
      throw new Error("Invalid billing cycle");
    }
    let price;
    try {
      price = calculatePricing(plan, doctors, billingCycle);
    } catch (err) {
      res.status(400);
      throw err;
    }
    // Amount comes from the server's price table only, never from the client.
    const order = await razorpay().orders.create({
      amount: price.total * 100,
      currency: "INR",
      receipt: `nc_${String(req.tenantId).slice(-12)}_${Date.now()}`,
    });
    await Subscription.findOneAndUpdate(
      { tenant: req.tenantId },
      {
        $set: {
          pendingOrder: {
            razorpayOrderId: order.id,
            plan: price.plan,
            doctors: price.doctors,
            billingCycle,
            subtotal: price.subtotal,
            gst: price.gst,
            amount: price.total,
          },
        },
      },
      { upsert: true },
    );
    res.json({
      success: true,
      data: { orderId: order.id, amount: order.amount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, price },
    });
  }),
);

router.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = req.body;
    if (!orderId || !paymentId || !sig) {
      res.status(400);
      throw new Error("Payment details missing");
    }
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(400);
      throw new Error("Payment verification failed");
    }

    const subscription = await Subscription.findOne({ tenant: req.tenantId });
    if (subscription?.invoices.some((i) => i.razorpayPaymentId === paymentId && i.status === "paid")) {
      return res.json({ success: true, data: { subscription }, message: "Already activated" });
    }
    // Plain copy: unsetting pendingOrder below would otherwise blank this subdocument (-> NaN limits).
    const pending = subscription?.pendingOrder ? subscription.pendingOrder.toObject() : null;
    if (!pending || pending.razorpayOrderId !== orderId) {
      res.status(400);
      throw new Error("No matching pending order");
    }

    // Renewals extend from the current end if still running, so early payers lose nothing.
    const now = new Date();
    const tenant = await Tenant.findById(req.tenantId).select("planExpiresAt");
    const base = tenant.planExpiresAt && tenant.planExpiresAt > now ? tenant.planExpiresAt : now;
    const end = new Date(base.getTime() + PERIOD_DAYS[pending.billingCycle] * DAY);

    const [paid] = await Subscription.aggregate([
      { $unwind: "$invoices" },
      { $match: { "invoices.status": "paid" } },
      { $count: "n" },
    ]);
    const invoiceNumber = `INV-NC-${String((paid?.n || 0) + 1).padStart(4, "0")}`;

    subscription.set({
      plan: pending.plan,
      doctors: pending.doctors,
      billingCycle: pending.billingCycle,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: end,
      pendingOrder: undefined,
    });
    subscription.invoices.push({
      invoiceNumber,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      plan: pending.plan,
      doctors: pending.doctors,
      billingCycle: pending.billingCycle,
      subtotal: pending.subtotal,
      gst: pending.gst,
      amount: pending.amount,
      status: "paid",
      paidAt: now,
    });
    await subscription.save();

    await Tenant.findByIdAndUpdate(req.tenantId, {
      plan: pending.plan,
      planExpiresAt: end,
      status: "active",
      "limits.doctorLimit": pending.doctors,
      "limits.patientLimit": 0,
      "limits.userLimit": pending.doctors * STAFF_PER_DOCTOR,
    });

    res.json({ success: true, data: { subscription }, message: "Plan activated" });
  }),
);

module.exports = router;
