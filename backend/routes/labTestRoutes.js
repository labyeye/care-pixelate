const express = require("express");
const c = require("../controllers/labTestController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  ADMINS,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();
const READERS = [
  ...ADMINS,
  "doctor",
  "nurse",
  "lab_technician",
  "receptionist",
];

router.use(protect, requirePlan, tenantScope, pageAccess("lab-orders"));

router
  .route("/")
  .get(authorize(...READERS), c.getAll)
  .post(authorize(...ADMINS, "lab_technician"), c.create);
router
  .route("/:id")
  .put(authorize(...ADMINS, "lab_technician"), c.update)
  .delete(authorize(...ADMINS), c.remove);

module.exports = router;
