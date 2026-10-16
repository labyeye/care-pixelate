const express = require("express");
const { getAll, getOne, create, update, remove } = require("../controllers/patientController");
const { protect, authorize, requirePlan, pageAccess, STAFF, FRONT_DESK, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, requirePlan, tenantScope, pageAccess(["patients", "appointments", "calendar", "invoices", "lab-orders", "consultations"], "patients"));

router.route("/").get(authorize(...STAFF), getAll).post(authorize(...FRONT_DESK), create);
router
  .route("/:id")
  .get(authorize(...STAFF), getOne)
  .put(authorize(...FRONT_DESK), update)
  .delete(authorize(...ADMINS), remove);

module.exports = router;
