const express = require("express");
const c = require("../controllers/vendorController");
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

// Vendors live on the Medicines & inventory page, so they share its page permission.
router.use(protect, requirePlan, tenantScope, pageAccess("medicines"));

router.get("/stats", authorize(...MANAGERS), c.stats);
router
  .route("/")
  .get(authorize(...MANAGERS), c.getAll)
  .post(authorize(...MANAGERS), c.create);
router
  .route("/:id")
  .get(authorize(...MANAGERS), c.getOne)
  .put(authorize(...MANAGERS), c.update)
  .delete(authorize(...ADMINS), c.remove);

module.exports = router;
