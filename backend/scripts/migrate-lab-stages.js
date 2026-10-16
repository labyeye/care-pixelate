// One-off: gives pre-existing lab orders a stage timeline (+ a performing staff member where known).
// Idempotent — only touches orders whose `stages` is empty.   node scripts/migrate-lab-stages.js
// Timeline is rebuilt from the timestamps we already stored (createdAt / collectedAt / resultedAt).
// Who did a step is unknown for old rows, so: "ordered" -> createdBy, later steps -> assignedTo if any.
// Sample orders (number SMP-*) are assigned to the sample lab technician so the UI has a name to show.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const LabOrder = require("../models/LabOrder");
const User = require("../models/User");
const StaffProfile = require("../models/StaffProfile");

const nameOf = async (cache, id) => {
  if (!id) return { name: "", role: "" };
  const k = String(id);
  if (!cache.has(k)) {
    const u = await User.findById(id).select("name role");
    cache.set(k, { name: u?.name || "", role: u?.role || "" });
  }
  return cache.get(k);
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const cache = new Map();
  const techByTenant = new Map();
  const orders = await LabOrder.find({ $or: [{ stages: { $exists: false } }, { stages: { $size: 0 } }] });
  let n = 0;
  for (const o of orders) {
    if (!o.assignedTo && /^SMP-/.test(o.number)) {
      const k = String(o.tenantId);
      if (!techByTenant.has(k)) {
        const sp = await StaffProfile.findOne({ tenantId: o.tenantId, staffId: /^SMP-/, "employment.designation": /lab/i });
        techByTenant.set(k, sp?.userId || null);
      }
      if (techByTenant.get(k)) o.assignedTo = techByTenant.get(k);
    }
    const performer = o.assignedTo || null;
    const stages = [];
    const creator = await nameOf(cache, o.createdBy);
    stages.push({ status: "ordered", at: o.createdAt, by: o.createdBy, byName: creator.name, byRole: creator.role, note: o.notes ? "Order placed" : "" });
    if (o.collectedAt) {
      const p = await nameOf(cache, performer);
      o.collectedBy = o.collectedBy || performer || undefined;
      stages.push({ status: "collected", at: o.collectedAt, by: performer || undefined, byName: p.name, byRole: p.role, note: "Sample collected" });
    }
    if (o.status === "resulted" && o.resultedAt) {
      const p = await nameOf(cache, performer);
      o.resultedBy = o.resultedBy || performer || undefined;
      stages.push({ status: "resulted", at: o.resultedAt, by: performer || undefined, byName: p.name, byRole: p.role, note: "Results entered" });
    }
    if (o.status === "cancelled") {
      stages.push({ status: "cancelled", at: o.updatedAt, by: undefined, byName: "", byRole: "", note: "Order cancelled" });
    }
    o.stages = stages;
    await o.save();
    n++;
  }
  console.log(`backfilled ${n} lab order(s)`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
