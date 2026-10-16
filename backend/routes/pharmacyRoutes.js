const express = require("express");
const c = require("../controllers/pharmacyController");
const { protect, authorize, requirePlan, pageAccess, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();
const MANAGERS = [...ADMINS, "pharmacist"];

router.use(protect, requirePlan, tenantScope, pageAccess("medicines"));

router.route("/sales").get(authorize(...MANAGERS, "billing_executive"), c.getAll).post(authorize(...MANAGERS), c.createSale);
router.get("/sales/:id", authorize(...MANAGERS, "billing_executive"), c.getOne);
router.post("/sales/:id/return", authorize(...MANAGERS), c.returnSale);

module.exports = router;
