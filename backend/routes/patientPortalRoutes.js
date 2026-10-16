const express = require("express");
const c = require("../controllers/patientPortalController");
const privacy = require("../controllers/privacyController");
const { protect, authorize, requirePlan } = require("../middleware/auth");

const router = express.Router();

// Patient accounts only; staff use the tenant-wide routes instead.
router.use(protect, requirePlan, authorize("patient"));

router.route("/profiles").get(c.listProfiles).post(c.addProfile);
router.put("/profiles/:id", c.updateProfile);

router.get("/doctors", c.listDoctors);
router.get("/doctors/:id/slots", c.doctorSlots);

router.route("/appointments").get(c.myAppointments).post(c.book);
router.post("/appointments/:id/cancel", c.cancel);
router.post("/appointments/:id/pay-order", c.payOrder);
router.get("/pay-status", c.payStatus);
router.post("/pay-verify", c.payVerify);

router.get("/appointments/:id/video-link", c.videoLink);
router.get("/invoices", c.myInvoices);
router.get("/lab-orders", c.myLabOrders);

router.get("/prescriptions", c.prescriptions);

router.get("/export", privacy.exportMine);
router.route("/consents").get(privacy.consentsMine).post(privacy.setConsent);
router.post("/deletion-request", privacy.requestDeletion);
router.route("/abha").get(privacy.abhaMine).put(privacy.setAbhaMine);

router.route("/vitals").get(c.listVitals).post(c.addVital);
router.delete("/vitals/:id", c.deleteVital);

router.route("/reminders").get(c.listReminders).post(c.addReminder);
router.route("/reminders/:id").put(c.updateReminder).delete(c.deleteReminder);

router.route("/records").get(c.listRecords).post(c.uploadRecord);
router.get("/records/:id/file", c.downloadRecord);
router.delete("/records/:id", c.deleteRecord);

module.exports = router;
