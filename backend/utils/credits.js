const crypto = require("crypto");
const Razorpay = require("razorpay");
const cfg = require("../config/credits");
const CreditWallet = require("../models/CreditWallet");
const CreditLedger = require("../models/CreditLedger");
const CreditTopup = require("../models/CreditTopup");
const Counter = require("../models/Counter");
const Tenant = require("../models/Tenant");

const U = cfg.UNIT;
const toUnits = (c) => Math.round(c * U);
const toCredits = (u) => u / U;
const round2 = (n) => Math.round(n * 100) / 100;
const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const mask = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.length > 6 ? `${d.slice(0, 2)}******${d.slice(-4)}` : "****";
};

/** True when this clinic pays for WhatsApp with credits. No wallet = not metered = free, as before. */
async function isMetered(tenantId) {
  if (!tenantId) return false;
  return !!(await CreditWallet.exists({ tenantId, metered: true }));
}

function activeBonus(w) {
  return w.bonusExpiresAt && w.bonusExpiresAt > new Date() ? w.bonusBalance || 0 : 0;
}

/**
 * Take the price of one message BEFORE sending it. Atomic: the balance check is part of the update filter,
 * so two parallel sends can never spend the same credit. Bonus credits are spent first.
 * `kind` is the template key (appointment_reminder, birthday_wish, ...) and picks the rate.
 * Returns { ok:true, free:true } (not metered), { ok:true, ledgerId } (charged) or { ok:false, reason }.
 */
async function reserve(tenantId, { kind, phone }) {
  const w = await CreditWallet.findOne({ tenantId, metered: true }).select("dailyCap dayKey").lean();
  if (!w) return { ok: true, free: true };

  const cost = toUnits(cfg.RATES[kind] ?? cfg.DEFAULT_RATE);
  const key = istDay();
  if (w.dayKey !== key) await CreditWallet.updateOne({ _id: w._id, dayKey: { $ne: key } }, { $set: { dayKey: key, dayCount: 0 } });
  const cap = { dayCount: { $lt: w.dailyCap || cfg.DAILY_CAP } };

  let bucket = "bonus";
  let r = await CreditWallet.updateOne(
    { _id: w._id, ...cap, bonusBalance: { $gte: cost }, bonusExpiresAt: { $gt: new Date() } },
    { $inc: { bonusBalance: -cost, dayCount: 1 } },
  );
  if (!r.modifiedCount) {
    bucket = "main";
    r = await CreditWallet.updateOne({ _id: w._id, ...cap, balance: { $gte: cost } }, { $inc: { balance: -cost, dayCount: 1 } });
  }
  if (!r.modifiedCount) {
    const cur = await CreditWallet.findById(w._id).select("dayCount dailyCap").lean();
    const reason = cur.dayCount >= (cur.dailyCap || cfg.DAILY_CAP) ? "daily_cap" : "low_balance";
    await CreditLedger.create({ tenantId, type: "skipped", units: 0, event: kind, phone: mask(phone), status: "skipped", note: reason });
    checkLow(tenantId).catch(() => {});
    return { ok: false, reason };
  }

  try {
    const row = await CreditLedger.create({ tenantId, type: "debit", units: -cost, bucket, event: kind, phone: mask(phone), status: "reserved" });
    checkLow(tenantId).catch(() => {});
    return { ok: true, ledgerId: row._id };
  } catch (e) {
    // could not record the debit: give the credit back rather than charge without a trace
    await CreditWallet.updateOne({ _id: w._id }, { $inc: bucket === "bonus" ? { bonusBalance: cost } : { balance: cost } });
    throw e;
  }
}

/** Meta accepted the message: remember its id (lets a failed delivery be refunded if a status webhook is ever added). */
async function commit(hold, wamid) {
  if (!hold || hold.free || !hold.ledgerId) return;
  await CreditLedger.updateOne({ _id: hold.ledgerId, status: "reserved" }, { $set: { status: "sent", wamid: wamid || undefined } });
}

