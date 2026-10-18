const express = require("express");
const c = require("../controllers/purchaseController");
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

router.use(
  protect,
  requirePlan,
  tenantScope,
  pageAccess("medicines"),
  authorize(...MANAGERS),
);

router.route("/").get(c.getAll).post(c.create);
router.route("/:id").get(c.getOne).put(c.update);
router.post("/:id/receive", c.receive);
router.post("/:id/cancel", c.cancel);
router.post("/:id/payments", c.addPayment);
router.post("/:id/return", c.returnToVendor);

module.exports = router;
