// Fills Invoice.doctorId for existing invoices that have none, using the clinical record they were billed from.
//   node scripts/link-invoice-doctors.js            dry run: shows what would change
//   node scripts/link-invoice-doctors.js --apply    writes the links
// Resolution order (first hit wins, always inside the invoice's own tenant):
//   1. invoice.appointmentId            -> that appointment's doctor
//   2. an item's source (lab / medicine / appointment) -> the lab order's / consultation's / appointment's doctor
//   3. the patient's nearest non-cancelled appointment within 3 days of the invoice -> its doctor
// Invoices that already have a doctor, or that none of the rules can resolve, are left untouched.
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const LabOrder = require("../models/LabOrder");
const Doctor = require("../models/Doctor");

const APPLY = process.argv.includes("--apply");
const DAY = 24 * 60 * 60 * 1000;
const SOURCE_MODEL = {
  appointment: Appointment,
  lab: LabOrder,
  medicine: Consultation,
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const invoices = await Invoice.find({
    $or: [{ doctorId: null }, { doctorId: { $exists: false } }],
  }).select("tenantId number patientId appointmentId items.source createdAt");
  const validDoctor = async (tenantId, id) =>
    id && (await Doctor.exists({ _id: id, tenantId })) ? id : null;

  const tally = { appointment: 0, source: 0, nearest: 0, unresolved: [] };
  const ops = [];
  for (const inv of invoices) {
    const t = inv.tenantId;
    let doctorId = null;
    let how = "";

    if (inv.appointmentId) {
      const a = await Appointment.findOne({
        _id: inv.appointmentId,
        tenantId: t,
      }).select("doctorId");
      doctorId = await validDoctor(t, a?.doctorId);
      how = "appointment";
    }
    if (!doctorId) {
      for (const it of inv.items) {
        const src = it.source;
        const M = src && SOURCE_MODEL[src.kind];
        if (!M) continue;
        const rec = await M.findOne({ _id: src.refId, tenantId: t }).select(
          "doctorId",
        );
        doctorId = await validDoctor(t, rec?.doctorId);
        if (doctorId) {
          how = "source";
          break;
        }
      }
    }
    if (!doctorId) {
      const around = await Appointment.find({
        tenantId: t,
        patientId: inv.patientId,
        status: { $ne: "cancelled" },
        scheduledAt: {
          $gte: new Date(inv.createdAt - 3 * DAY),
          $lte: new Date(+inv.createdAt + 3 * DAY),
        },
      }).select("doctorId scheduledAt");
      around.sort(
        (a, b) =>
          Math.abs(a.scheduledAt - inv.createdAt) -
          Math.abs(b.scheduledAt - inv.createdAt),
      );
      doctorId = await validDoctor(t, around[0]?.doctorId);
      how = "nearest";
    }

    if (doctorId) {
      tally[how]++;
      ops.push({
        updateOne: {
          filter: {
            _id: inv._id,
            tenantId: t,
            doctorId: { $in: [null, undefined] },
          },
          update: { $set: { doctorId } },
        },
      });
    } else {
      tally.unresolved.push(inv.number);
    }
  }

  console.log(`${invoices.length} invoice(s) without a doctor`);
  console.log(
    `  via appointment: ${tally.appointment}, via item source: ${tally.source}, via nearest visit: ${tally.nearest}`,
  );
  console.log(
    `  unresolved: ${tally.unresolved.length}${tally.unresolved.length ? " (" + tally.unresolved.join(", ") + ")" : ""}`,
  );
  if (!APPLY) return console.log("Dry run only. Re-run with --apply to write.");
  if (ops.length) {
    const r = await Invoice.bulkWrite(ops, { ordered: false });
    console.log(`Linked ${r.modifiedCount} invoice(s) to their doctor`);
  }
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
