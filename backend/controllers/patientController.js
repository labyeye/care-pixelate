const asyncHandler = require("express-async-handler");
const Patient = require("../models/Patient");
const Tenant = require("../models/Tenant");
const { pick, pageOpts, searchFilter } = require("../utils/pick");
const { assertWithinLimit } = require("../utils/limits");
const { patientScope } = require("../utils/doctorScope");

const FIELDS = ["firstName", "middleName", "lastName", "profileImage", "dateOfBirth", "gender", "bloodGroup", "maritalStatus", "contact", "address", "emergencyContact", "guardian", "medicalSummary", "patientStatus"];

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId, ...searchFilter(req.query.q, ["firstName", "middleName", "lastName", "patientId", "contact.phone", "contact.email"]) };
  const scope = await patientScope(req); // doctors: only their own patients
  if (scope.$or) filter.$and = [scope]; // search above may already use $or
  const { limit, skip } = pageOpts(req.query);
  const [items, total] = await Promise.all([
    Patient.find(filter).select("-profileImage").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Patient.countDocuments(filter),
  ]);
  res.json({ success: true, count: items.length, total, data: items });
});

const getOne = asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...(await patientScope(req)),
  });
  if (!patient) {
    res.status(404);
    throw new Error("Patient not found");
  }
  res.json({ success: true, data: patient });
});

const create = asyncHandler(async (req, res) => {
  await assertWithinLimit(req, res, "patientLimit", () => Patient.countDocuments({ tenantId: req.tenantId }), "patients");
  // Atomic per-tenant counter so UHIDs are sequential and never reused.
  const patient = new Patient({
    ...pick(req.body, FIELDS),
    tenantId: req.tenantId,
    patientId: "pending",
    registeredBy: req.user._id,
  });
  await patient.validate(); // reject bad input before burning an ID
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { "counters.patient": 1 } }, { new: true }).select("counters");
  patient.patientId = `NC-${String(t.counters.patient).padStart(5, "0")}`;
  await patient.save();
  res.status(201).json({ success: true, data: patient });
});

const update = asyncHandler(async (req, res) => {
  const patient = await Patient.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, ...(await patientScope(req)) },
    pick(req.body, FIELDS),
    { new: true, runValidators: true },
  );
  if (!patient) {
    res.status(404);
    throw new Error("Patient not found");
  }
  res.json({ success: true, data: patient });
});

const remove = asyncHandler(async (req, res) => {
  const patient = await Patient.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!patient) {
    res.status(404);
    throw new Error("Patient not found");
  }
  res.json({ success: true, data: {} });
});

module.exports = { getAll, getOne, create, update, remove };
