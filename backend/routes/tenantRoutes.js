const express = require("express");
const {
  getCurrentTenant,
  updateTenant,
  getPermissions,
  updatePermissions,
} = require("../controllers/tenantController");
const { protect, authorize, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, tenantScope);

router
  .route("/permissions")
  .get(authorize(...ADMINS), getPermissions)
  .put(authorize(...ADMINS), updatePermissions);
router.put("/security", authorize("tenant_owner", "super_admin"), async (req, res) => {
  const Tenant = require("../models/Tenant");
  await Tenant.updateOne({ _id: req.tenantId }, { $set: { "security.requireMfa": !!req.body.requireMfa } });
  res.json({ success: true, data: { requireMfa: !!req.body.requireMfa } });
});
router
  .route("/me")
  .get(getCurrentTenant)
  .put(authorize(...ADMINS), updateTenant);

module.exports = router;
