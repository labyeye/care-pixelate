// Patient-facing API (/api/me/*). Every handler resolves the caller's own Patient profiles
// (self + family) from User._id, so a patient can only ever touch data they own.
const asyncHandler = require("express-async-handler");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Medicine = require("../models/Medicine");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Tenant = require("../models/Tenant");
const {
  Vital,
  MedicineReminder,
  MedicalRecord,
} = require("../models/PatientData");
const { pick, pageOpts } = require("../utils/pick");
const { isDateStr } = require("../utils/slots");
const { assertWithinLimit } = require("../utils/limits");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");
const {
  prepare,
  freeSlots,
  book: bookAppointment,
} = require("./appointmentController");
const { linkFor, joinWindow } = require("../utils/video");
const { notifyAppointment } = require("../utils/whatsapp");

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MIME_OK = ["application/pdf", "image/jpeg", "image/png"];
const PROFILE_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "dateOfBirth",
  "gender",
  "bloodGroup",
  "maritalStatus",
  "contact",
  "address",
  "emergencyContact",
  "guardian",
  "medicalSummary",
];

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

const profilesOf = (req) =>
  Patient.find({ userId: req.user._id, tenantId: req.user.tenantId });

// Resolves ?patientId / body.patientId to an owned profile; defaults to the account's own ("self") profile.
const ownedProfile = async (req, res, id) => {
  const filter = { userId: req.user._id, tenantId: req.user.tenantId };
  if (id) filter._id = id;
  const p = await Patient.findOne(filter).sort({ createdAt: 1 });
  if (!p) fail(res, 404, "Profile not found");
  return p;
};

// ---- profiles (family) ----
const listProfiles = asyncHandler(async (req, res) => {
  const data = await profilesOf(req).sort({ createdAt: 1 });
  res.json({ success: true, count: data.length, data });
});

const addProfile = asyncHandler(async (req, res) => {
  const body = pick(req.body, PROFILE_FIELDS);
  if (!body.firstName || !body.lastName)
    fail(res, 400, "First and last name are required");
  if (!body.dateOfBirth || !body.gender)
    fail(res, 400, "Date of birth and gender are required");
  if (
    (await Patient.countDocuments({
      userId: req.user._id,
      tenantId: req.user.tenantId,
    })) >= 10
  ) {
    fail(res, 400, "You can add up to 10 family members");
  }
  req.tenantId = req.user.tenantId;
  await assertWithinLimit(
    req,
    res,
    "patientLimit",
    () => Patient.countDocuments({ tenantId: req.tenantId }),
    "patients",
  );
  const t = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $inc: { "counters.patient": 1 } },
    { new: true },
  ).select("counters");
  const patient = await Patient.create({
    ...body,
    contact: { ...body.contact, phone: body.contact?.phone || req.user.phone },
    userId: req.user._id,
    registeredBy: req.user._id,
    tenantId: req.tenantId,
    patientId: `NC-${String(t.counters.patient).padStart(5, "0")}`,
  });
  res.status(201).json({ success: true, data: patient });
});

const updateProfile = asyncHandler(async (req, res) => {
  const p = await ownedProfile(req, res, req.params.id);
  p.set(pick(req.body, PROFILE_FIELDS));
  await p.save();
  res.json({ success: true, data: p });
});

// ---- doctors + booking ----
const listDoctors = asyncHandler(async (req, res) => {
  const data = await Doctor.find({
    tenantId: req.user.tenantId,
    accountStatus: "active",
    "consultation.acceptingAppointments": { $ne: false },
  })
    .select(
      "firstName middleName lastName doctorId gender professionalDetails.specializations professionalDetails.qualifications professionalDetails.experienceYears professionalDetails.bio professionalDetails.languages consultation availability",
    )
    .sort({ firstName: 1 });
  res.json({ success: true, count: data.length, data });
});

const doctorSlots = asyncHandler(async (req, res) => {
  const date = String(req.query.date || "");
  if (!isDateStr(date)) fail(res, 400, "date=YYYY-MM-DD is required");
  const doctor = await Doctor.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    accountStatus: "active",
  });
  if (!doctor) fail(res, 404, "Doctor not found");
  const free = await freeSlots(req.user.tenantId, doctor, date);
  res.json({
    success: true,
    count: free.length,
    data: free.map((s) => ({ start: s.start, end: s.end })),
  });
});

const myAppointments = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const { limit, skip } = pageOpts(req.query);
  const data = await Appointment.find({
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  })
    .populate(
      "doctorId",
      "firstName middleName lastName doctorId professionalDetails.specializations",
    )
    .populate(
      "patientId",
      "firstName middleName lastName patientId contact.phone",
    )
    .sort({ scheduledAt: -1 })
    .skip(skip)
    .limit(limit);
  res.json({ success: true, count: data.length, data });
});

