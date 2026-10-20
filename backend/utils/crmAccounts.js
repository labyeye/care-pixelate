// One uniform account-management API for the Pixelate Nest CRM dashboard (final-pixelate), identical in every
// product backend. Each product supplies an adapter (utils/crmAdapter.js) that maps it onto its own models:
//   app.use("/api/crm/accounts", require("./utils/crmAccounts")("CRM_API_SECRET", require("./utils/crmAdapter")));
//
//   GET    /            list accounts  (?search=)              POST   /              create account + owner login
//   GET    /:id         account, subscription, users, meta     PATCH  /:id           edit account (profile/status)
//   PUT    /:id/subscription  plan, limits, validity, custom plan name/features
//   POST   /:id/users   add login      PATCH /users/:uid  edit / reset password      DELETE /users/:uid  remove login
// Guarded by the x-api-key header (shared secret), like the rest of /api/crm.
const crypto = require("crypto");
const express = require("express");

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
// Always satisfies STRONG (upper + lower + digit, 12 chars).
const genPassword = () => "Nh" + crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x") + "7";
const checkPassword = (p) => {
  if (p && !STRONG.test(p)) throw fail("Password needs 8+ characters with uppercase, lowercase and a number");
  return p || genPassword();
};
const cleanFeatures = (v) =>
  v === undefined ? undefined : (Array.isArray(v) ? v : String(v).split("\n")).map((f) => String(f).trim()).filter(Boolean).slice(0, 40);
const toDate = (v, name) => {
  const d = new Date(v);
  if (isNaN(d)) throw fail(`Invalid ${name}`);
  return d;
};
const addMonths = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.max(1, Math.min(36, Math.floor(Number(months) || 1))));
  return d;
};

module.exports = (secretEnv, adapter) => {
  const router = express.Router();
  router.use((req, res, next) => {
    const secret = process.env[secretEnv] || "";
    const a = Buffer.from(String(req.headers["x-api-key"] || ""));
    const b = Buffer.from(secret);
    if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(401).json({ success: false, message: "Unauthorized" });
    next();
  });
  const h = (fn) => async (req, res) => {
    try {
      res.status(fn.status || 200).json({ success: true, ...(await fn(req)) });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ success: false, message: "That email is already in use" });
      if (err.name === "CastError") return res.status(400).json({ success: false, message: "Invalid id" });
      if (err.name === "ValidationError") return res.status(400).json({ success: false, message: err.message });
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  };
  const created = (fn) => Object.assign(fn, { status: 201 });

  router.get("/", h(async (req) => ({ meta: adapter.meta, accounts: await adapter.list(String(req.query.search || "").trim().slice(0, 60)) })));
  router.post("/", h(created((req) => adapter.create(req.body || {}))));
  router.patch("/users/:uid", h((req) => adapter.updateUser(req.params.uid, req.body || {})));
  router.delete("/users/:uid", h(async (req) => { await adapter.deleteUser(req.params.uid); return {}; }));
  router.get("/:id", h(async (req) => ({ meta: adapter.meta, ...(await adapter.get(req.params.id)) })));
  router.patch("/:id", h((req) => adapter.updateAccount(req.params.id, req.body || {})));
  router.put("/:id/subscription", h((req) => adapter.setSubscription(req.params.id, req.body || {})));
  router.post("/:id/users", h(created((req) => adapter.createUser(req.params.id, req.body || {}))));
  return router;
};

module.exports.helpers = { STRONG, fail, pick, genPassword, checkPassword, cleanFeatures, toDate, addMonths };
