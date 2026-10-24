const asyncHandler = require("express-async-handler");
const Consultation = require("../models/Consultation");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Medicine = require("../models/Medicine");
const { pick, pageOpts, searchFilter } = require("../utils/pick");
const { own } = require("../utils/doctorScope");
const { interactionWarnings } = require("../utils/interactions");
const { notifyPatient } = require("../utils/whatsapp");

const FIELDS = [
  "vitals",
  "complaints",
  "diagnosis",
  "notes",
  "followUpOn",
  "prescription",
];

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// Soft alert only: a doctor may knowingly prescribe, but must be told.
const allergyWarnings = (patient, items = []) => {
  const allergies = (
    (patient && patient.medicalSummary && patient.medicalSummary.allergies) ||
    []
  )
    .map((a) => a.toLowerCase().trim())
    .filter(Boolean);
  return items
    .filter((i) => allergies.some((a) => i.drug.toLowerCase().includes(a)))
    .map((i) => `${i.drug} may conflict with a recorded allergy`);
};

const rxWarnings = (patient, rx) => [
  ...allergyWarnings(patient, rx && rx.items),
  ...interactionWarnings(rx && rx.items),
];

// Prescription items may point at the catalog (medicineId). Verify the medicine belongs to this tenant and
// snapshot its name/strength/form so the prescription still reads the same if the catalog changes later.
// Old-style items (just `drug`) and drugs outside the catalog stay valid. Nothing is dispensed here.
const normalizeRx = async (req, res, rx) => {
  if (!rx || !Array.isArray(rx.items)) return rx;
  if (rx.items.length > 60)
    fail(res, 400, "A prescription can have at most 60 items");
  const ids = rx.items.map((i) => i && i.medicineId).filter(Boolean);
  if (ids.some((id) => !/^[0-9a-f]{24}$/i.test(String(id))))
    fail(res, 400, "Invalid medicine in prescription");
  const meds = ids.length
    ? await Medicine.find({ _id: { $in: ids }, tenantId: req.tenantId })
    : [];
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const items = rx.items.map((raw, i) => {
    const it = { ...raw };
    if (it.medicineId) {
      const m = byId.get(String(it.medicineId));
      if (!m)
        fail(
          res,
          400,
          `Prescription item ${i + 1}: medicine not found in this organisation`,
        );
      it.drug = String(it.drug || "").trim() || m.name;
      it.genericName = m.genericName;
      it.strength = m.strength;
      it.dosageForm = m.dosageForm;
    }
    if (!String(it.drug || "").trim())
      fail(res, 400, `Prescription item ${i + 1}: medicine name is required`);
    for (const k of ["days", "quantity"]) {
      if (
        it[k] !== undefined &&
        it[k] !== null &&
        it[k] !== "" &&
        !(Number(it[k]) >= 0)
      )
        fail(res, 400, `Prescription item ${i + 1}: invalid ${k}`);
    }
    return it;
  });
  return { ...rx, items };
};

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (req.query.patientId) filter.patientId = String(req.query.patientId);
  if (req.query.appointmentId)
    filter.appointmentId = String(req.query.appointmentId);
  if (["draft", "signed"].includes(req.query.status))
    filter.status = req.query.status;
  if (/^[0-9a-f]{24}$/i.test(String(req.query.doctorId || "")))
    filter.doctorId = String(req.query.doctorId);
  Object.assign(filter, own(req)); // doctors: own consultations only

  // from/to are clinic-local calendar days (IST), inclusive
  const from = req.query.from && new Date(`${req.query.from}T00:00:00+05:30`);
  const to = req.query.to && new Date(`${req.query.to}T23:59:59.999+05:30`);
  if ((from && !isNaN(from)) || (to && !isNaN(to))) {
    filter.createdAt = {};
    if (from && !isNaN(from)) filter.createdAt.$gte = from;
    if (to && !isNaN(to)) filter.createdAt.$lte = to;
  }

  // search = patient name / patient ID, resolved to patient ids first
  const q = String(req.query.q || "").trim();
  if (q) {
    const ids = await Patient.find({
      tenantId: req.tenantId,
      ...searchFilter(q, ["firstName", "middleName", "lastName", "patientId"]),
    })
      .select("_id")
      .limit(200);
    const idList = ids.map((p) => String(p._id));
    filter.patientId = {
      $in: filter.patientId
        ? idList.filter((id) => id === filter.patientId)
        : idList,
    };
  }
  const { limit, skip } = pageOpts(req.query);
  const [items, total] = await Promise.all([
    Consultation.find(filter)
      .populate("patientId", "firstName middleName lastName patientId")
      .populate(
        "doctorId",
        "firstName middleName lastName doctorId professionalDetails.specializations",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Consultation.countDocuments(filter),
  ]);
  res.json({ success: true, count: items.length, total, data: items });
});