const book = asyncHandler(async (req, res) => {
  const profile = await ownedProfile(req, res, req.body.patientId);
  req.tenantId = req.user.tenantId;
  const body = {
    ...pick(req.body, ["doctorId", "scheduledAt", "reason", "type"]),
    patientId: profile._id,
  };
  if (body.type === "walk_in") body.type = "in_clinic"; // walk-ins are a reception action
  if (!body.scheduledAt) fail(res, 400, "Choose a slot");
  await prepare(req, res, body, null);
  const appt = await bookAppointment(req.tenantId, { ...body, source: "app" });
  notifyAppointment("appointment_confirmed", appt._id);
  res.status(201).json({ success: true, data: appt });
});

const cancel = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const appt = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.user.tenantId,
      patientId: { $in: ids },
      status: "scheduled",
      scheduledAt: { $gt: new Date() },
    },
    {
      status: "cancelled",
      cancelReason: String(req.body.reason || "Cancelled by patient").slice(
        0,
        200,
      ),
    },
    { new: true },
  );
  if (!appt) fail(res, 404, "No upcoming appointment to cancel");
  await require("../utils/slotLock").release(appt._id);
  notifyAppointment("appointment_cancelled", appt._id);
  res.json({ success: true, data: appt });
});

// ---- pay the consultation fee online (organisation's own gateway; see paymentController) ----
const ownScope = async (req) => {
  req.tenantId = req.user.tenantId;
  return {
    patientId: { $in: (await profilesOf(req).select("_id")).map((p) => p._id) },
  };
};
const payOrder = asyncHandler(async (req, res) =>
  require("./paymentController").createOrder(
    req,
    res,
    await ownScope(req),
    "patient",
  ),
);
const payStatus = asyncHandler(async (req, res) => {
  const c = await require("../utils/paymentConfig").credsFor(req.user.tenantId);
  res.json({ success: true, data: { enabled: !!c } });
});
const payVerify = asyncHandler(async (req, res) =>
  require("./paymentController").verify(req, res, await ownScope(req)),
);

// ---- video ----
const videoLink = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const appt = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  }).select("+videoRoom");
  if (!appt) fail(res, 404, "Appointment not found");
  const w = joinWindow(appt);
  if (!w.ok) fail(res, 409, w.reason);
  res.json({ success: true, data: { url: linkFor(appt.videoRoom) } });
});

// ---- invoices + lab (read-only for patients; void invoices are hidden) ----
const myInvoices = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const data = await Invoice.find({
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
    status: { $ne: "void" },
  })
    .select(
      "number patientId doctorId items subtotal gst discount total paid status notes dueDate createdAt payments.amount payments.mode payments.reference payments.receivedAt",
    )
    .populate(
      "patientId",
      "firstName middleName lastName patientId dateOfBirth gender address contact",
    )
    .populate(
      "doctorId",
      "firstName middleName lastName professionalDetails.specializations",
    )
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, count: data.length, data });
});

const myLabOrders = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const data = await LabOrder.find({
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
    status: { $ne: "cancelled" },
  })
    .populate("doctorId", "firstName middleName lastName")
    .populate(
      "patientId",
      "firstName middleName lastName patientId dateOfBirth gender address contact",
    )
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ success: true, count: data.length, data });
});

// ---- prescriptions (signed consultations only) ----
const prescriptions = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const data = await Consultation.find({
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
    status: "signed",
  })
    .select(
      "patientId doctorId vitals complaints diagnosis prescription followUpOn signedAt createdAt",
    )
    .populate(
      "doctorId",
      "firstName middleName lastName doctorId professionalDetails.specializations professionalDetails.registrationNumber",
    )
    .populate(
      "patientId",
      "firstName middleName lastName patientId dateOfBirth gender address contact",
    )
    .sort({ signedAt: -1 })
    .limit(100);
  res.json({ success: true, count: data.length, data });
});

// ---- vitals ----
const listVitals = asyncHandler(async (req, res) => {
  const p = await ownedProfile(req, res, req.query.patientId);
  const filter = { tenantId: req.user.tenantId, patientId: p._id };
  if (req.query.type) filter.type = String(req.query.type);
  const data = await Vital.find(filter).sort({ measuredAt: -1 }).limit(200);
  res.json({ success: true, count: data.length, data });
});

const addVital = asyncHandler(async (req, res) => {
  const p = await ownedProfile(req, res, req.body.patientId);
  const v = await Vital.create({
    ...pick(req.body, [
      "type",
      "value",
      "value2",
      "unit",
      "note",
      "measuredAt",
    ]),
    tenantId: req.user.tenantId,
    patientId: p._id,
  });
  res.status(201).json({ success: true, data: v });
});

const deleteVital = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const v = await Vital.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  });
  if (!v) fail(res, 404, "Reading not found");
  res.json({ success: true, data: {} });
});

