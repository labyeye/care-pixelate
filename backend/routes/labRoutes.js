const express = require("express");
const c = require("../controllers/labController");
const { protect, authorize, requirePlan, pageAccess, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

const ORDERERS = [...ADMINS, "doctor"];
const LAB = [...ORDERERS, "nurse", "lab_technician", "receptionist"];

router.use(protect, requirePlan, tenantScope, pageAccess("lab-orders"));

router.get("/technicians", authorize(...LAB), c.technicians);
router.route("/").get(authorize(...LAB), c.getAll).post(authorize(...ORDERERS), c.create);
router.put("/:id/details", authorize(...ORDERERS), c.updateDetails);
router
  .route("/:id")
  .get(authorize(...LAB), c.getOne)
  .put(authorize(...ORDERERS, "lab_technician", "nurse"), c.update)
  .delete(authorize(...ADMINS), c.remove);

module.exports = router;
