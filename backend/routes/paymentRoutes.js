const express = require("express");
const c = require("../controllers/paymentController");
const { protect, authorize, requirePlan, pageAccess, FRONT_DESK, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, requirePlan, tenantScope);

router.route("/config").get(authorize(...ADMINS), c.getConfig).put(authorize(...ADMINS), c.updateConfig);
router.get("/status", authorize(...FRONT_DESK), c.status);
router.post("/appointments/:id/order", authorize(...FRONT_DESK), pageAccess(["appointments"], ["appointments"]), c.staffOrder);
router.post("/verify", authorize(...FRONT_DESK), pageAccess(["appointments"], ["appointments"]), c.staffVerify);

module.exports = router;
