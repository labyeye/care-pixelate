// WhatsApp credits on a THROWAWAY in-memory database, Meta/Razorpay/email mocked:  node scripts/check-credits.js
// Needs a real mongod (memory server) because the point is that parallel sends cannot overspend.
const assert = require("assert");
const path = require("path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// no real Razorpay / email in a check
let orderSeq = 0;
const paidOrders = new Set();
const stub = (id, exports) => {
  const p = require.resolve(id);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
process.env.RAZORPAY_KEY_ID = "rzp_test_x";
process.env.RAZORPAY_KEY_SECRET = "secret";
stub("razorpay", function Razorpay() {
  this.orders = {
    create: async () => ({ id: `order_${++orderSeq}` }),
    fetchPayments: async (id) => ({ items: paidOrders.has(id) ? [{ id: `pay_${id}`, status: "captured" }] : [] }),
  };
});
const mails = [];
stub(path.resolve(__dirname, "..", "utils", "notify.js"), { sendLowCreditsEmail: async (m) => mails.push(m) });

const oid = () => new mongoose.Types.ObjectId();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("credits_check"));

  const credits = require("../utils/credits");
  const CreditWallet = require("../models/CreditWallet");
  const CreditLedger = require("../models/CreditLedger");
  const CreditTopup = require("../models/CreditTopup");
  await Promise.all([CreditWallet.init(), CreditLedger.init(), CreditTopup.init()]);

  // 1. no wallet = not metered = free
  const free = oid();
  assert.deepStrictEqual(await credits.reserve(free, { kind: "appointment_reminder", phone: "919876543210" }), { ok: true, free: true });

  // 2. 20 parallel sends on 1 credit at 0.2 each: exactly 5 get through, balance never negative
  const c = oid();
  await credits.enable(c);
  await CreditWallet.updateOne({ tenantId: c }, { $set: { balance: credits.toUnits(1) } });
  const holds = await Promise.all(Array.from({ length: 20 }, () => credits.reserve(c, { kind: "appointment_reminder", phone: "919876543210" })));
  const okHolds = holds.filter((h) => h.ok);
  assert.strictEqual(okHolds.length, 5, "only 5 of 20 may be charged");
  assert.strictEqual((await CreditWallet.findOne({ tenantId: c })).balance, 0);
  assert.strictEqual(await CreditLedger.countDocuments({ tenantId: c, type: "skipped" }), 15, "skipped sends are logged");

  // 3. refund gives the credit back exactly once; message id remembered
  assert.strictEqual(await credits.refund(okHolds[0]), true);
  assert.strictEqual(await credits.refund(okHolds[0]), false, "second refund is a no-op");
  const h = await credits.reserve(c, { kind: "appointment_reminder", phone: "919876543210" });
  await credits.commit(h, "wamid.ABC");
  assert.strictEqual(await credits.refundByWamid("wamid.ABC"), true);
  assert.strictEqual(await credits.refundByWamid("wamid.ABC"), false);
  assert.strictEqual((await credits.getBalance(c)).total, 0.2);

  // 4. bonus: idempotent, spent first, expires; plan-purchase bonus is 10% of what was paid
  assert.strictEqual(await credits.grantBonus(c, { credits: 1, refId: "x:1" }), true);
  assert.strictEqual(await credits.grantBonus(c, { credits: 1, refId: "x:1" }), false, "same refId never pays twice");
  const r = await credits.reserve(c, { kind: "appointment_reminder", phone: "919876543210" });
  assert.strictEqual((await CreditLedger.findById(r.ledgerId)).bucket, "bonus", "bonus is spent first");
  await CreditWallet.updateOne({ tenantId: c }, { $set: { bonusExpiresAt: new Date(Date.now() - 1000) } });
  assert.strictEqual((await credits.getBalance(c)).bonus, 0, "expired bonus does not count");
  const bz = oid();
  await credits.enable(bz);
  await credits.onSubscriptionPaid(bz, { amountPaid: 5310, refId: "pay_1" }); // Rs 4,500 + GST
  await credits.onSubscriptionPaid(bz, { amountPaid: 5310, refId: "pay_1" });
  assert.strictEqual((await credits.getBalance(bz)).bonus, 500, "10% of 5310 = 531, rounded down to 500, granted once");

  // 5. top-up: browser verify and the Razorpay lookup race, credited once
  const t = oid();
  await credits.enable(t);
  const order = await credits.createTopup({ _id: oid(), tenantId: t }, "p1000");
  assert.strictEqual(order.pack.total, 1180, "Rs 1000 + 18% GST");
  const results = await Promise.all([
    credits.completeTopup({ orderId: order.orderId, paymentId: "pay_1" }),
    credits.completeTopup({ orderId: order.orderId, paymentId: "pay_1" }),
  ]);
  assert.strictEqual(results.filter(Boolean).length, 1, "exactly one caller credits the wallet");
  assert.strictEqual((await credits.getBalance(t)).total, 1000);
  assert.match((await CreditTopup.findOne({ orderId: order.orderId })).invoiceNumber, /^CR-NC-\d{4}$/);
  await assert.rejects(credits.createTopup({ _id: oid(), tenantId: free }, "p1000"), /not enabled/, "unmetered clinic cannot top up");
  await assert.rejects(credits.createTopup({ _id: oid(), tenantId: t }, "nope"), /Unknown/);

  // 5b. no webhook in NestDoc: an order paid in a tab that closed is found by asking Razorpay
  const t2 = oid();
  await credits.enable(t2);
  const o2 = await credits.createTopup({ _id: oid(), tenantId: t2 }, "p500");
  assert.strictEqual(await credits.syncPending(t2), 0, "not paid yet: nothing credited");
  paidOrders.add(o2.orderId);
  assert.strictEqual(await credits.syncPending(t2), 1, "paid at Razorpay: credited");
  assert.strictEqual(await credits.syncPending(t2), 0, "and only once");
  assert.strictEqual((await credits.getBalance(t2)).total, 500);
  assert.strictEqual((await CreditTopup.findOne({ orderId: o2.orderId })).invoiceNumber, "CR-NC-0002", "numbers keep counting");

  // 6. daily cap stops a runaway loop
  const d = oid();
  await credits.enable(d);
  await CreditWallet.updateOne({ tenantId: d }, { $set: { balance: credits.toUnits(100), dailyCap: 3 } });
  const capped = await Promise.all(Array.from({ length: 6 }, () => credits.reserve(d, { kind: "appointment_reminder", phone: "919876543210" })));
  assert.strictEqual(capped.filter((x) => x.ok).length, 3);
  assert.strictEqual(capped.find((x) => !x.ok).reason, "daily_cap");

  // 7. low-balance email: one per level
  const l = oid();
  await mongoose.connection.collection("tenants").insertOne({ _id: l, slug: "care-clinic", name: "Care Clinic", contact: { email: "owner@care.test" } });
  await credits.enable(l);
  await CreditWallet.updateOne({ tenantId: l }, { $set: { balance: credits.toUnits(50.2) } });
  await credits.reserve(l, { kind: "appointment_reminder", phone: "919876543210" }); // exactly 50: not low yet
  await sleep(150);
  assert.strictEqual(mails.length, 0);
  await credits.reserve(l, { kind: "appointment_reminder", phone: "919876543210" });
  await credits.reserve(l, { kind: "appointment_reminder", phone: "919876543210" });
  await sleep(150);
  assert.strictEqual(mails.length, 1, "one 'low' email, not one per message");

  // 8. end to end through sendTemplate with the Meta call stood in by the driver seam
  const wa = require("../utils/whatsapp");
  const MessageLog = require("../models/MessageLog");
  const sent = [];
  let metaOk = true;
  wa._driver.isConnected = () => true;
  wa._driver.deliver = async ({ template }) => {
    if (!metaOk) throw new Error("rejected");
    sent.push(template.key);
    return { id: `wamid.${sent.length}` };
  };
  const g = oid();
  await mongoose.connection.collection("tenants").insertOne({ _id: g, slug: "care", name: "Care", whatsapp: { enabled: true, disabledTemplates: ["payment_receipt"] } });
  await credits.enable(g);
  await CreditWallet.updateOne({ tenantId: g }, { $set: { balance: credits.toUnits(1.5) } });
  const bal = async () => (await credits.getBalance(g)).total;
  const send = (key) => wa.sendTemplate({ tenantId: g, key, to: "9876543210", vars: { patient: "Asha" } });

  assert.strictEqual((await send("appointment_reminder")).sent, true);
  assert.strictEqual(await bal(), 1.3, "a reminder costs 0.2");
  assert.strictEqual((await send("birthday_wish")).sent, true);
  assert.strictEqual(await bal(), 0.3, "a birthday wish is marketing: 1.0");

  assert.strictEqual((await send("payment_receipt")).status, "skipped", "switched-off message never charges");
  assert.strictEqual(await bal(), 0.3);

  metaOk = false; // send fails: the credit comes back
  assert.strictEqual((await send("appointment_reminder")).status, "failed");
  assert.strictEqual(await bal(), 0.3, "failed send is refunded");
  metaOk = true;

  const noCred = await send("birthday_wish"); // 0.3 < 1.0
  assert.strictEqual(noCred.sent, false);
  assert.strictEqual(noCred.code, "NO_CREDITS");
  assert.strictEqual(noCred.reason, "Not enough WhatsApp credits");
  assert.strictEqual(sent.length, 2, "nothing went out");
  assert.ok(await MessageLog.findOne({ tenantId: g, template: "birthday_wish", status: "skipped" }), "the clinic can see it was skipped");
  assert.strictEqual(await bal(), 0.3);

  wa._driver.isConnected = () => false; // not connected: nothing is reserved, so nothing is charged
  assert.strictEqual((await send("appointment_reminder")).status, "not_connected");
  assert.strictEqual(await bal(), 0.3, "not connected = not charged");

  console.log("credits checks passed");
  await mongoose.disconnect();
  await mongod.stop();
})().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
