// Usage + health metrics for the CRM dashboard (final-pixelate): page views, active users, crashes and API
// success/latency, split by client platform ("web" or "app"). One identical file per product backend; only
// the secret env name differs:  const tele = require("./utils/telemetry")("CRM_API_SECRET");
//   app.use(tele.middleware);                    // counts every /api request (after express.json)
//   app.use("/api/telemetry", tele.ingest);      // clients post page views / crashes here (no login needed)
//   app.use("/api/crm/metrics", tele.metrics);   // dashboard reads here (x-api-key guarded)
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const PLATFORMS = ["web", "app"];
const TYPES = ["page", "crash", "error"];
const DAY = 86400000;

const eventSchema = new mongoose.Schema({
  ts: { type: Date, default: Date.now, expires: 90 * 24 * 3600 }, // kept 90 days
  platform: { type: String, enum: PLATFORMS, index: true },
  type: { type: String, enum: TYPES },
  path: String,
  userId: String,
  tenantId: String,
  role: String,
  message: String,
  stack: String,
  version: String,
});
eventSchema.index({ platform: 1, ts: -1 });
eventSchema.index({ platform: 1, type: 1, ts: -1 });

const minuteSchema = new mongoose.Schema({
  minute: { type: Date, expires: 30 * 24 * 3600 }, // kept 30 days
  platform: String,
  n: { type: Number, default: 0 },
  ok: { type: Number, default: 0 },
  c4: { type: Number, default: 0 },
  c5: { type: Number, default: 0 },
  ms: { type: Number, default: 0 },
  slow: { type: Number, default: 0 },
});
minuteSchema.index({ platform: 1, minute: 1 }, { unique: true });

const Event = mongoose.models.UsageEvent || mongoose.model("UsageEvent", eventSchema);
const Minute = mongoose.models.UsageMinute || mongoose.model("UsageMinute", minuteSchema);

const clip = (v, n) => (v == null ? undefined : String(v).slice(0, n));
const platformOf = (v) => (String(v).toLowerCase() === "app" ? "app" : "web");
// Query-less path with ids collapsed, so /employees/64af... counts as /employees/:id.
const normPath = (p) =>
  String(p || "/").split("?")[0].split("#")[0].replace(/\/[a-f0-9]{24}(?=\/|$)/gi, "/:id").replace(/\/\d+(?=\/|$)/g, "/:id").slice(0, 120);

