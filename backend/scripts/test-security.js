// Password policy, change-password, sign-out-everywhere and the "require MFA" policy on a THROWAWAY in-memory DB:
//   node scripts/test-security.js
const assert = require("assert");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

(async () => {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = rs.getUri("nestdoc_sec");
  process.env.JWT_SECRET = "security-secret-security-secret-1234";
  process.env.NODE_ENV = "test";
  process.env.PORT = "5094";
  require("../server");
  await new Promise((r) => setTimeout(r, 2500));
  const base = "http://localhost:5094/api";
  let token = "";
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(token && { Authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const weak = await call("POST", "/auth/register", { name: "Own Er", email: "o@sec.test", phone: "9876543210", password: "Passw0rdA", acceptTerms: true });
  assert.strictEqual(weak.status, 400, "weak/common password refused: " + JSON.stringify(weak.body));

  const reg = await call("POST", "/auth/register", { name: "Own Er", email: "o@sec.test", phone: "9876543210", password: "Kx7#mQv29!", acceptTerms: true });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  token = reg.body.data.token;
  assert.strictEqual((await call("POST", "/auth/onboard", { orgName: "Sec Clinic", orgType: "clinic", city: "Pune", state: "MH", doctorCount: 1 })).status, 201);
  assert.strictEqual((await call("POST", "/legal/accept", {})).status, 200);

  // change password: wrong current, weak new, reuse, ok
  assert.strictEqual((await call("PUT", "/auth/change-password", { currentPassword: "nope", newPassword: "Zq4#Lm82Rt!v" })).status, 400);
  assert.strictEqual((await call("PUT", "/auth/change-password", { currentPassword: "Kx7#mQv29!", newPassword: "abcd1234" })).status, 400);
  assert.strictEqual((await call("PUT", "/auth/change-password", { currentPassword: "Kx7#mQv29!", newPassword: "Kx7#mQv29!" })).status, 400, "cannot reuse");
  const ch = await call("PUT", "/auth/change-password", { currentPassword: "Kx7#mQv29!", newPassword: "Zq4#Lm82Rt!v" });
  assert.strictEqual(ch.status, 200, JSON.stringify(ch.body));
  const old = token;
  token = ch.body.data.token;
  assert.strictEqual((await call("GET", "/auth/me")).status, 200, "this device stays signed in");
  token = old;
  assert.strictEqual((await call("GET", "/auth/me")).status, 401, "old token is signed out");
  token = ch.body.data.token;

  // owner turns on the MFA policy -> app routes refused until 2FA is set up
  assert.strictEqual((await call("PUT", "/tenants/security", { requireMfa: true })).status, 200);
  const blocked = await call("GET", "/patients");
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(blocked.body.code, "MFA_REQUIRED");
  assert.strictEqual((await call("POST", "/auth/2fa/totp/setup")).status, 200, "auth routes stay open");

  // sign out everywhere
  assert.strictEqual((await call("POST", "/auth/logout-all")).status, 200);
  assert.strictEqual((await call("GET", "/auth/me")).status, 401);

  console.log("SECURITY OK");
  await rs.stop();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
