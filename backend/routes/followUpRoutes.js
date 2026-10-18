const express = require("express");
const c = require("../controllers/followUpController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  STAFF,
  FRONT_DESK,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();
router.use(
  protect,
  requirePlan,
  tenantScope,
  pageAccess(["appointments", "consultations"], ["appointments"]),
);
router.get("/", authorize(...STAFF), c.list);
router.post("/:id/remind", authorize(...FRONT_DESK), c.remind);

module.exports = router;
