// Offline check: invoice lines linked to clinical records (ownership, double-billing, price memory).
process.env.JWT_SECRET = "test";
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};
const LAB = "64b0f0f0f0f0f0f0f0f0f0a1", CONS = "64b0f0f0f0f0f0f0f0f0f0b2", APPT = "64b0f0f0f0f0f0f0f0f0f0c3", OTHER = "64b0f0f0f0f0f0f0f0f0f0d4";
const sel = (v) => ({ select: async () => v });
const billed = [];
const created = [];
let bulk = null;

stub("models/Tenant.js", { findByIdAndUpdate: () => ({ select: async () => ({ counters: { invoice: 1 } }) }) });
stub("models/Patient.js", { exists: async () => ({}) });
stub("models/Appointment.js", { findOne: (q) => sel(q._id === APPT ? { _id: APPT } : null) });
stub("models/LabOrder.js", { findOne: (q) => sel(q._id === LAB ? { tests: [{ name: "Hemoglobin" }, { name: "TSH" }] } : null) });
stub("models/Consultation.js", { findOne: (q) => sel(q._id === CONS ? { prescription: { items: [{ drug: "Paracetamol" }] } } : null) });
const chain = (rows) => { const c = { select: () => c, sort: () => c, limit: async () => rows, then: (r) => r(rows) }; return c; };
stub("models/PriceItem.js", { bulkWrite: async (ops) => { bulk = ops; }, find: () => chain([{ kind: "lab", name: "CBC", price: 350, gstRate: 0 }]) });
stub("models/Medicine.js", { countDocuments: async () => 1, find: () => chain([{ _id: "m1", name: "Paracetamol", strength: "500 mg", sellingPrice: 2.5, gstRate: 12, hsnCode: "3004", unit: "tablet", stockQty: 40, trackInventory: true, dosageForm: "tablet" }]) });
stub("models/Doctor.js", { exists: async (q) => (q._id === "d1" ? {} : null) });
stub("models/Invoice.js", { find: () => sel(billed), create: async (d) => (created.push(d), d) });

const { create, catalog } = require("../controllers/invoiceController");
const call = async (body) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try { await create({ tenantId: "t1", user: { _id: "u1" }, params: {}, query: {}, body }, res, (e) => { throw e; }); } catch (e) { res.err = e.message; }
  return res;
};
const line = (kind, refId, key, rate, description) => ({ description, qty: 1, rate, gstRate: 0, source: { kind, refId, key } });

(async () => {
  let r = await call({ patientId: "p1", rememberPrices: true, items: [line("lab", LAB, "Hemoglobin", 150, "Lab: Hemoglobin"), line("medicine", CONS, "Paracetamol", 20, "Medicine: Paracetamol"), line("appointment", APPT, "", 600, "Consultation")] });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(created[0].total, 770);
  assert.strictEqual(created[0].items[0].source.kind, "lab");
  assert.strictEqual(bulk.length, 2, "lab + medicine prices remembered, consultation fee is not a price-list item");
  assert.deepStrictEqual(bulk.map((o) => o.updateOne.filter.nameKey).sort(), ["hemoglobin", "paracetamol"]);

  // a record that is not this patient's / does not exist
  r = await call({ patientId: "p1", items: [line("lab", OTHER, "Hemoglobin", 150, "Lab: Hemoglobin")] });
  assert.strictEqual(r.code, 400);
  // a test name that is not in that lab order
  r = await call({ patientId: "p1", items: [line("lab", LAB, "Made-up test", 10, "Lab: x")] });
  assert.strictEqual(r.code, 400);

  // already on a live invoice
  billed.push({ items: [{ source: { kind: "lab", refId: LAB, key: "TSH" } }] });
  r = await call({ patientId: "p1", items: [line("lab", LAB, "tsh", 200, "Lab: TSH")] });
  assert.strictEqual(r.code, 409, r.err);
  assert.match(r.err, /already on another invoice/);

  // plain typed lines still work with no source
  r = await call({ patientId: "p1", items: [{ description: "Dressing", qty: 1, rate: 100, gstRate: 0 }] });
  assert.strictEqual(r.code, 201, r.err);
  // header fields + payment taken at the counter
  r = await call({ patientId: "p1", doctorId: "d1", dueDate: "2026-11-30", items: [{ description: "Consult", qty: 1, rate: 500, gstRate: 0 }], initialPayment: { amount: 200, mode: "upi", reference: "UPI123" } });
  assert.strictEqual(r.code, 201, r.err);
  const last = created[created.length - 1];
  assert.deepStrictEqual([last.paid, last.status, last.payments.length, last.doctorId], [200, "partial", 1, "d1"]);
  r = await call({ patientId: "p1", items: [{ description: "Consult", qty: 1, rate: 500 }], initialPayment: { amount: 600, mode: "cash" } });
  assert.strictEqual(r.code, 400); // more than the total
  r = await call({ patientId: "p1", items: [{ description: "Consult", qty: 1, rate: 500 }], initialPayment: { amount: 100, mode: "bitcoin" } });
  assert.strictEqual(r.code, 400);
  r = await call({ patientId: "p1", doctorId: "ghost", items: [{ description: "Consult", qty: 1, rate: 500 }] });
  assert.strictEqual(r.code, 400);
  r = await call({ patientId: "p1", items: [{ description: "Para", qty: 10, rate: 2.5, gstRate: 12, medicineId: "64b0f0f0f0f0f0f0f0f0f0e5", discountPercent: 10 }] });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(created[created.length - 1].items[0].amount, 22.5);

  // type-ahead: inventory medicine carries price/GST/HSN/unit/stock; price-list items follow
  const res2 = { json(b) { this.b = b; return this; } };
  await catalog({ tenantId: "t1", query: { q: "para" } }, res2, (e) => { throw e; });
  assert.deepStrictEqual([res2.b.data[0].kind, res2.b.data[0].rate, res2.b.data[0].gstRate, res2.b.data[0].hsnCode, res2.b.data[0].stock], ["medicine", 2.5, 12, "3004", 40]);
  assert.strictEqual(res2.b.data[0].label, "Paracetamol 500 mg");
  assert.strictEqual(res2.b.data[1].kind, "lab");
  const none = { json(b) { this.b = b; return this; } };
  await catalog({ tenantId: "t1", query: { q: "p" } }, none, (e) => { throw e; });
  assert.strictEqual(none.b.count, 0, "queries under 2 characters return nothing");
  console.log("billable api ok");
})();
