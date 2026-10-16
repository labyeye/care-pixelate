const express = require("express");
const c = require("../controllers/staffController");
const { protect, authorize, requirePlan, pageAccess, ADMINS } = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

router.use(protect, requirePlan, tenantScope, authorize(...ADMINS));

// Resetting a password has its own page permission, separate from managing staff records.
router.get("/", pageAccess(["staff", "password-reset"], "staff"), c.getAll);
router.post("/:id/reset-password", pageAccess("password-reset"), c.resetPassword);
router.post("/", pageAccess("staff"), c.create);
router.route("/:id").all(pageAccess("staff")).get(c.getOne).put(c.update).delete(c.remove);

module.exports = router;
