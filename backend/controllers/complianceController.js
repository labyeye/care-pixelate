const asyncHandler = require("express-async-handler");
const Tenant = require("../models/Tenant");
const Patient = require("../models/Patient");
const {
  AuditLog,
  Clinic,
  AbhaLink,
  ConsentLog,
} = require("../models/Compliance");
const { pick, pageOpts } = require("../utils/pick");
const { draftFromTranscript, MAX_INPUT } = require("../utils/scribe");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// ---- audit trail (read-only) ----
const auditList = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  for (const k of ["resource", "resourceId", "userId", "action"])
    if (req.query[k]) filter[k] = String(req.query[k]);
  const from = req.query.from && new Date(String(req.query.from));
  const to = req.query.to && new Date(String(req.query.to));
  if ((from && !isNaN(from)) || (to && !isNaN(to))) {
    filter.at = {};
    if (from && !isNaN(from)) filter.at.$gte = from;
    if (to && !isNaN(to)) filter.at.$lte = to;
  }
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("userId", "name email")
      .sort({ at: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

// ---- branches ----
// Branch cap per plan (pricing page: multi-branch is a Clinic/Hospital feature).
const BRANCH_LIMIT = {
  trial: 1,
  basic: 1,
  starter: 1,
  pro: 1,
  clinic: 10,
  enterprise: 100,
};

const clinicList = asyncHandler(async (req, res) => {
  const data = await Clinic.find({ tenantId: req.tenantId }).sort({
    createdAt: 1,
  });
  res.json({ success: true, count: data.length, data });
});

const clinicCreate = asyncHandler(async (req, res) => {
  const t = await Tenant.findById(req.tenantId).select("plan");
  const cap = BRANCH_LIMIT[t?.plan] ?? 1;
  if ((await Clinic.countDocuments({ tenantId: req.tenantId })) >= cap) {
    fail(
      res,
      402,
      `Your plan allows ${cap} location${cap > 1 ? "s" : ""}. Upgrade to the Clinic plan for multi-branch.`,
    );
  }
  const c = await Clinic.create({
    ...pick(req.body, ["name", "code", "address", "phone"]),
    tenantId: req.tenantId,
  });
  res.status(201).json({ success: true, data: c });
});

const clinicUpdate = asyncHandler(async (req, res) => {
  const c = await Clinic.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    pick(req.body, ["name", "address", "phone", "status"]),
    {
      new: true,
      runValidators: true,
    },
  );
  if (!c) fail(res, 404, "Location not found");
  res.json({ success: true, data: c });
});

const clinicDelete = asyncHandler(async (req, res) => {
  const Appointment = require("../models/Appointment");
  const Doctor = require("../models/Doctor");
  const id = req.params.id;
  const [appts, docs] = await Promise.all([
    Appointment.exists({ tenantId: req.tenantId, clinicId: id }),
    Doctor.exists({ tenantId: req.tenantId, clinicIds: id }),
  ]);
  if (appts || docs)
    fail(
      res,
      409,
      "This location has appointments or doctors. Deactivate it instead of deleting.",
    );
  const c = await Clinic.findOneAndDelete({ _id: id, tenantId: req.tenantId });
  if (!c) fail(res, 404, "Location not found");
  res.json({ success: true, data: {} });
});

// ---- ABHA (capture + format check only; verification needs an NHA-approved ABDM integration) ----
const ABHA_NUMBER = /^\d{14}$/;
const ABHA_ADDRESS = /^[a-z0-9._]{4,}@(abdm|sbx)$/;

const abhaClean = (res, body) => {
  const number = String(body.abhaNumber || "").replace(/[\s-]/g, "");
  const address = String(body.abhaAddress || "")
    .trim()
    .toLowerCase();
  if (!ABHA_NUMBER.test(number))
    fail(res, 400, "ABHA number must be 14 digits");
  if (address && !ABHA_ADDRESS.test(address))
    fail(res, 400, "ABHA address looks like name@abdm");
  return { abhaNumber: number, abhaAddress: address };
};

const abhaGet = asyncHandler(async (req, res) => {
  const link = await AbhaLink.findOne({
    tenantId: req.tenantId,
    patientId: req.params.patientId,
  });
  res.json({ success: true, data: link });
});

const abhaPut = asyncHandler(async (req, res) => {
  const clean = abhaClean(res, req.body);
  if (
    !(await Patient.exists({
      _id: req.params.patientId,
      tenantId: req.tenantId,
    }))
  )
    fail(res, 404, "Patient not found");
  // Changing the number resets verification: a different ID has not been verified.
  const link = await AbhaLink.findOneAndUpdate(
    { tenantId: req.tenantId, patientId: req.params.patientId },
    { ...clean, status: "unverified", linkedBy: req.user._id },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, data: link });
});

const abhaDelete = asyncHandler(async (req, res) => {
  await AbhaLink.deleteOne({
    tenantId: req.tenantId,
    patientId: req.params.patientId,
  });
  res.json({ success: true, data: {} });
});

// ---- AI scribe ----
const scribe = asyncHandler(async (req, res) => {
  const transcript = String(req.body.transcript || "").trim();
  if (transcript.length < 20)
    fail(
      res,
      400,
      "Add the consultation notes or transcript (at least a sentence)",
    );
  if (transcript.length > MAX_INPUT)
    fail(res, 400, `Keep the transcript under ${MAX_INPUT} characters`);
  const t = await Tenant.findById(req.tenantId).select("activeModules");
  if (!t?.activeModules?.includes("ai_scribe")) {
    fail(
      res,
      403,
      "AI scribe is off for this organisation. An admin can enable it in Settings.",
    );
  }
  try {
    res.json({
      success: true,
      data: await draftFromTranscript(transcript),
      notice: "AI draft: review every field before saving.",
    });
  } catch (err) {
    res.status(err.statusCode || 502);
    throw new Error(
      err.statusCode
        ? err.message
        : `Could not generate a draft: ${err.message}`,
    );
  }
});

module.exports = {
  auditList,
  clinicList,
  clinicCreate,
  clinicUpdate,
  clinicDelete,
  abhaGet,
  abhaPut,
  abhaDelete,
  abhaClean,
  scribe,
  BRANCH_LIMIT,
  ConsentLog,
};
