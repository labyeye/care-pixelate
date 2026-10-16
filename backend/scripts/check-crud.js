// Offline check of the delete guards: staff, branch, draft consultation (models stubbed).
process.env.JWT_SECRET = "test";
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

const deleted = [];
const users = { staff1: { _id: "staff1", role: "nurse" }, owner: { _id: "owner", role: "tenant_owner" }, me: { _id: "me", role: "hospital_admin" } };
let clinicRefs = true;

stub("models/User.js", { findOne: async (q) => users[q._id] || null, deleteOne: async (q) => deleted.push(["user", q._id]) });
stub("models/StaffProfile.js", { deleteOne: async () => deleted.push(["profile"]) });
stub("models/Doctor.js", { updateMany: async () => deleted.push(["unlink-doctor"]), exists: async () => (clinicRefs ? { _id: "d" } : null) });
stub("models/Tenant.js", {});
stub("models/Appointment.js", { exists: async () => null });
stub("models/Patient.js", {});
stub("models/Compliance.js", {
  AuditLog: {}, AbhaLink: {}, ConsentLog: {},
  Clinic: { findOneAndDelete: async () => ({ _id: "c1" }) },
});
const consults = { draft: { status: "draft" } };
stub("models/Consultation.js", { findOneAndDelete: async (q) => (q.status === "draft" && q._id === "draft" ? consults.draft : null) });
stub("models/Invoice.js", {}); stub("models/LabOrder.js", {});

const staff = require("../controllers/staffController");
const comp = require("../controllers/complianceController");
const consult = require("../controllers/consultationController");

const call = async (fn, req) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  try { await fn({ tenantId: "t1", user: { _id: "me" }, params: {}, body: {}, query: {}, ...req }, res, (e) => { throw e; }); } catch (e) { res.err = e.message; }
  return res;
};

(async () => {
  let r = await call(staff.remove, { params: { id: "me" } });
  assert.strictEqual(r.code, 400); // cannot delete yourself

  r = await call(staff.remove, { params: { id: "owner" } });
  assert.strictEqual(r.code, 403); // owners are not removable here
  assert.strictEqual(deleted.length, 0);

  r = await call(staff.remove, { params: { id: "staff1" } });
  assert.strictEqual(r.code, 200, r.err);
  assert.deepStrictEqual(deleted.map((d) => d[0]).sort(), ["profile", "unlink-doctor", "user"]);

  r = await call(staff.remove, { params: { id: "ghost" } });
  assert.strictEqual(r.code, 404);

  r = await call(comp.clinicDelete, { params: { id: "c1" } });
  assert.strictEqual(r.code, 409); // doctors point at it
  clinicRefs = false;
  r = await call(comp.clinicDelete, { params: { id: "c1" } });
  assert.strictEqual(r.code, 200, r.err);

  r = await call(consult.discard, { params: { id: "draft" } });
  assert.strictEqual(r.code, 200, r.err);
  r = await call(consult.discard, { params: { id: "signed" } });
  assert.strictEqual(r.code, 409); // signed records are permanent
  console.log("crud guards ok");
})();