const getOne = asyncHandler(async (req, res) => {
  const c = await Consultation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  })
    .populate(
      "patientId",
      "firstName middleName lastName patientId dateOfBirth gender contact.phone address medicalSummary.allergies",
    )
    .populate(
      "doctorId",
      "firstName middleName lastName doctorId professionalDetails.specializations professionalDetails.qualifications professionalDetails.registrationNumber",
    );
  if (!c) fail(res, 404, "Consultation not found");
  res.json({ success: true, data: c });
});

// POST: started from an appointment, so patient/doctor can't be spoofed.
const create = asyncHandler(async (req, res) => {
  const appt = await Appointment.findOne({
    _id: req.body.appointmentId,
    tenantId: req.tenantId,
    ...own(req),
  });
  if (!appt) fail(res, 400, "Appointment not found in this organisation");
  if (
    await Consultation.exists({
      tenantId: req.tenantId,
      appointmentId: appt._id,
    })
  ) {
    fail(res, 409, "A consultation already exists for this appointment");
  }
  const patient = await Patient.findOne({
    _id: appt.patientId,
    tenantId: req.tenantId,
  }).select("medicalSummary.allergies");
  const fields = pick(req.body, FIELDS);
  if (fields.prescription)
    fields.prescription = await normalizeRx(req, res, fields.prescription);
  let c;
  try {
    c = await Consultation.create({
      ...fields,
      tenantId: req.tenantId,
      appointmentId: appt._id,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
    });
  } catch (e) {
    if (e.code === 11000)
      fail(res, 409, "A consultation already exists for this appointment"); // lost a race with a second request
    throw e;
  }
  await Appointment.updateOne(
    { _id: appt._id, tenantId: req.tenantId, status: "scheduled" },
    [
      {
        $set: {
          startedAt: { $ifNull: ["$startedAt", "$$NOW"] },
          checkedInAt: { $ifNull: ["$checkedInAt", "$$NOW"] },
        },
      },
    ],
  );
  res.status(201).json({
    success: true,
    data: c,
    warnings: rxWarnings(patient, c.prescription),
  });
});

const update = asyncHandler(async (req, res) => {
  const c = await Consultation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  });
  if (!c) fail(res, 404, "Consultation not found");
  if (c.status === "signed")
    fail(res, 409, "A signed consultation can no longer be edited");
  const fields = pick(req.body, FIELDS);
  if (fields.prescription)
    fields.prescription = await normalizeRx(req, res, fields.prescription);
  c.set(fields);
  await c.save();
  const patient = await Patient.findOne({
    _id: c.patientId,
    tenantId: req.tenantId,
  }).select("medicalSummary.allergies");
  res.json({
    success: true,
    data: c,
    warnings: rxWarnings(patient, c.prescription),
  });
});

// POST /:id/sign: locks the record and completes the appointment.
const sign = asyncHandler(async (req, res) => {
  const c = await Consultation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  });
  if (!c) fail(res, 404, "Consultation not found");
  if (c.status === "signed") return res.json({ success: true, data: c });
  // Atomic draft -> signed: two simultaneous signs can't both win, and the signer is recorded.
  const signed = await Consultation.findOneAndUpdate(
    { _id: c._id, tenantId: req.tenantId, status: "draft" },
    {
      $set: { status: "signed", signedAt: new Date(), signedBy: req.user._id },
    },
    { new: true },
  );
  if (!signed)
    return res.json({
      success: true,
      data: await Consultation.findById(c._id),
    });
  c.set(signed.toObject());
  if (c.appointmentId) {
    await Appointment.updateOne(
      { _id: c.appointmentId, tenantId: req.tenantId, status: "scheduled" },
      { status: "completed", completedAt: new Date() },
    );
  }
  notifyPatient({
    tenantId: req.tenantId,
    patientId: c.patientId,
    doctorId: c.doctorId,
    key: "prescription_ready",
    ref: { kind: "consultation", id: c._id },
  });
  res.json({ success: true, data: c });
});

// DELETE /:id: drafts only.
const discard = asyncHandler(async (req, res) => {
  const c = await Consultation.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.tenantId,
    status: "draft",
    ...own(req),
  });
  if (!c)
    fail(
      res,
      409,
      "Only an existing draft can be discarded; signed consultations are permanent",
    );
  res.json({ success: true, data: {} });
});

