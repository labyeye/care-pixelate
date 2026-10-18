const Tenant = require("../models/Tenant");

// Plan caps live on Tenant.limits (0 = unlimited). 402 so clients can route to /billing.
async function assertWithinLimit(req, res, key, countFn, label) {
  if (!req.tenantId) return;
  const tenant = await Tenant.findById(req.tenantId).select("limits");
  const cap = tenant?.limits?.[key];
  if (cap && (await countFn()) >= cap) {
    res.status(402);
    throw new Error(
      `Your plan allows ${cap} ${label}. Upgrade in Billing to add more.`,
    );
  }
}

module.exports = { assertWithinLimit };