module.exports = (secretEnv) => {
  const guard = (req, res, next) => {
    const secret = process.env[secretEnv] || "";
    const a = Buffer.from(String(req.headers["x-api-key"] || ""));
    const b = Buffer.from(secret);
    if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(401).json({ success: false, message: "Unauthorized" });
    next();
  };

  // ── API request counters, flushed to Mongo every 30 s ──────────────────────
  let pending = new Map();
  const flush = async () => {
    if (!pending.size || mongoose.connection.readyState !== 1) return;
    const batch = pending;
    pending = new Map();
    try {
      await Minute.bulkWrite(
        [...batch.values()].map((c) => ({
          updateOne: {
            filter: { minute: c.minute, platform: c.platform },
            update: { $inc: { n: c.n, ok: c.ok, c4: c.c4, c5: c.c5, ms: c.ms, slow: c.slow } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    } catch (e) {
      /* metrics must never break the app */
    }
  };
  setInterval(flush, 30000).unref();

  const middleware = (req, res, next) => {
    if (!req.originalUrl.startsWith("/api/") || req.originalUrl.startsWith("/api/telemetry") || req.originalUrl.startsWith("/api/crm")) return next();
    const t0 = Date.now();
    res.on("finish", () => {
      const platform = platformOf(req.headers["x-client"]);
      const minute = new Date(Math.floor(t0 / 60000) * 60000);
      const key = `${platform}|${minute.getTime()}`;
      const c = pending.get(key) || { minute, platform, n: 0, ok: 0, c4: 0, c5: 0, ms: 0, slow: 0 };
      const ms = Date.now() - t0;
      c.n++; c.ms += ms;
      if (ms > 1000) c.slow++;
      if (res.statusCode >= 500) c.c5++; else if (res.statusCode >= 400) c.c4++; else c.ok++;
      pending.set(key, c);
    });
    next();
  };

  // ── Ingest: POST /api/telemetry { events: [...] } ───────────────────────────
  const hits = new Map(); // ip -> [count, windowStart]; ponytail: per-process, fine for one node
  const ingest = express.Router();
  ingest.post("/", async (req, res) => {
    const ip = req.ip;
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h[1] > 60000) hits.set(ip, [1, now]);
    else if (++h[0] > 120) return res.status(429).json({ success: false });
    if (hits.size > 5000) hits.clear();
    const list = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
    const docs = list
      .filter((e) => e && TYPES.includes(e.type))
      .map((e) => ({
        platform: platformOf(e.platform || req.headers["x-client"]),
        type: e.type,
        path: normPath(e.path),
        userId: clip(e.userId, 40),
        tenantId: clip(e.tenantId, 40),
        role: clip(e.role, 30),
        message: clip(e.message, 300),
        stack: clip(e.stack, 1500),
        version: clip(e.version, 20),
      }));
    if (docs.length) await Event.insertMany(docs, { ordered: false }).catch(() => {});
    res.json({ success: true });
  });

  // ── Read: GET /api/crm/metrics?platform=web|app ────────────────────────────
  const metrics = express.Router();
  metrics.get("/", guard, async (req, res) => {
    try {
      const platform = platformOf(req.query.platform);
      const now = Date.now();
      const since = (ms) => new Date(now - ms);
      const distinctUsers = async (ms) => (await Event.distinct("userId", { platform, ts: { $gte: since(ms) }, userId: { $ne: null } })).length;
      const User = mongoose.models.User;
      const [activeNow, active24h, active7d, active30d, totalUsers, topPages, hourly, crashes, crashCount, api] = await Promise.all([
        distinctUsers(5 * 60000),
        distinctUsers(DAY),
        distinctUsers(7 * DAY),
        distinctUsers(30 * DAY),
        User ? User.countDocuments() : 0,
        Event.aggregate([
          { $match: { platform, type: "page", ts: { $gte: since(DAY) } } },
          { $group: { _id: "$path", views: { $sum: 1 }, users: { $addToSet: "$userId" } } },
          { $project: { views: 1, users: { $size: "$users" } } },
          { $sort: { views: -1 } },
          { $limit: 20 },
        ]),
        Event.aggregate([
          { $match: { platform, ts: { $gte: since(DAY) } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%dT%H:00:00Z", date: "$ts" } }, views: { $sum: { $cond: [{ $eq: ["$type", "page"] }, 1, 0] } }, crashes: { $sum: { $cond: [{ $eq: ["$type", "page"] }, 0, 1] } } } },
          { $sort: { _id: 1 } },
        ]),
        Event.find({ platform, type: { $in: ["crash", "error"] } }).sort({ ts: -1 }).limit(25).select("-__v").lean(),
        Event.countDocuments({ platform, type: { $in: ["crash", "error"] }, ts: { $gte: since(DAY) } }),
        Minute.aggregate([
          { $match: { platform, minute: { $gte: since(DAY) } } },
          { $group: { _id: null, n: { $sum: "$n" }, ok: { $sum: "$ok" }, c4: { $sum: "$c4" }, c5: { $sum: "$c5" }, ms: { $sum: "$ms" }, slow: { $sum: "$slow" } } },
        ]),
      ]);
      const a = api[0] || { n: 0, ok: 0, c4: 0, c5: 0, ms: 0, slow: 0 };
      res.json({
        success: true,
        platform,
        generatedAt: new Date(),
        users: { total: totalUsers, activeNow, active24h, active7d, active30d, inactive30d: Math.max(0, totalUsers - active30d) },
        topPages: topPages.map((p) => ({ path: p._id, views: p.views, users: p.users })),
        hourly: hourly.map((h) => ({ hour: h._id, views: h.views, crashes: h.crashes })),
        crashes: { last24h: crashCount, recent: crashes },
        api: {
          requests24h: a.n,
          successRate: a.n ? Math.round((a.ok / a.n) * 1000) / 10 : null,
          clientErrors: a.c4,
          serverErrors: a.c5,
          avgMs: a.n ? Math.round(a.ms / a.n) : null,
          slowOver1s: a.slow,
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  return { middleware, ingest, metrics };
};
