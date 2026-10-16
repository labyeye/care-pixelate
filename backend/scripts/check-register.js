// Offline check of registerTenant (models stubbed; never touches Mongo).
process.env.JWT_SECRET = "test";
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};
const users = [], tenants = [], subs = [];
let failSub = false;
const User = { findOne: async () => null, create: async (d) => { const u = { ...d, save: async () => {} }; users.push(u); return u; }, deleteOne: async ({ _id }) => { users.splice(users.findIndex((u) => u._id === _id), 1); } };
const Tenant = { schema: { path: () => ({ enumValues: ["clinic"] }) }, create: async (d) => { const t = { ...d, _id: "t1" }; tenants.push(t); return t; }, deleteOne: async () => { tenants.pop(); } };
const Subscription = { create: async (d) => { if (failSub) throw new Error("boom"); subs.push(d); } };
stub("models/User.js", User); stub("models/Tenant.js", Tenant); stub("models/Subscription.js", Subscription);
const { registerTenant } = require("../controllers/authController");

const call = async (body) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, cookie() {}, json(b) { this.body = b; return this; } };
  try { await registerTenant({ body }, res, (e) => { throw e; }); } catch (e) { res.err = e.message; }
  return res;
};
const ok = { orgName: "Sun Clinic", orgType: "clinic", ownerName: "Dr A", email: "A@x.com", password: "Passw0rdX", phone: "+91 98765 43210", acceptTerms: true };

(async () => {
  assert.match((await call({ ...ok, password: "weak" })).err, /Password/);
  assert.match((await call({ ...ok, acceptTerms: false })).err, /Terms/);
  assert.match((await call({ ...ok, phone: "123" })).err, /phone/i);
  assert.match((await call({ ...ok, orgType: "zoo" })).err, /organisation type/);
  const r = await call(ok);
  assert.strictEqual(r.code, 201);
  assert.strictEqual(users[0].phone, "9876543210");
  assert.strictEqual(users[0].email, "a@x.com");
  assert.strictEqual(tenants[0].limits.doctorLimit, 1);
  failSub = true;
  const before = users.length;
  assert.match((await call(ok)).err, /boom/);
  assert.strictEqual(users.length, before, "rollback removed the user");
  console.log("register ok");
})();