async function refundWhere(filter, note) {
  // flipping status is the claim: a second refund attempt finds nothing to flip
  const row = await CreditLedger.findOneAndUpdate({ ...filter, type: "debit", status: { $in: ["reserved", "sent"] } }, { $set: { status: "refunded", note } });
  if (!row) return false;
  await CreditWallet.updateOne({ tenantId: row.tenantId }, { $inc: row.bucket === "bonus" ? { bonusBalance: -row.units } : { balance: -row.units } });
  await CreditLedger.create({ tenantId: row.tenantId, type: "refund", units: -row.units, bucket: row.bucket, event: row.event, phone: row.phone, refId: `refund:${row._id}`, note });
  return true;
}

/** Message was never sent (Meta rejected it / network error). */
const refund = (hold, note = "send_failed") => (hold && hold.ledgerId ? refundWhere({ _id: hold.ledgerId }, note) : false);
const refundByWamid = (wamid, note = "delivery_failed") => (wamid ? refundWhere({ wamid }, note) : false);

async function getBalance(tenantId) {
  const w = await CreditWallet.findOne({ tenantId }).lean();
  if (!w || !w.metered) return { metered: false };
  const bonus = activeBonus(w);
  const total = w.balance + bonus;
  return {
    metered: true,
    balance: toCredits(w.balance),
    bonus: toCredits(bonus),
    bonusExpiresAt: bonus ? w.bonusExpiresAt : null,
    total: toCredits(total),
    low: total < toUnits(cfg.LOW_BALANCE_CREDITS),
    zero: total <= 0,
    dailyCap: w.dailyCap || cfg.DAILY_CAP,
    ratePerMessage: cfg.DEFAULT_RATE,
    rates: { message: cfg.DEFAULT_RATE, birthday: cfg.RATES.birthday_wish ?? cfg.DEFAULT_RATE },
  };
}

/** Free credits (subscription bonus, manual gift). refId makes it safe to call twice. Bonus bucket expires. */
async function grantBonus(tenantId, { credits, days = cfg.BONUS_DAYS, refId, note }) {
  const units = toUnits(credits);
  try {
    await CreditLedger.create({ tenantId, type: "bonus", units, bucket: "bonus", refId, note });
  } catch (e) {
    if (e.code === 11000) return false; // already granted
    throw e;
  }
  const expires = new Date(Date.now() + days * 86400000);
  await CreditWallet.updateOne(
    { tenantId },
    { $inc: { bonusBalance: units }, $set: { alerted: null }, $max: { bonusExpiresAt: expires } },
    { upsert: true },
  );
  return true;
}

/** Turn metering on for a clinic (creates the wallet). */
async function enable(tenantId) {
  await CreditWallet.updateOne({ tenantId }, { $set: { metered: true }, $setOnInsert: { balance: 0, bonusBalance: 0 } }, { upsert: true });
}

/** Called when a plan payment completes. New metered clinics get the bonus once per payment (refId = payment id). */
async function onSubscriptionPaid(tenantId, { amountPaid, refId }) {
  if (process.env.CREDITS_FOR_NEW_SIGNUPS === "true" && !(await CreditWallet.exists({ tenantId }))) await enable(tenantId);
  if (!(await isMetered(tenantId))) return;
  const credits = cfg.bonusFor(amountPaid);
  if (!credits) return;
  await grantBonus(tenantId, { credits, refId: `sub:${refId}`, note: "Plan purchase bonus" });
}

// ---- top-up (Razorpay) ------------------------------------------------------

function razorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay credentials not configured");
  return { client: new Razorpay({ key_id, key_secret }), key_id, key_secret };
}

function verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const { key_secret } = razorpayClient();
  const expected = crypto.createHmac("sha256", key_secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(razorpaySignature || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createTopup(user, packId) {
  const pack = cfg.PACKS.find((p) => p.id === packId);
  if (!pack) throw Object.assign(new Error("Unknown credit pack"), { status: 400 });
  if (!(await isMetered(user.tenantId))) throw Object.assign(new Error("Credits are not enabled for your clinic"), { status: 400 });
  const gst = round2((pack.price * cfg.GST_PCT) / 100);
  const total = round2(pack.price + gst);
  const { client, key_id } = razorpayClient();
  const order = await client.orders.create({
    amount: Math.round(total * 100),
    currency: "INR",
    receipt: `cr_${String(user.tenantId).slice(-10)}_${Date.now()}`,
    notes: { kind: "credits", tenantId: String(user.tenantId) },
  });
  await CreditTopup.create({ tenantId: user.tenantId, user: user._id, packId, credits: pack.credits, price: pack.price, gst, total, orderId: order.id });
  return { orderId: order.id, keyId: key_id, amount: total, currency: "INR", pack: { ...pack, gst, total } };
}

/**
 * Credit the wallet for a paid order. Called by the browser verify call AND the Razorpay webhook; whichever
 * arrives first wins the atomic created->paid flip, the other one is a no-op.
 * ponytail: a process crash between the flip and the wallet update loses that top-up; reconcile by hand from Razorpay.
 */
async function completeTopup({ orderId, paymentId }) {
  const t = await CreditTopup.findOneAndUpdate({ orderId, status: "created" }, { $set: { status: "paid", paymentId, paidAt: new Date() } }, { new: true });
  if (!t) return null;
  try {
    const seq = await Counter.next("ncCreditInvoice", () => CreditTopup.countDocuments({ invoiceNumber: { $exists: true } }));
    t.invoiceNumber = `CR-NC-${String(seq).padStart(4, "0")}`;
    await t.save();
    await CreditWallet.updateOne({ tenantId: t.tenantId }, { $inc: { balance: toUnits(t.credits) }, $set: { alerted: null } });
  } catch (e) {
    await CreditTopup.updateOne({ _id: t._id }, { $set: { status: "created" } }); // nothing credited yet: let a retry run
    throw e;
  }
  await CreditLedger.create({ tenantId: t.tenantId, type: "topup", units: toUnits(t.credits), bucket: "main", refId: paymentId, note: `${t.invoiceNumber} (Rs ${t.total} incl. GST)` }).catch((e) =>
    console.error("[Credits] topup credited but ledger row failed:", e.message),
  );
  return t;
}

/**
 * NestDoc has no payment webhook, so an order paid in a tab that then closed is credited here: ask Razorpay whether
 * the pending orders (last 24h) were paid. Safe to call often (completeTopup is idempotent) - it only does work when
 * a pending order exists.
 */
async function syncPending(tenantId) {
  const pending = await CreditTopup.find({ tenantId, status: "created", createdAt: { $gt: new Date(Date.now() - 24 * 3600 * 1000) } }).select("orderId").limit(5).lean();
  if (!pending.length) return 0;
  const { client } = razorpayClient();
  let credited = 0;
  for (const p of pending) {
    try {
      const pays = await client.orders.fetchPayments(p.orderId);
      const paid = (pays.items || []).find((x) => x.status === "captured");
      if (paid && (await completeTopup({ orderId: p.orderId, paymentId: paid.id }))) credited++;
    } catch (e) {
      console.error("[Credits] syncPending:", e.message);
    }
  }
  return credited;
}

// ---- low balance alert ------------------------------------------------------

async function checkLow(tenantId) {
  const w = await CreditWallet.findOne({ tenantId, metered: true }).lean();
  if (!w) return;
  const total = w.balance + activeBonus(w);
  const level = total <= 0 ? "zero" : total < toUnits(cfg.LOW_BALANCE_CREDITS) ? "low" : null;
  if (!level || w.alerted === level) return;
  // only one worker wins this flip, so one email per level
  const flip = await CreditWallet.updateOne({ _id: w._id, alerted: w.alerted ?? null }, { $set: { alerted: level } });
  if (!flip.modifiedCount) return;
  const tenant = await Tenant.findById(tenantId).select("name contact.email");
  if (!tenant?.contact?.email) return;
  await require("./notify").sendLowCreditsEmail({ to: tenant.contact.email, name: tenant.name, credits: toCredits(Math.max(total, 0)), zero: level === "zero" });
}

module.exports = { toUnits, toCredits, isMetered, reserve, commit, refund, refundByWamid, getBalance, grantBonus, enable, onSubscriptionPaid, createTopup, completeTopup, verifySignature, syncPending };