// ---------------------------------------------------------------- intake / triage (vitals before the doctor)
const VITAL_RULES = {
  pulse: [20, 250, "Pulse (bpm)"],
  tempC: [30, 45, "Temperature (°C)"],
  spo2: [50, 100, "SpO₂ (%)"],
  weightKg: [0.5, 500, "Weight (kg)"],
  heightCm: [20, 250, "Height (cm)"],
};

// Validates and returns only the vitals that were actually provided.
const cleanVitals = (res, raw) => {
  const v = raw && typeof raw === "object" ? raw : {};
  const out = {};
  if (v.bp !== undefined && String(v.bp).trim() !== "") {
    const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(String(v.bp).trim());
    if (!m) fail(res, 400, "Blood pressure must look like 120/80");
    const [sys, dia] = [Number(m[1]), Number(m[2])];
    if (sys < 60 || sys > 260 || dia < 30 || dia > 160 || dia >= sys)
      fail(res, 400, "Blood pressure values are out of range");
    out.bp = `${sys}/${dia}`;
  }
  for (const [k, [lo, hi, label]] of Object.entries(VITAL_RULES)) {
    if (v[k] === undefined || v[k] === null || v[k] === "") continue;
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < lo || n > hi)
      fail(res, 400, `${label} must be between ${lo} and ${hi}`);
    out[k] = n;
  }
  if (!Object.keys(out).length) fail(res, 400, "Enter at least one vital sign");
  return out;
};

const triageShape = (c) => ({
  vitals: c.vitals || {},
  complaints: c.complaints || "",
  recordedBy: c.vitalsRecordedBy
    ? { name: c.vitalsRecordedByName, role: c.vitalsRecordedByRole }
    : null,
  recordedAt: c.vitalsRecordedAt || null,
  consultationStatus: c.status,
});

// GET /api/appointments/:id/vitals — what intake has recorded so far (open to anyone who can see the appointment).
const getTriage = asyncHandler(async (req, res) => {
  const appt = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  }).select("_id");
  if (!appt) fail(res, 404, "Appointment not found");
  const c = await Consultation.findOne({
    tenantId: req.tenantId,
    appointmentId: appt._id,
  });
  res.json({
    success: true,
    data: c
      ? triageShape(c)
      : {
          vitals: {},
          complaints: "",
          recordedBy: null,
          recordedAt: null,
          consultationStatus: null,
        },
  });
});

// PUT /api/appointments/:id/vitals { vitals: { bp, pulse, tempC, spo2, weightKg, heightCm }, complaints? }
// Creates (or updates) the visit's DRAFT consultation with these values, so the doctor opens it pre-filled.
// Never touches diagnosis / prescription / notes, and never a signed record.
const saveTriage = asyncHandler(async (req, res) => {
  const appt = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  });
  if (!appt) fail(res, 404, "Appointment not found");
  if (appt.status !== "scheduled")
    fail(
      res,
      409,
      `Vitals can only be recorded for a scheduled visit (this one is ${appt.status})`,
    );
  const vitals = cleanVitals(res, req.body.vitals);
  const complaint = String(req.body.complaints || "")
    .trim()
    .slice(0, 500);

  const set = {
    vitalsRecordedBy: req.user._id,
    vitalsRecordedByName: req.user.name || "",
    vitalsRecordedByRole: req.user.role || "",
    vitalsRecordedAt: new Date(),
  };
  for (const [k, val] of Object.entries(vitals)) set[`vitals.${k}`] = val;

  let c;
  try {
    // status:"draft" in the filter: if a signed consultation exists the upsert collides with the unique
    // (tenant, appointment) index instead of editing a signed record.
    c = await Consultation.findOneAndUpdate(
      { tenantId: req.tenantId, appointmentId: appt._id, status: "draft" },
      {
        $set: set,
        $setOnInsert: {
          patientId: appt.patientId,
          doctorId: appt.doctorId,
          status: "draft",
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (e) {
    if (e.code === 11000)
      fail(
        res,
        409,
        "This consultation is already signed and can no longer be changed",
      );
    throw e;
  }
  // The intake complaint only fills an empty field — it never overwrites what the doctor wrote.
  if (complaint && !c.complaints) {
    c.complaints = complaint;
    await c.save();
  }
  res.json({ success: true, data: triageShape(c) });
});

module.exports = {
  getAll,
  getOne,
  create,
  update,
  sign,
  discard,
  allergyWarnings,
  getTriage,
  saveTriage,
};
