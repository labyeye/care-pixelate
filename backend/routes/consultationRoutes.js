const express = require("express");
const c = require("../controllers/consultationController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  STAFF,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

// Clinical content: only doctors write (owners/admins too, e.g. solo practitioners).
const CLINICIANS = ["super_admin", "tenant_owner", "hospital_admin", "doctor"];

router.use(
  protect,
  requirePlan,
  tenantScope,
  pageAccess(["consultations", "appointments", "calendar"]),
);

router
  .route("/")
  .get(authorize(...STAFF), c.getAll)
  .post(authorize(...CLINICIANS), c.create);
router
  .route("/:id")
  .get(authorize(...STAFF), c.getOne)
  .put(authorize(...CLINICIANS), c.update)
  .delete(authorize(...CLINICIANS), c.discard);
router.post("/:id/sign", authorize(...CLINICIANS), c.sign);

module.exports = router;
