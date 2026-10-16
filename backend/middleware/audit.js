const { AuditLog } = require("../models/Compliance");

const ACTION = { GET: "view", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };
const OID = /\b[0-9a-f]{24}\b/;

// Mounted in server.js in front of PHI routers, so it sees the request before auth runs.
// It logs when the response finishes, by which point `protect` has set req.user. Unauthenticated
// requests are skipped (nothing to attribute). Request bodies are deliberately never recorded.
const audit = (resource) => (req, res, next) => {
  res.on("finish", () => {
    const u = req.user;
    const tenantId = u && (u.role === "super_admin" ? req.query.tenantId : u.tenantId);
    if (!u || !tenantId || req.method === "OPTIONS") return;
    const path = req.originalUrl.split("?")[0];
    // POST /:id/sign, /:id/payments etc. are actions on a record, not plain creates.
    const isSubAction = req.method === "POST" && /\/[0-9a-f]{24}\//.test(path);
    AuditLog.create({
      tenantId,
      userId: u._id,
      role: u.role,
      method: req.method,
      action: isSubAction ? "action" : ACTION[req.method] || "action",
      resource,
      resourceId: (path.match(OID) || [])[0],
      path,
      status: res.statusCode,
      ip: req.ip,
    }).catch(() => {}); // an audit write must never break the request
  });
  next();
};

module.exports = audit;
