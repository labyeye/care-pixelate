// Offline check of invoice creation + lab order flow (models stubbed; never touches Mongo).
// The atomic overpay guard in addPayment is a Mongo $expr query and needs a live DB to exercise.
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

let counters = { invoice: 0, lab: 0 };
const invoices = [];
const labs = [];
stub("models/Tenant.js", { findByIdAndUpdate: (id, upd) => ({ select: async () => { for (const k of Object.keys(upd.$inc)) counters[k.split(".")[1]]++; return { counters }; } }) });
stub("models/Patient.js", { exists: async (q) => (q._id === "p1" ? { _id: "p1" } : null) });
stub("models/Doctor.js", { exists: async (q) => (q._id === "d1" ? { _id: "d1" } : null) });
stub("models/Appointment.js", {});
stub("models/Invoice.js", { create: async (d) => (invoices.push(d), d) });
stub("models/LabOrder.js", {
  create: async (d) => {
    const o = { status: "ordered", ...d, save: async function () { return this; } };
    labs.push(o);
    return o;
  },
  findOne: async () => labs[0] || null,
});

const inv = require("../controllers/invoiceController");
const lab = require("../controllers/labController");

const call = async (fn, req) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try { await fn({ tenantId: "t1", user: { _id: "u1" }, params: {}, query: {}, ...req }, res, (e) => { throw e; }); } catch (e) { res.err = e.message; }
  return res;
};

(async () => {
  let r = await call(inv.create, { body: { patientId: "p1", items: [{ description: "Consult", rate: 500 }], discount: 100 } });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(invoices[0].total, 400);
  assert.match(invoices[0].number, /^INV-\d{4}-00001$/);

  r = await call(inv.create, { body: { patientId: "nobody", items: [{ description: "x", rate: 1 }] } });
  assert.strictEqual(r.code, 400);
  r = await call(inv.create, { body: { patientId: "p1", items: [{ description: "x", rate: 10 }], discount: 99 } });
  assert.strictEqual(r.code, 400);
  r = await call(inv.addPayment, { params: { id: "i" }, body: { amount: -5, mode: "cash" } });
  assert.strictEqual(r.code, 400);
  r = await call(inv.addPayment, { params: { id: "i" }, body: { amount: 5, mode: "bitcoin" } });
  assert.strictEqual(r.code, 400);

  assert.strictEqual(lab.flagFor({ result: "4.1", refLow: 4.5, refHigh: 11 }), "low");
  assert.strictEqual(lab.flagFor({ result: "12", refLow: 4.5, refHigh: 11 }), "high");
  assert.strictEqual(lab.flagFor({ result: "7", refLow: 4.5, refHigh: 11 }), "normal");
  assert.strictEqual(lab.flagFor({ result: "Positive" }), "");

  r = await call(lab.create, { body: { patientId: "p1", doctorId: "d1", tests: [{ name: "CBC - WBC", unit: "x10^3/uL", refLow: 4.5, refHigh: 11 }, { name: "Hb", refLow: 12, refHigh: 16 }] } });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(labs[0].status, "ordered");

  r = await call(lab.update, { params: { id: "l" }, body: { tests: [{ name: "x", result: "7" }] } });
  assert.strictEqual(r.code, 400); // must cover every ordered test

  r = await call(lab.update, { params: { id: "l" }, body: { tests: [{ name: "x", result: "12.5", refLow: 4.5, refHigh: 11 }, { name: "x", result: "13", refLow: 12, refHigh: 16 }] } });
  assert.strictEqual(r.code, 200, r.err);
  assert.strictEqual(labs[0].status, "resulted");
  assert.strictEqual(labs[0].tests[0].name, "CBC - WBC"); // names cannot be rewritten
  assert.strictEqual(labs[0].tests[0].flag, "high");
  console.log("billing+lab ok");
})();
