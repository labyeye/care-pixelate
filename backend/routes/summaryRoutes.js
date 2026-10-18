const express = require("express");
const { summary } = require("../controllers/summaryController");
const {
  protect,
  authorize,
  requirePlan,
  STAFF,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

// Money and audit figures are filtered by role inside the controller.
router.get(
  "/",
  protect,
  requirePlan,
  tenantScope,
  authorize(...STAFF),
  summary,
);

module.exports = router;
