const express = require("express");
const c = require("../controllers/medicineController");
const {
  protect,
  authorize,
  requirePlan,
  pageAccess,
  ADMINS,
} = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");

const router = express.Router();

const MANAGERS = [...ADMINS, "pharmacist"];
const READERS = [...MANAGERS, "doctor", "nurse"];

router.use(
  protect,
  requirePlan,
  tenantScope,
  pageAccess(["medicines", "consultations"], "medicines"),
); // prescribers read the stock list; only the inventory page edits it

router.get("/stats", authorize(...READERS), c.stats);
router
  .route("/")
  .get(authorize(...READERS), c.getAll)
  .post(authorize(...MANAGERS), c.create);
router.post("/:id/stock", authorize(...MANAGERS), c.adjustStock);
router
  .route("/:id")
  .get(authorize(...READERS), c.getOne)
  .put(authorize(...MANAGERS), c.update)
  .delete(authorize(...ADMINS), c.remove);

module.exports = router;
