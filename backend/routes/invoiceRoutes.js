const express = require("express");
const c = require("../controllers/invoiceController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  ADMINS,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

const BILLING = [...ADMINS, "receptionist", "billing_executive"];

router.use(
  protect,
  requirePlan,
  tenantScope,
  pageAccess("invoices"),
  authorize(...BILLING),
);

router.route("/").get(c.getAll).post(c.create);
router.post("/from-appointment/:appointmentId", c.fromAppointment);
router.get("/billable", c.billable);
router.get("/catalog", c.catalog);
router.get("/:id", c.getOne);
router.post("/:id/payments", c.addPayment);
router.post("/:id/void", authorize(...ADMINS), c.voidInvoice);

module.exports = router;
