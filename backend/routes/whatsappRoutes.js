const express = require("express");
const c = require("../controllers/whatsappController");
const {
  protect,
  authorize,
  requirePlan,
  ADMINS,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();
router.use(protect, requirePlan, tenantScope, authorize(...ADMINS));
router.route("/").get(c.get).put(c.update);
router.get("/log", c.log);

module.exports = router;
