// Offline check of /auth/onboard: solo-doctor profile, custom clinic code, rollback (models stubbed).
process.env.JWT_SECRET = "test";
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

let user;
const tenants = [], doctors = [], taken = new Set(["taken-code"]);
let failSub = false;
stub("models/User.js", { findById: async () => user });
stub("models/Tenant.js", {
  schema: { path: () => ({ enumValues: ["clinic", "individual_doctor"] }) },
  exists: async (q) => (taken.has(q.slug) ? { _id: "x" } : null),
  create: async (d) => { const t = { ...d, _id: "t1" }; tenants.push(t); return t; },
  deleteOne: async () => { tenants.pop(); },
});
stub("models/Doctor.js", { create: async (d) => { const x = { ...d, _id: "d1" }; doctors.push(x); return x; }, deleteOne: async () => { doctors.pop(); } });
stub("models/Subscription.js", { create: async () => { if (failSub) throw new Error("boom"); } });
const { onboard } = require("../controllers/authController");

const call = async (body) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  user = { _id: "507f1f77bcf86cd799439011", name: "Dr. Anita K Sharma", email: "a@x.com", phone: "9876543210", tenantId: null, save: async () => {} };
  try { await onboard({ user: { _id: "u" }, body }, res, (e) => { throw e; }); } catch (e) { res.err = e.message; }
  return res;
};
const base = { orgName: "Sharma Clinic", orgType: "individual_doctor", city: "Pune", state: "MH", registrationNumber: "MMC-12345", registrationCouncil: "Maharashtra Medical Council" };

(async () => {
  assert.match((await call({ ...base, registrationNumber: "" })).err, /registration/i);
  assert.match((await call({ ...base, clinicCode: "Bad Code" })).err, /lowercase/);
  let r = await call({ ...base, clinicCode: "taken-code" });
  assert.strictEqual(r.code, 409);
  assert.match((await call({ ...base, consultationFee: -5 })).err, /fee/i);

  r = await call({ ...base, clinicCode: "dr-sharma", consultationFee: 600, doctorCount: 9 });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(tenants[0].slug, "dr-sharma");
  assert.strictEqual(tenants[0].profile.expectedDoctors, 1, "solo is always one doctor");
  assert.deepStrictEqual([doctors[0].userId, doctors[0].doctorId, doctors[0].firstName, doctors[0].middleName, doctors[0].lastName], ["507f1f77bcf86cd799439011", "DR-0001", "Anita", "K", "Sharma"]);
  assert.strictEqual(doctors[0].consultation.consultationFee, 600);
  assert.strictEqual(tenants[0].counters.doctor, 1);

  // a clinic (non-solo) needs no registration number and gets no doctor profile
  tenants.length = 0; doctors.length = 0;
  r = await call({ orgName: "City Clinic", orgType: "clinic", city: "Pune", state: "MH" });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(doctors.length, 0);
  assert.match(tenants[0].slug, /^city-clinic-/);

  // failure after the doctor was created removes both
  tenants.length = 0; doctors.length = 0; failSub = true;
  r = await call(base);
  assert.match(r.err, /boom/);
  assert.deepStrictEqual([tenants.length, doctors.length], [0, 0]);
  console.log("onboard ok");
})();
