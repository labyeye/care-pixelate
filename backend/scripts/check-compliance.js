// Offline check of Phase 5 guards: audit middleware, branch cap, ABHA format, scribe gating
// (models stubbed; the Anthropic call itself is never made).
const assert = require("assert");
const path = require("path");
const EventEmitter = require("events");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

const audits = [];
let plan = "starter";
let clinicCount = 1;
let modules = ["patients"];
stub("models/Compliance.js", {
  AuditLog: { create: async (d) => { audits.push(d); if (d.boom) throw new Error("db down"); } },
  Clinic: { countDocuments: async () => clinicCount, create: async (d) => d },
  AbhaLink: { findOneAndUpdate: async (_f, u) => u },
  ConsentLog: {},
});
stub("models/Tenant.js", { findById: () => ({ select: async () => ({ plan, activeModules: modules }) }) });
stub("models/Patient.js", { exists: async () => ({}) });

const audit = require("../middleware/audit");
const c = require("../controllers/complianceController");

const call = async (fn, req) => {
  const res = { code: 200, status(x) { this.code = x; return this; }, json(b) { this.body = b; return this; } };
  try { await fn({ tenantId: "t1", user: { _id: "u1" }, params: {}, query: {}, body: {}, ...req }, res, (e) => { throw e; }); } catch (e) { res.err = e.message; }
  return res;
};

(async () => {
  // audit: records who/what without a body, extracts the record id, tags sub-actions, skips anonymous
  const run = (req) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    audit("patient")({ method: "GET", ip: "1.1.1.1", query: {}, ...req }, res, () => {});
    res.emit("finish");
  };
  run({ originalUrl: "/api/patients/64b0f0f0f0f0f0f0f0f0f0f0?q=secret", user: { _id: "u1", role: "doctor", tenantId: "t1" } });
  run({ originalUrl: "/api/invoices/64b0f0f0f0f0f0f0f0f0f0f0/payments", method: "POST", user: { _id: "u1", role: "receptionist", tenantId: "t1" } });
  run({ originalUrl: "/api/patients", user: undefined });
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(audits.length, 2);
  assert.deepStrictEqual([audits[0].action, audits[0].resourceId, audits[0].path], ["view", "64b0f0f0f0f0f0f0f0f0f0f0", "/api/patients/64b0f0f0f0f0f0f0f0f0f0f0"]);
  assert.strictEqual(audits[1].action, "action");
  assert.ok(!("body" in audits[0]) && !JSON.stringify(audits[0]).includes("secret"), "query values never stored");

  // branch cap follows the plan
  let r = await call(c.clinicCreate, { body: { name: "B2", code: "b2" } });
  assert.strictEqual(r.code, 402);
  plan = "clinic";
  r = await call(c.clinicCreate, { body: { name: "B2", code: "b2" } });
  assert.strictEqual(r.code, 201, r.err);

  // ABHA: 14 digits, hyphens allowed, address must be @abdm/@sbx, verification is never auto-claimed
  r = await call(c.abhaPut, { params: { patientId: "p" }, body: { abhaNumber: "1234" } });
  assert.strictEqual(r.code, 400);
  r = await call(c.abhaPut, { params: { patientId: "p" }, body: { abhaNumber: "12-3456-7890-1234", abhaAddress: "x@gmail.com" } });
  assert.strictEqual(r.code, 400);
  r = await call(c.abhaPut, { params: { patientId: "p" }, body: { abhaNumber: "12-3456-7890-1234", abhaAddress: "rahul.s@abdm" } });
  assert.strictEqual(r.code, 200, r.err);
  assert.deepStrictEqual([r.body.data.abhaNumber, r.body.data.status], ["12345678901234", "unverified"]);

  // scribe: needs tenant opt-in, then a configured key
  const prevKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  r = await call(c.scribe, { body: { transcript: "short" } });
  assert.strictEqual(r.code, 400);
  r = await call(c.scribe, { body: { transcript: "Patient has fever for three days and cough." } });
  assert.strictEqual(r.code, 403); // module off
  modules = ["patients", "ai_scribe"];
  r = await call(c.scribe, { body: { transcript: "Patient has fever for three days and cough." } });
  assert.strictEqual(r.code, 503); // enabled but no server key
  if (prevKey) process.env.ANTHROPIC_API_KEY = prevKey;
  console.log("compliance ok");
})();
