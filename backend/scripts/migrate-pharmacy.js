// One-off, idempotent migration + pre-flight report for the batch-inventory / slot-lock / index changes.
//   node scripts/migrate-pharmacy.js             DRY RUN (default): reads only, prints what it would do
//   node scripts/migrate-pharmacy.js --apply     performs the safe steps below
// Never deletes documents, never drops collections, never runs syncIndexes. Safe to re-run.
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const out = { mode: APPLY ? "APPLY" : "DRY-RUN" };

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  const Medicine = require("../models/Medicine");
  const MedicineBatch = require("../models/MedicineBatch");
  const Appointment = require("../models/Appointment");
  const AppointmentSlotLock = require("../models/AppointmentSlotLock");
  const slotLock = require("../utils/slotLock");

  // ---- 1. medicines: stockQty becomes derived; the old count is carried as un-batched legacy stock.
  const unmigrated = await Medicine.collection.countDocuments({
    legacyStockQty: { $exists: false },
  });
  const withStock = await Medicine.collection.countDocuments({
    legacyStockQty: { $exists: false },
    stockQty: { $gt: 0 },
  });
  out.medicines = { toMigrate: unmigrated, withStockToCarryOver: withStock };
  if (APPLY && unmigrated) {
    const r = await Medicine.collection.updateMany(
      { legacyStockQty: { $exists: false } },
      [{ $set: { legacyStockQty: { $ifNull: ["$stockQty", 0] } } }],
    );
    out.medicines.migrated = r.modifiedCount;
  }
  const needRecon = await Medicine.collection
    .aggregate([
      { $match: { legacyStockQty: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          medicines: { $sum: 1 },
          units: { $sum: "$legacyStockQty" },
        },
      },
    ])
    .toArray();
  out.manualReconciliation = {
    note: "Un-batched stock has no batch number / expiry on record. None was invented. Staff reconcile it with POST /api/inventory/medicines/:id/reconcile once they have the real lot details.",
    medicinesWithLegacyStock: needRecon[0]?.medicines || 0,
    units: needRecon[0]?.units || 0,
    batchesNow: await MedicineBatch.countDocuments(),
  };

  // ---- 2. appointment slot locks for live bookings (walk-ins are queue entries and hold no slot)
  const live = await Appointment.find({
    status: "scheduled",
    type: { $ne: "walk_in" },
    scheduledAt: { $gte: new Date() },
  }).select("tenantId doctorId scheduledAt endsAt");
  let held = 0;
  const conflicts = [];
  for (const a of live) {
    const end = a.endsAt || new Date(a.scheduledAt.getTime() + 15 * 60_000);
    if (!APPLY) {
      held++;
      continue;
    }
    try {
      await slotLock.acquire({
        tenantId: a.tenantId,
        doctorId: a.doctorId,
        appointmentId: a._id,
        start: a.scheduledAt,
        end,
      });
      held++;
    } catch (e) {
      if (e.status === 409) conflicts.push(String(a._id));
      else throw e;
    }
  }
  out.slotLocks = {
    liveAppointments: live.length,
    locked: APPLY ? held : `${held} would be locked`,
    existingOverlapsNeedingManualFix: conflicts,
    existingLocks: await AppointmentSlotLock.countDocuments(),
  };

  // ---- 3. index pre-flight: report anything that would make a new unique index fail to build
  const dupes = async (coll, key, match = {}) =>
    db
      .collection(coll)
      .aggregate([
        { $match: match },
        { $group: { _id: key, n: { $sum: 1 }, ids: { $push: "$_id" } } },
        { $match: { n: { $gt: 1 } } },
        { $limit: 20 },
      ])
      .toArray();
  out.indexPreflight = {
    medicineBarcodeDuplicates: (
      await dupes(
        "medicines",
        { t: "$tenantId", v: "$barcode" },
        { barcode: { $gt: "" } },
      )
    ).length,
    medicineSkuDuplicates: (
      await dupes(
        "medicines",
        { t: "$tenantId", v: "$sku" },
        { sku: { $gt: "" } },
      )
    ).length,
    liveInvoicesPerAppointmentDuplicates: (
      await dupes(
        "invoices",
        { t: "$tenantId", a: "$appointmentId" },
        {
          appointmentId: { $exists: true },
          status: { $in: ["unpaid", "partial", "paid"] },
        },
      )
    ).length,
    note: "A non-zero count means that unique index will fail to build until those rows are fixed (the app keeps running; Mongoose only logs the index error).",
  };

  // ---- 4. obsolete index from the old Patient schema (unique tenantId+uhid collides on null for every new patient)
  const patientIdx = await db
    .collection("patients")
    .indexes()
    .catch(() => []);
  const obsolete = patientIdx.find((i) => i.name === "tenantId_1_uhid_1");
  out.obsoletePatientIndex = obsolete
    ? "tenantId_1_uhid_1 present"
    : "already gone";
  if (APPLY && obsolete) {
    await db.collection("patients").dropIndex("tenantId_1_uhid_1");
    out.obsoletePatientIndex = "dropped tenantId_1_uhid_1";
  }

  console.log(JSON.stringify(out, null, 2));
  if (!APPLY)
    console.log(
      "\nDry run only. Re-run with --apply to perform the steps above.",
    );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("MIGRATION FAILED:", e.message);
  process.exit(1);
});
