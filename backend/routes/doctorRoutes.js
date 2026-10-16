const express = require("express");
const { getAll, getOne, create, update, remove, slots } = require("../controllers/doctorController");
const { protect, authorize, requirePlan, pageAccess, STAFF, FRONT_DESK, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, requirePlan, tenantScope, pageAccess(["doctors", "appointments", "calendar", "lab-orders", "consultations"], "doctors"));

router.route("/").get(authorize(...STAFF), getAll).post(authorize(...FRONT_DESK), create);
router.get("/:id/slots", authorize(...STAFF), slots);
router
  .route("/:id")
  .get(authorize(...STAFF), getOne)
  .put(authorize(...FRONT_DESK), update)
  .delete(authorize(...ADMINS), remove);

module.exports = router;
