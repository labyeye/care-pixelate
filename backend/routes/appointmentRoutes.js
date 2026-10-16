const express = require("express");
const { getAll, getOne, create, update, remove, checkIn, videoLink } = require("../controllers/appointmentController");
const { getTriage, saveTriage } = require("../controllers/consultationController");
const { protect, authorize, requirePlan, pageAccess, STAFF, FRONT_DESK, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, requirePlan, tenantScope, pageAccess(["appointments", "calendar"]));

router.route("/").get(authorize(...STAFF), getAll).post(authorize(...FRONT_DESK), create);
router.get("/:id/video-link", authorize(...STAFF), videoLink);
router.post("/:id/check-in", authorize(...FRONT_DESK), checkIn);
// Intake vitals: receptionist / nurse / doctor / admins (FRONT_DESK) record, anyone who sees the appointment may read.
router.route("/:id/vitals").get(authorize(...STAFF), getTriage).put(authorize(...FRONT_DESK), saveTriage);
router
  .route("/:id")
  .get(authorize(...STAFF), getOne)
  .put(authorize(...FRONT_DESK), update)
  .delete(authorize(...ADMINS), remove);

module.exports = router;
