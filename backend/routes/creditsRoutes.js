const express = require("express");
const asyncHandler = require("express-async-handler");
const cfg = require("../config/credits");
const credits = require("../utils/credits");
const CreditLedger = require("../models/CreditLedger");
const CreditTopup = require("../models/CreditTopup");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const { protect, authorize, requirePlan } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const router = express.Router();

const H = 3600 * 1000;
const istDayStart = (offsetDays = 0) =>
  new Date(new Date(`${new Date(Date.now() + 5.5 * H).toISOString().slice(0, 10)}T00:00:00+05:30`).getTime() + offsetDays * 24 * H);

// owner buys; the hospital admin (and a platform admin looking at one clinic) can see
router.use(protect, requirePlan, tenantScope, authorize("super_admin", "tenant_owner", "hospital_admin"));
const owner = authorize("tenant_owner");

router.get("/balance", asyncHandler(async (req, res) => {
  await credits.syncPending(req.tenantId).catch(() => {}); // a top-up paid in a tab that closed
  res.json({ success: true, data: await credits.getBalance(req.tenantId) });
}));

router.get("/packs", asyncHandler(async (req, res) => {
  const packs = cfg.PACKS.map((p) => {
    const gst = Math.round(p.price * cfg.GST_PCT) / 100;
    return { ...p, gst, total: p.price + gst, bonus: Math.max(p.credits - p.price, 0) };
  });
  res.json({ success: true, data: { packs, gstPct: cfg.GST_PCT, ratePerMessage: cfg.DEFAULT_RATE } });
}));

// Message list: what was charged, to whom, and what was skipped for lack of credits.
router.get("/ledger", asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const filter = { tenantId: req.tenantId };
  if (["topup", "bonus", "debit", "refund", "skipped"].includes(req.query.type)) filter.type = req.query.type;
  const [rows, total] = await Promise.all([
    CreditLedger.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CreditLedger.countDocuments(filter),
  ]);
  res.json({
    success: true,
    total,
    page,
    data: rows.map((r) => ({ _id: r._id, type: r.type, credits: credits.toCredits(r.units), event: r.event, phone: r.phone, status: r.status, note: r.note, createdAt: r.createdAt })),
  });
}));

// What the automatic reminders due in the next day will cost.
router.get("/estimate", asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const [appointments, followUps] = await Promise.all([
    Appointment.countDocuments({ tenantId, status: "scheduled", reminderSentAt: null, scheduledAt: { $gt: new Date(Date.now() + H), $lte: new Date(Date.now() + 25 * H) } }),
    Consultation.countDocuments({ tenantId, followUpReminderSentAt: null, followUpOn: { $gte: istDayStart(1), $lt: istDayStart(2) } }),
  ]);
  res.json({ success: true, data: { appointmentReminders: appointments, followUpReminders: followUps, credits: Math.round((appointments + followUps) * cfg.DEFAULT_RATE * 100) / 100 } });
}));

router.post("/topup", owner, asyncHandler(async (req, res) => {
  try {
    res.json({ success: true, data: await credits.createTopup({ _id: req.user._id, tenantId: req.tenantId }, req.body.packId) });
  } catch (e) {
    res.status(e.status || 500);
    throw e;
  }
}));

router.post("/topup/verify", owner, asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400);
    throw new Error("Missing payment details");
  }
  if (!credits.verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    res.status(400);
    throw new Error("Payment verification failed. Invalid signature.");
  }
  const order = await CreditTopup.findOne({ orderId: razorpayOrderId }).select("tenantId");
  if (!order || String(order.tenantId) !== String(req.tenantId)) {
    res.status(404);
    throw new Error("Order not found");
  }
  await credits.completeTopup({ orderId: razorpayOrderId, paymentId: razorpayPaymentId }); // null = already credited
  res.json({ success: true, data: await credits.getBalance(req.tenantId) });
}));

router.get("/topups", asyncHandler(async (req, res) => {
  const rows = await CreditTopup.find({ tenantId: req.tenantId, status: "paid" }).sort({ paidAt: -1 }).limit(50).lean();
  res.json({ success: true, data: rows.map((t) => ({ _id: t._id, invoiceNumber: t.invoiceNumber, credits: t.credits, price: t.price, gst: t.gst, total: t.total, paidAt: t.paidAt })) });
}));

module.exports = router;
