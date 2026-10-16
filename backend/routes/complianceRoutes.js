const express = require("express");
const c = require("../controllers/complianceController");
const analytics = require("../controllers/analyticsController");
const privacy = require("../controllers/privacyController");
const { protect, authorize, requirePlan, pageAccess, STAFF, FRONT_DESK, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const CLINICIANS = [...ADMINS, "doctor"];
const base = [protect, requirePlan, tenantScope];

// Mounted at /api. Each route carries its own guards so unknown /api paths still 404 normally.
router.get("/audit-logs", ...base, pageAccess("audit-log"), authorize(...ADMINS), c.auditList);

router.get("/clinics", ...base, pageAccess(["locations", "appointments", "calendar"]), authorize(...STAFF), c.clinicList);
router.post("/clinics", ...base, pageAccess("locations"), authorize(...ADMINS), c.clinicCreate);
router.put("/clinics/:id", ...base, pageAccess("locations"), authorize(...ADMINS), c.clinicUpdate);
router.delete("/clinics/:id", ...base, pageAccess("locations"), authorize(...ADMINS), c.clinicDelete);

router.route("/abha/:patientId").all(...base, pageAccess("patients"), authorize(...FRONT_DESK)).get(c.abhaGet).put(c.abhaPut).delete(c.abhaDelete);

// Sends PHI to a third-party model: capped per IP and gated per tenant (activeModules has ai_scribe).
const scribeLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many scribe requests, slow down." } });
router.post("/ai/scribe", scribeLimiter, ...base, pageAccess(["appointments", "calendar"]), authorize(...CLINICIANS), c.scribe);

router.get("/analytics/summary", ...base, pageAccess("analytics"), authorize(...CLINICIANS), analytics.summary);

router.get("/privacy/deletion-requests", ...base, pageAccess("settings"), authorize(...ADMINS), privacy.deletionRequests);

module.exports = router;
