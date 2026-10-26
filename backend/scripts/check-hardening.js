// Offline checks for the audit fixes (models stubbed; never touches Mongo): session revocation, login lock,
// OTP attempt budget, authenticator takeover, refresh ceiling.   Run: node scripts/check-hardening.js
process.env.JWT_SECRET = "test-secret";
const assert = require("assert");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

const calls = [];
let dbUser = null;
let candidates = [];
const User = {
  findById: (id) => {
    const q = Promise.resolve(dbUser);
    q.select = () => q;
    return q;
  },
  findOne: () => {
    const q = Promise.resolve(dbUser);
    q.select = () => q;
    return q;
  },
  find: () => {
    const q = Promise.resolve(candidates);
    q.select = () => q;
    q.limit = () => q;
    return q;
  },
  updateOne: async (...a) => calls.push(["updateOne", ...a]),
  updateMany: async (...a) => calls.push(["updateMany", ...a]),
  findByIdAndUpdate: async (...a) => calls.push(["findByIdAndUpdate", ...a]),
};
stub("models/User.js", User);
stub("models/Tenant.js", { findById: () => ({ select: async () => ({ status: "active", planExpiresAt: null, rolePermissions: {} }) }), schema: { path: () => ({ enumValues: [] }) } });
for (const m of ["Patient", "Doctor", "Subscription"]) stub(`models/${m}.js`, {});
stub("utils/limits.js", { assertWithinLimit: async () => {} });
stub("utils/notify.js", { sendWhatsAppOtp: async () => {}, sendPasswordResetEmail: async () => {} });
stub("utils/totp.js", { verifyToken: () => false, generateSecret: () => "S", qrFor: async () => ({}) });

const c = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const mkRes = () => ({ code: 200, cookies: {}, body: null, status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; }, cookie(k, v) { this.cookies[k] = v; }, clearCookie() {} });
const run = async (fn, req) => { const res = mkRes(); let err = null; await fn(req, res, (e) => { err = e; }); return { res, err }; };
const sign = (claims, secret = process.env.JWT_SECRET) => jwt.sign(claims, secret, { expiresIn: "15m" });
const otpHash = (otp) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`otp:${otp}`).digest("hex");

(async () => {
  // 1. protect(): stale tokenVersion, purpose tokens and foreign signatures are refused; a current token passes
  dbUser = { _id: "u1", role: "tenant_owner", status: "active", tenantId: "t1", tokenVersion: 1, termsVersion: require("../utils/terms").VERSION };
  const via = async (tok) => (await run(protect, { headers: { authorization: "Bearer " + tok }, cookies: {} })).err === undefined;
  assert.ok(await via(sign({ id: "u1", tv: 1 })), "current token works");
  assert.ok(!(await via(sign({ id: "u1", tv: 0 }))), "token from before a password change is refused");
  assert.ok(!(await via(sign({ id: "u1", tv: 1, purpose: "2fa" }))), "purpose token is not a session");
  assert.ok(!(await via(sign({ id: "u1", tv: 1 }, "other-secret"))), "foreign signature refused");

  // 2. login: wrong password counts, the 4th locks, a locked account is refused even with the right password
  dbUser = { _id: "u2", email: "a@b.co", failedLogins: 3, matchPassword: async () => false, status: "active" };
  calls.length = 0;
  let r = await run(c.login, { body: { email: "a@b.co", password: "x" } });
  assert.strictEqual(r.res.code, 429);
  assert.ok(calls.some((x) => x[0] === "updateOne" && x[2].$set && x[2].$set.lockUntil), "4th failure sets lockUntil");
  dbUser = { _id: "u2", email: "a@b.co", lockUntil: new Date(Date.now() + 60000), matchPassword: async () => true, status: "active" };
  r = await run(c.login, { body: { email: "a@b.co", password: "right" } });
  assert.strictEqual(r.res.code, 429, "locked account refused");
  r = await run(c.login, { body: { email: { $ne: 1 }, password: "x" } });
  assert.strictEqual(r.res.code, 400, "non-string e-mail rejected");

  // 3. OTP login: wrong code consumes the budget and the 5th miss burns the code; the right code still works before that
  const mk = (tries) => ({ _id: "p1", role: "patient", status: "active", loginOtpHash: otpHash("123456"), loginOtpTries: tries });
  candidates = [mk(4)];
  calls.length = 0;
  r = await run(c.loginVerifyOtp, { body: { phone: "9999999999", otp: "000000" } });
  assert.strictEqual(r.res.code, 401);
  assert.ok(calls.some((x) => x[0] === "updateMany" && x[2].$unset && x[2].$unset.loginOtpHash), "5th wrong guess burns the code");
  candidates = [mk(0)];
  r = await run(c.loginVerifyOtp, { body: { phone: "9999999999", otp: "123456" } });
  assert.strictEqual(r.res.code, 200, "right code logs in");
  assert.ok(r.res.body.data.token, "session token issued");
  assert.strictEqual(jwt.decode(r.res.body.data.token).tv, 0, "token carries tokenVersion");

  // 4. authenticator: setup must not overwrite an enabled one
  r = await run(c.totpSetup, { user: { _id: "u1", email: "a@b.co", totpEnabled: true }, body: {} });
  assert.strictEqual(r.res.code, 409);

  // 5. refresh: stale version and over-long sessions cannot be extended
  dbUser = { _id: "u1", status: "active", tokenVersion: 3 };
  const refreshWith = async (claims) => (await run(c.refresh, { cookies: { access_token: sign(claims) } })).res.code;
  const now = Math.floor(Date.now() / 1000);
  assert.strictEqual(await refreshWith({ id: "u1", tv: 3, ssa: now }), 200, "fresh session refreshes");
  assert.strictEqual(await refreshWith({ id: "u1", tv: 2, ssa: now }), 401, "stale tokenVersion cannot refresh");
  assert.strictEqual(await refreshWith({ id: "u1", tv: 3, ssa: now - 48 * 3600 }), 401, "session older than the ceiling cannot refresh");
  assert.strictEqual(await refreshWith({ id: "u1", tv: 3 }), 401, "token without a session start cannot refresh");

  console.log("all hardening checks passed");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
