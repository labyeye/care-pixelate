const asyncHandler = require("express-async-handler");
const Doctor = require("../models/Doctor");
const { pick, pageOpts, searchFilter } = require("../utils/pick");
const { assertWithinLimit } = require("../utils/limits");
const { isDateStr } = require("../utils/slots");
const { freeSlots } = require("./appointmentController");

const Tenant = require("../models/Tenant");
const { Clinic } = require("../models/Compliance");
const Department = require("../models/Department");

// Branch / department ids in the body must belong to the caller's tenant (and a department's branch must be
// one the doctor is assigned to, when it has one).
const assertClinics = async (req, res, body) => {
  const bad = (msg) => {
    res.status(400);
    throw new Error(msg);
  };
  if (Array.isArray(body.clinicIds) && body.clinicIds.length) {
    const n = await Clinic.countDocuments({ _id: { $in: body.clinicIds }, tenantId: req.tenantId });
    if (n !== new Set(body.clinicIds.map(String)).size) bad("One or more locations were not found in this organisation");
  }
  if (Array.isArray(body.departmentIds) && body.departmentIds.length) {
    const deps = await Department.find({ _id: { $in: body.departmentIds }, tenantId: req.tenantId, status: "active" }).select("clinicId");
    if (deps.length !== new Set(body.departmentIds.map(String)).size) bad("One or more departments were not found in this organisation");
    const clinics = new Set((body.clinicIds || []).map(String));
    if (clinics.size && deps.some((d) => d.clinicId && !clinics.has(String(d.clinicId)))) bad("A department belongs to a location this doctor is not assigned to");
  }
  // availability: HH:mm, start before end, and no two windows overlapping on the same day
  if (Array.isArray(body.availability)) {
    const byDay = {};
    for (const w of body.availability) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.startTime || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.endTime || "")) bad("Working hours must be HH:mm");
      if (w.startTime >= w.endTime) bad("Working hours: end time must be after start time");
      const list = (byDay[w.day] = byDay[w.day] || []);
      if (list.some((o) => w.startTime < o.endTime && o.startTime < w.endTime)) bad(`Overlapping working hours on ${w.day}`);
      list.push(w);
    }
  }
};

const FIELDS = ["firstName", "middleName", "lastName", "profileImage", "gender", "dateOfBirth", "contact", "address", "professionalDetails", "consultation", "accountStatus", "availability", "leaveDates", "followUpDays", "userId", "clinicIds", "departmentIds"];

// Verification is an admin decision — stamp who/when instead of trusting the body.
const applyVerification = (body, req) => {
  const v = req.body.verificationStatus;
  if (!["pending", "verified", "rejected"].includes(v)) return body;
  return {
    ...body,
    verificationStatus: v,
    verifiedAt: v === "verified" ? new Date() : null,
    verifiedBy: v === "verified" ? req.user._id : null,
  };
};

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId, ...searchFilter(req.query.q, ["firstName", "lastName", "doctorId", "professionalDetails.specializations", "professionalDetails.registrationNumber"]) };
  const { limit, skip } = pageOpts(req.query);
  const [items, total] = await Promise.all([
    Doctor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Doctor.countDocuments(filter),
  ]);
  res.json({ success: true, count: items.length, total, data: items });
});

const getOne = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  res.json({ success: true, data: doctor });
});

const create = asyncHandler(async (req, res) => {
  await assertWithinLimit(req, res, "doctorLimit", () => Doctor.countDocuments({ tenantId: req.tenantId, accountStatus: "active" }), "doctors");
  await assertClinics(req, res, req.body);
  const doctor = new Doctor({
    ...applyVerification(pick(req.body, FIELDS), req),
    tenantId: req.tenantId,
    doctorId: "pending",
    createdBy: req.user._id,
  });
  await doctor.validate(); // reject bad input before burning an ID
  // Atomic per-tenant counter so doctor IDs are sequential and never reused.
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { "counters.doctor": 1 } }, { new: true }).select("counters");
  doctor.doctorId = `DR-${String(t.counters.doctor).padStart(4, "0")}`;
  await doctor.save();
  res.status(201).json({ success: true, data: doctor });
});

const update = asyncHandler(async (req, res) => {
  await assertClinics(req, res, req.body);
  const doctor = await Doctor.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    applyVerification(pick(req.body, FIELDS), req),
    { new: true, runValidators: true },
  );
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  res.json({ success: true, data: doctor });
});

const remove = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  res.json({ success: true, data: {} });
});

// GET /:id/slots?date=YYYY-MM-DD : free bookable slots for that clinic-local day.
const slots = asyncHandler(async (req, res) => {
  const date = String(req.query.date || "");
  if (!isDateStr(date)) {
    res.status(400);
    throw new Error("date=YYYY-MM-DD is required");
  }
  const doctor = await Doctor.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!doctor) {
    res.status(404);
    throw new Error("Doctor not found");
  }
  const free = await freeSlots(req.tenantId, doctor, date);
  res.json({ success: true, count: free.length, data: free.map((s) => ({ start: s.start, end: s.end })) });
});

module.exports = { getAll, getOne, create, update, remove, slots };
