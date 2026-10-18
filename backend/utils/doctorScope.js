// A signed-in DOCTOR only ever sees their own work: their appointments, consultations, lab orders and the
// patients those belong to. tenantScope sets req.ownDoctorId (undefined for every other role), controllers
// spread own(req) into their filters, and patientScope(req) narrows the patient list the same way.
const mongoose = require("mongoose");

// A doctor login with no linked Doctor profile matches nothing instead of everything.
const NONE = new mongoose.Types.ObjectId("000000000000000000000000");

async function resolveOwnDoctor(req) {
  if (req.user?.role !== "doctor") return undefined;
  const Doctor = require("../models/Doctor");
  const d = await Doctor.findOne({
    userId: req.user._id,
    tenantId: req.user.tenantId,
  }).select("_id");
  return d ? d._id : NONE;
}

/** { doctorId } for doctors, {} for everyone else. */
const own = (req) => (req.ownDoctorId ? { doctorId: req.ownDoctorId } : {});

/**
 * Patient filter for doctors: anyone they have an appointment / consultation / lab order with, plus patients they
 * registered themselves. {} for other roles. Contains a top-level $or, so combine it with $and.
 */
async function patientScope(req) {
  if (!req.ownDoctorId) return {};
  const Appointment = require("../models/Appointment");
  const Consultation = require("../models/Consultation");
  const LabOrder = require("../models/LabOrder");
  const f = { tenantId: req.user.tenantId, doctorId: req.ownDoctorId };
  const lists = await Promise.all(
    [Appointment, Consultation, LabOrder].map((M) =>
      M.distinct("patientId", f),
    ),
  );
  return {
    $or: [{ _id: { $in: lists.flat() } }, { registeredBy: req.user._id }],
  };
}

module.exports = { resolveOwnDoctor, own, patientScope, NONE };