// ---- medicine reminders ----
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const listReminders = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const data = await MedicineReminder.find({
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  }).sort({ createdAt: -1 });
  res.json({ success: true, count: data.length, data });
});

const addReminder = asyncHandler(async (req, res) => {
  const p = await ownedProfile(req, res, req.body.patientId);
  const times = Array.isArray(req.body.times) ? req.body.times : [];
  if (!req.body.drug || !times.length || !times.every((t) => TIME_RE.test(t))) {
    fail(
      res,
      400,
      "Medicine name and at least one valid HH:MM time are required",
    );
  }
  const link = {};
  if (req.body.medicineId) {
    if (
      !(await Medicine.exists({
        _id: req.body.medicineId,
        tenantId: req.user.tenantId,
      }))
    )
      fail(res, 400, "Medicine not found");
    link.medicineId = req.body.medicineId;
  }
  if (req.body.consultationId) {
    if (
      !(await Consultation.exists({
        _id: req.body.consultationId,
        tenantId: req.user.tenantId,
        patientId: p._id,
      }))
    )
      fail(res, 400, "Prescription not found for this patient");
    link.consultationId = req.body.consultationId;
    if (req.body.prescriptionItemId)
      link.prescriptionItemId = req.body.prescriptionItemId;
  }
  const r = await MedicineReminder.create({
    ...pick(req.body, [
      "drug",
      "dose",
      "frequency",
      "times",
      "startDate",
      "endDate",
      "timezone",
    ]),
    ...link,
    tenantId: req.user.tenantId,
    patientId: p._id,
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: r });
});

const updateReminder = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const r = await MedicineReminder.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.user.tenantId,
      patientId: { $in: ids },
    },
    pick(req.body, ["dose", "times", "endDate", "active"]),
    { new: true, runValidators: true },
  );
  if (!r) fail(res, 404, "Reminder not found");
  res.json({ success: true, data: r });
});

const deleteReminder = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const r = await MedicineReminder.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  });
  if (!r) fail(res, 404, "Reminder not found");
  res.json({ success: true, data: {} });
});

// ---- records locker ----
const listRecords = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const data = await MedicalRecord.find({
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  })
    .select("-data")
    .sort({ recordDate: -1 })
    .limit(200);
  res.json({ success: true, count: data.length, data });
});

// Body: { patientId?, title, type?, recordDate?, mimeType, dataBase64 }
const uploadRecord = asyncHandler(async (req, res) => {
  const p = await ownedProfile(req, res, req.body.patientId);
  const { title, mimeType, dataBase64 } = req.body;
  if (!title || !MIME_OK.includes(mimeType) || typeof dataBase64 !== "string") {
    fail(res, 400, "A title and a PDF/JPEG/PNG file are required");
  }
  const buf = Buffer.from(dataBase64, "base64");
  if (!buf.length || buf.length > MAX_FILE_BYTES)
    fail(res, 400, "File must be between 1 byte and 2 MB");
  // The declared type is client-supplied: the first bytes must actually be that kind of file.
  const MAGIC = {
    "application/pdf": [0x25, 0x50, 0x44, 0x46],
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
  };
  if (!MAGIC[mimeType].every((b, i) => buf[i] === b))
    fail(res, 400, "The file content does not match its type");
  const rec = await MedicalRecord.create({
    ...pick(req.body, ["title", "type", "recordDate"]),
    mimeType,
    size: buf.length,
    data: buf,
    tenantId: req.user.tenantId,
    patientId: p._id,
    uploadedBy: req.user._id,
  });
  const { data, ...meta } = rec.toObject();
  res.status(201).json({ success: true, data: meta });
});

const downloadRecord = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const rec = await MedicalRecord.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  }).select("+data");
  if (!rec) fail(res, 404, "Record not found");
  res.set({
    "Content-Type": rec.mimeType,
    "Content-Disposition": `inline; filename="${rec.title.replace(/[^\w.-]+/g, "_")}"`,
    "X-Content-Type-Options": "nosniff",
  });
  res.send(rec.data);
});

const deleteRecord = asyncHandler(async (req, res) => {
  const ids = (await profilesOf(req).select("_id")).map((p) => p._id);
  const rec = await MedicalRecord.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    patientId: { $in: ids },
  });
  if (!rec) fail(res, 404, "Record not found");
  res.json({ success: true, data: {} });
});

module.exports = {
  payOrder,
  payVerify,
  payStatus,
  listProfiles,
  addProfile,
  updateProfile,
  listDoctors,
  doctorSlots,
  myAppointments,
  book,
  cancel,
  prescriptions,
  videoLink,
  myInvoices,
  myLabOrders,
  listVitals,
  addVital,
  deleteVital,
  listReminders,
  addReminder,
  updateReminder,
  deleteReminder,
  listRecords,
  uploadRecord,
  downloadRecord,
  deleteRecord,
};
