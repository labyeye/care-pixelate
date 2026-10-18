const express = require("express");
const c = require("../controllers/reportController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

const ALL_ROLES = [...new Set(Object.values(c.ROLE_SETS).flat())];

router.use(protect, requirePlan, tenantScope, pageAccess("reports"));

router.get("/", authorize(...ALL_ROLES), c.list);
router.get(
  "/:type",
  (req, res, next) => {
    const def = c.REPORTS[req.params.type];
    authorize(...(def ? c.ROLE_SETS[def.roles] : ALL_ROLES))(req, res, next);
  },
  c.run,
);

module.exports = router;
