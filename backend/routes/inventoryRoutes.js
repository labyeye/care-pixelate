const express = require("express");
const c = require("../controllers/inventoryController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  ADMINS,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();
const MANAGERS = [...ADMINS, "pharmacist"];

router.use(protect, requirePlan, tenantScope, pageAccess("medicines"));

router.get(
  "/batches",
  authorize(...MANAGERS, "doctor", "nurse"),
  c.listBatches,
);
router.get("/ledger", authorize(...MANAGERS), c.ledger);
router.get("/reconciliation", authorize(...ADMINS), c.reconciliation);
router.post("/batches/:id/adjust", authorize(...MANAGERS), c.adjust);
router.post("/batches/:id/hold", authorize(...MANAGERS), c.hold);
router.post("/medicines/:id/reconcile", authorize(...MANAGERS), c.reconcile);
router.post("/medicines/:id/legacy", authorize(...ADMINS), c.legacyAdjust);
router.post("/expire-sweep", authorize(...ADMINS), c.expireSweep);

module.exports = router;
