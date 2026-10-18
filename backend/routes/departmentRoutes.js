const express = require("express");
const c = require("../controllers/departmentController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  ADMINS,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, requirePlan, tenantScope, pageAccess("locations"));

router
  .route("/")
  .get(authorize(...ADMINS, "doctor", "nurse", "receptionist"), c.getAll)
  .post(authorize(...ADMINS), c.create);
router
  .route("/:id")
  .put(authorize(...ADMINS), c.update)
  .delete(authorize(...ADMINS), c.remove);

module.exports = router;
