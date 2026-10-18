const express = require("express");
const { photo } = require("../controllers/photoController");
const {
  protect,
  authorize,
  requirePlan,
  STAFF,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

// Staff of the tenant only; patients never browse other people's photos.
router.get(
  "/:kind/:id",
  protect,
  requirePlan,
  tenantScope,
  authorize(...STAFF),
  photo,
);

module.exports = router;
