// Patient-side DPDP rights: export my data, record consent choices, request erasure.
const asyncHandler = require("express-async-handler");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");
const {
  Vital,
  MedicineReminder,
  MedicalRecord,
} = require("../models/PatientData");
const { AbhaLink, ConsentLog } = require("../models/Compliance");
const { abhaClean } = require("./complianceController");

const PURPOSES = ["whatsapp", "data_sharing", "ai_scribe", "marketing"];

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// Everything the clinic holds for this account, as one JSON download. Record files are listed (not inlined).
const exportMine = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenantId;
  const profiles = await Patient.find({ userId: req.user._id, tenantId });
  const ids = profiles.map((p) => p._id);
  const by = { tenantId, patientId: { $in: ids } };
  const [
    appointments,
    consultations,
    vitals,
    reminders,
    invoices,
    labOrders,
    records,
    abha,
    consents,
  ] = await Promise.all([
    Appointment.find(by),
    Consultation.find(by),
    Vital.find(by),
    MedicineReminder.find(by),
    Invoice.find(by),
    LabOrder.find(by),
    MedicalRecord.find(by).select("-data"),
    AbhaLink.find(by),
    ConsentLog.find({ tenantId, userId: req.user._id }).sort({ at: 1 }),
  ]);
  res.set("Content-Disposition", 'attachment; filename="my-health-data.json"');
  res.json({
    exportedAt: new Date(),
    account: {
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
    },
    profiles,
    appointments,
    consultations,
    vitals,
    reminders,
    invoices,
    labOrders,
    records,
    abha,
    consents,
  });
});

// Latest decision per purpose.
const consentsMine = asyncHandler(async (req, res) => {
  const rows = await ConsentLog.find({
    tenantId: req.user.tenantId,
    userId: req.user._id,
  }).sort({ at: -1 });
  const latest = {};
  for (const r of rows)
    if (!(r.purpose in latest))
      latest[r.purpose] = { granted: r.granted, at: r.at };
  res.json({ success: true, data: latest });
});

const setConsent = asyncHandler(async (req, res) => {
  const { purpose, granted } = req.body;
  if (!PURPOSES.includes(purpose) || typeof granted !== "boolean")
    fail(res, 400, "Invalid consent choice");
  const row = await ConsentLog.create({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    purpose,
    granted,
    ip: req.ip,
  });
  res.status(201).json({ success: true, data: row });
});

// Recorded for the clinic to action (they may need to retain records by law); never auto-deletes anything.
const requestDeletion = asyncHandler(async (req, res) => {
  const row = await ConsentLog.create({
    tenantId: req.user.tenantId,
    userId: req.user._id,
    purpose: "deletion_request",
    granted: true,
    ip: req.ip,
  });
  res
    .status(201)
    .json({
      success: true,
      data: row,
      message: "Your request was sent to the clinic.",
    });
});

// ---- own ABHA ----
const abhaMine = asyncHandler(async (req, res) => {
  const me = await Patient.findOne({
    userId: req.user._id,
    tenantId: req.user.tenantId,
  })
    .sort({ createdAt: 1 })
    .select("_id");
  if (!me) fail(res, 404, "Profile not found");
  res.json({
    success: true,
    data: await AbhaLink.findOne({
      tenantId: req.user.tenantId,
      patientId: me._id,
    }),
  });
});

const setAbhaMine = asyncHandler(async (req, res) => {
  const clean = abhaClean(res, req.body);
  const me = await Patient.findOne({
    userId: req.user._id,
    tenantId: req.user.tenantId,
  })
    .sort({ createdAt: 1 })
    .select("_id");
  if (!me) fail(res, 404, "Profile not found");
  const link = await AbhaLink.findOneAndUpdate(
    { tenantId: req.user.tenantId, patientId: me._id },
    { ...clean, status: "unverified", linkedBy: req.user._id },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, data: link });
});

// Admin view of erasure requests.
const deletionRequests = asyncHandler(async (req, res) => {
  const data = await ConsentLog.find({
    tenantId: req.tenantId,
    purpose: "deletion_request",
  })
    .populate("userId", "name email phone")
    .sort({ at: -1 })
    .limit(200);
  res.json({ success: true, count: data.length, data });
});

module.exports = {
  exportMine,
  consentsMine,
  setConsent,
  requestDeletion,
  abhaMine,
  setAbhaMine,
  deletionRequests,
};
