// Offline check of the summary endpoint: shape + role gating of money/audit figures (models stubbed).
process.env.JWT_SECRET = "test";
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};
const counter = { countDocuments: async () => 7 };
for (const m of ["Patient", "Doctor", "User", "Appointment", "LabOrder", "Consultation"]) stub(`models/${m}.js`, counter);
stub("models/Invoice.js", {
  aggregate: async () => [
    { _id: "paid", n: 2, billed: 1000, paid: 1000 },
    { _id: "partial", n: 1, billed: 900, paid: 300 },
    { _id: "unpaid", n: 1, billed: 500, paid: 0 },
  ],
});
stub("models/Compliance.js", {
  Clinic: counter,
  AuditLog: { aggregate: async () => [{ _id: "view", n: 5 }, { _id: "update", n: 2 }, { _id: "denied", n: 1 }] },
});
const { summary } = require("../controllers/summaryController");

const call = async (role) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await summary({ tenantId: "64b0f0f0f0f0f0f0f0f0f0f0", user: { role }, query: {} }, res, (e) => { throw e; });
  return res.body.data;
};

(async () => {
  const admin = await call("tenant_owner");
  assert.strictEqual(admin.patients.total, 7);
  assert.deepStrictEqual([admin.invoices.billed, admin.invoices.collected, admin.invoices.outstanding], [2400, 1300, 1100]);
  assert.deepStrictEqual([admin.invoices.unpaid, admin.invoices.partial, admin.invoices.paid], [1, 1, 2]);
  assert.deepStrictEqual(admin.auditToday, { events: 8, views: 5, changes: 2, denied: 1 });

  const doctor = await call("doctor");
  assert.strictEqual(doctor.invoices, null, "doctors never see money totals");
  assert.strictEqual(doctor.auditToday, null, "audit counts are admin-only");
  assert.strictEqual(doctor.appointments.today, 7);
  console.log("summary ok");
})();
