const asyncHandler = require("express-async-handler");
const Patient = require("../models/Patient");
const Tenant = require("../models/Tenant");
const { pick, pageOpts, searchFilter } = require("../utils/pick");
const { assertWithinLimit } = require("../utils/limits");
const { patientScope } = require("../utils/doctorScope");
const { mapRow } = require("../utils/patientImport");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");

const FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "profileImage",
  "dateOfBirth",
  "gender",
  "bloodGroup",
  "maritalStatus",
  "contact",
  "address",
  "emergencyContact",
  "guardian",
  "medicalSummary",
  "patientStatus",
];

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

const getAll = asyncHandler(async (req, res) => {
  const filter = {
    tenantId: req.tenantId,
    ...searchFilter(req.query.q, [
      "firstName",
      "middleName",
      "lastName",
      "patientId",
      "contact.phone",
      "contact.email",
    ]),
  };
  const scope = await patientScope(req); // doctors: only their own patients
  if (scope.$or) filter.$and = [scope]; // search above may already use $or
  const { limit, skip } = pageOpts(req.query);
  const [items, total] = await Promise.all([
    Patient.find(filter)
      .select("-profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
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
  await assertWithinLimit(
    req,
    res,
    "patientLimit",
    () => Patient.countDocuments({ tenantId: req.tenantId }),
    "patients",
  );
  // Atomic per-tenant counter so UHIDs are sequential and never reused.
  const patient = new Patient({
    ...pick(req.body, FIELDS),
    tenantId: req.tenantId,
    patientId: "pending",
    registeredBy: req.user._id,
  });
  await patient.validate(); // reject bad input before burning an ID
  const t = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $inc: { "counters.patient": 1 } },
    { new: true },
  ).select("counters");
  patient.patientId = `NC-${String(t.counters.patient).padStart(5, "0")}`;
  await patient.save();
  res.status(201).json({ success: true, data: patient });
});

const update = asyncHandler(async (req, res) => {
  const patient = await Patient.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      ...(await patientScope(req)),
    },
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

// POST /import { rows: [{...}] }: bulk-add patients from a spreadsheet (parsed in the browser). Bad or duplicate rows are
// skipped and reported, good ones are saved. Duplicate = same mobile number and first name already in this clinic.
const importPatients = asyncHandler(async (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length) fail(res, 400, "No rows to import");
  if (rows.length > 500)
    fail(res, 400, "Import at most 500 patients at a time");

  const tenant = await Tenant.findById(req.tenantId).select("limits");
  const cap = tenant?.limits?.patientLimit;
  const have = await Patient.countDocuments({ tenantId: req.tenantId });
  if (cap && have + rows.length > cap) {
    res.status(402);
    throw new Error(
      `Your plan allows ${cap} patients (you have ${have}). Upgrade in Billing to import more.`,
    );
  }

  const existing = await Patient.find({ tenantId: req.tenantId }).select(
    "firstName contact.phone",
  );
  const seen = new Set(
    existing.map((p) => `${p.contact.phone}|${p.firstName.toLowerCase()}`),
  );
  const skipped = [];
  const docs = [];
  rows.forEach((raw, i) => {
    const m = mapRow(raw);
    if (m.error) return skipped.push({ row: i + 1, reason: m.error });
    const k = `${m.fields.contact.phone}|${m.fields.firstName.toLowerCase()}`;
    if (seen.has(k))
      return skipped.push({
        row: i + 1,
        reason: "Already exists (same mobile and first name)",
      });
    const doc = new Patient({
      ...m.fields,
      tenantId: req.tenantId,
      patientId: "pending",
      registeredBy: req.user._id,
    });
    const err = doc.validateSync();
    if (err)
      return skipped.push({
        row: i + 1,
        reason: Object.values(err.errors)[0].message,
      });
    seen.add(k);
    docs.push(doc);
  });

  if (docs.length) {
    // Reserve the whole block of IDs in one atomic step so concurrent imports/registrations never collide.
    const t = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $inc: { "counters.patient": docs.length } },
      { new: true },
    ).select("counters");
    const first = t.counters.patient - docs.length + 1;
    docs.forEach(
      (d, i) => (d.patientId = `NC-${String(first + i).padStart(5, "0")}`),
    );
    await Patient.insertMany(docs);
  }
  res
    .status(201)
    .json({ success: true, data: { created: docs.length, skipped } });
});

// GET /:id/timeline: everything that happened to one patient, newest first, plus the numbers a receptionist wants at a glance.
const timeline = asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...(await patientScope(req)),
  }).select("_id");
  if (!patient) fail(res, 404, "Patient not found");
  const f = { tenantId: req.tenantId, patientId: patient._id };
  const doc = (p) =>
    p ? `Dr. ${[p.firstName, p.lastName].filter(Boolean).join(" ")}` : "";
  const [appts, cons, invs, labs] = await Promise.all([
    Appointment.find(f)
      .populate("doctorId", "firstName lastName")
      .sort({ scheduledAt: -1 })
      .limit(50),
    Consultation.find(f)
      .populate("doctorId", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(50),
    Invoice.find({ ...f, status: { $ne: "void" } })
      .sort({ createdAt: -1 })
      .limit(50),
    LabOrder.find(f).sort({ createdAt: -1 }).limit(50),
  ]);

  const events = [
    ...appts.map((a) => ({
      type: "appointment",
      date: a.scheduledAt,
      title: `Appointment with ${doc(a.doctorId)}`,
      detail: [a.status.replace("_", " "), a.type?.replace("_", " "), a.reason]
        .filter(Boolean)
        .join(" · "),
      id: a._id,
    })),
    ...cons.map((c) => ({
      type: "consultation",
      date: c.createdAt,
      title: `Consultation, ${doc(c.doctorId)}`,
      detail: [
        c.diagnosis?.join(", "),
        c.prescription?.items?.length
          ? `${c.prescription.items.length} medicines`
          : "",
        c.followUpOn
          ? `follow-up ${c.followUpOn.toISOString().slice(0, 10)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      id: c._id,
    })),
    ...invs.map((i) => ({
      type: "invoice",
      date: i.createdAt,
      title: `Invoice ${i.number}`,
      detail: `Rs. ${i.total} · paid Rs. ${i.paid} · ${i.status}`,
      id: i._id,
    })),
    ...labs.map((l) => ({
      type: "lab",
      date: l.createdAt,
      title: `Lab order ${l.number}`,
      detail: [l.tests.map((t) => t.name).join(", "), l.status].join(" · "),
      id: l._id,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const done = appts.filter((a) => a.status === "completed");
  const nextFollow = cons
    .filter(
      (c) =>
        c.followUpOn && c.followUpOn >= new Date(Date.now() - 24 * 3600 * 1000),
    )
    .map((c) => c.followUpOn)
    .sort((a, b) => a - b)[0];
  res.json({
    success: true,
    data: {
      summary: {
        visits: done.length,
        lastVisit: done[0]?.scheduledAt || null,
        nextAppointment:
          appts
            .filter(
              (a) => a.status === "scheduled" && a.scheduledAt > new Date(),
            )
            .map((a) => a.scheduledAt)
            .sort((a, b) => a - b)[0] || null,
        nextFollowUp: nextFollow || null,
        outstanding:
          Math.round(
            invs.reduce((s, i) => s + Math.max(0, i.total - i.paid), 0) * 100,
          ) / 100,
      },
      events,
    },
  });
});

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  importPatients,
  timeline,
};
