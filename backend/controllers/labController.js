const asyncHandler = require("express-async-handler");
const LabOrder = require("../models/LabOrder");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const LabTest = require("../models/LabTest");
const { pageOpts } = require("../utils/pick");
const { own } = require("../utils/doctorScope");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// Numeric result vs reference range -> low/normal/high; non-numeric results are left unflagged.
const flagFor = (t) => {
  const v = parseFloat(t.result);
  if (!Number.isFinite(v) || (t.refLow == null && t.refHigh == null)) return "";
  if (t.refLow != null && v < t.refLow) return "low";
  if (t.refHigh != null && v > t.refHigh) return "high";
  return "normal";
};

const cleanTests = (res, tests) => {
  if (!Array.isArray(tests) || !tests.length || tests.length > 50) fail(res, 400, "Add 1-50 tests");
  return tests.map((t) => {
    if (!t || !String(t.name || "").trim()) fail(res, 400, "Every test needs a name");
    const out = {
      name: String(t.name).trim().slice(0, 120),
      result: String(t.result ?? "").trim().slice(0, 120),
      unit: String(t.unit ?? "").trim().slice(0, 30),
      refLow: t.refLow === "" || t.refLow == null ? undefined : Number(t.refLow),
      refHigh: t.refHigh === "" || t.refHigh == null ? undefined : Number(t.refHigh),
    };
    if ((out.refLow !== undefined && isNaN(out.refLow)) || (out.refHigh !== undefined && isNaN(out.refHigh))) {
      fail(res, 400, "Reference range must be numeric");
    }
    if (t.testId) out.testId = t.testId; // verified against the catalogue by checkCatalog()
    if (t.code) out.code = String(t.code).slice(0, 30);
    if (t.specimenType) out.specimenType = String(t.specimenType).slice(0, 40);
    out.flag = flagFor(out);
    return out;
  });
};

const PERFORMERS = ["lab_technician", "nurse", "hospital_admin", "tenant_owner", "doctor"];

// "Who is performing" must be an active staff login inside this tenant.
const assertPerformer = async (req, res, id) => {
  const u = await User.findOne({ _id: id, tenantId: req.tenantId, status: "active", role: { $in: PERFORMERS } }).select("_id");
  if (!u) fail(res, 400, "Selected staff member was not found in this organisation");
  return u._id;
};

const stage = (req, status, note = "") => ({
  status,
  at: new Date(),
  by: req.user._id,
  byName: req.user.name || "",
  byRole: req.user.role || "",
  note: String(note || "").slice(0, 300),
});

const POPULATE = [
  ["patientId", "firstName middleName lastName patientId dateOfBirth gender contact.phone"],
  ["doctorId", "firstName middleName lastName"],
  ["assignedTo", "name role"],
  ["collectedBy", "name role"],
  ["resultedBy", "name role"],
];
const withRefs = (q) => POPULATE.reduce((acc, [p, s]) => acc.populate(p, s), q);

// GET /technicians — staff who can be assigned (lab techs, nurses, admins). Open to everyone who can see lab orders.
const technicians = asyncHandler(async (req, res) => {
  const data = await User.find({ tenantId: req.tenantId, status: "active", role: { $in: PERFORMERS } }).select("name role").sort({ name: 1 });
  res.json({ success: true, count: data.length, data });
});

// testId, when sent, must be a catalogue test of this tenant. The order keeps its own name/unit/range snapshot.
const checkCatalog = async (req, res, tests) => {
  const ids = tests.map((t) => t.testId).filter(Boolean);
  if (!ids.length) return;
  if (ids.some((id) => !/^[0-9a-f]{24}$/i.test(String(id)))) fail(res, 400, "Invalid test reference");
  const n = await LabTest.countDocuments({ _id: { $in: ids }, tenantId: req.tenantId });
  if (n !== new Set(ids.map(String)).size) fail(res, 400, "A selected test is not in this organisation's catalogue");
};

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.patientId) filter.patientId = String(req.query.patientId);
  Object.assign(filter, own(req)); // doctors: only orders they placed
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    withRefs(LabOrder.find(filter)).sort({ createdAt: -1 }).skip(skip).limit(limit),
    LabOrder.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

const getOne = asyncHandler(async (req, res) => {
  const o = await withRefs(LabOrder.findOne({ _id: req.params.id, tenantId: req.tenantId, ...own(req) }));
  if (!o) fail(res, 404, "Lab order not found");
  res.json({ success: true, data: o });
});

const create = asyncHandler(async (req, res) => {
  const { patientId, consultationId, notes, assignedTo } = req.body;
  const doctorId = req.ownDoctorId ? String(req.ownDoctorId) : req.body.doctorId; // a doctor orders under their own name
  const [patient, doctor] = await Promise.all([
    Patient.exists({ _id: patientId, tenantId: req.tenantId }),
    doctorId ? Doctor.exists({ _id: doctorId, tenantId: req.tenantId }) : true,
  ]);
  if (!patient || !doctor) fail(res, 400, "Patient or doctor not found in this organisation");
  // Results are entered later; an order starts with names only.
  const tests = cleanTests(res, (req.body.tests || []).map((t) => ({ name: t.name, unit: t.unit, refLow: t.refLow, refHigh: t.refHigh, testId: t.testId, code: t.code, specimenType: t.specimenType })));
  await checkCatalog(req, res, tests);
  const performer = assignedTo ? await assertPerformer(req, res, assignedTo) : undefined;
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { "counters.lab": 1 } }, { new: true }).select("counters");
  const order = await LabOrder.create({
    tenantId: req.tenantId,
    number: `LAB-${new Date().getFullYear()}-${String(t.counters.lab).padStart(5, "0")}`,
    patientId,
    doctorId: doctorId || undefined,
    consultationId: consultationId || undefined,
    tests,
    notes: notes ? String(notes).slice(0, 500) : "",
    assignedTo: performer,
    stages: [stage(req, "ordered", notes ? "Order placed" : "")],
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: await withRefs(LabOrder.findById(order._id)) });
});

// PUT /:id: lab tech marks collected, or enters results. Resulted once every test has a value.
const update = asyncHandler(async (req, res) => {
  const o = await LabOrder.findOne({ _id: req.params.id, tenantId: req.tenantId, ...own(req) });
  if (!o) fail(res, 404, "Lab order not found");
  if (o.status === "cancelled") fail(res, 409, "This order was cancelled");

  const note = req.body.note;
  if (req.body.assignedTo !== undefined) {
    o.assignedTo = req.body.assignedTo ? await assertPerformer(req, res, req.body.assignedTo) : undefined;
  }

  if (req.body.status === "cancelled") {
    if (o.status === "resulted") fail(res, 409, "A resulted order cannot be cancelled");
    o.status = "cancelled";
    o.stages.push(stage(req, "cancelled", note || "Order cancelled"));
  } else if (req.body.status === "collected" && o.status === "ordered") {
    o.status = "collected";
    o.collectedAt = new Date();
    o.collectedBy = req.user._id;
    o.stages.push(stage(req, "collected", note || "Sample collected"));
  }
  if (req.body.tests !== undefined) {
    const tests = cleanTests(res, req.body.tests);
    if (tests.length !== o.tests.length) fail(res, 400, "Results must cover every ordered test");
    o.tests = tests.map((t, i) => ({ ...t, name: o.tests[i].name })); // names are fixed once ordered
    if (o.tests.every((t) => t.result)) {
      const wasCollected = !!o.collectedAt;
      o.status = "resulted";
      o.resultedAt = new Date();
      o.resultedBy = req.user._id;
      if (!wasCollected) {
        // Results entered without a separate "collected" click — record both steps honestly.
        o.collectedAt = o.resultedAt;
        o.collectedBy = req.user._id;
        o.stages.push(stage(req, "collected", "Sample collected (recorded with results)"));
      }
      o.stages.push(stage(req, "resulted", note || "Results entered"));
    }
  }
  await o.save();
  res.json({ success: true, data: await withRefs(LabOrder.findById(o._id)) });
});

// PUT /:id/details — edit the order itself (ordering doctor, performer, notes, test definitions).
// Results/status keep going through PUT /:id. Test definitions lock once any result is entered.
const updateDetails = asyncHandler(async (req, res) => {
  const o = await LabOrder.findOne({ _id: req.params.id, tenantId: req.tenantId, ...own(req) });
  if (!o) fail(res, 404, "Lab order not found");
  if (o.status === "cancelled") fail(res, 409, "A cancelled order cannot be edited");
  const { assignedTo, notes, tests } = req.body;
  const doctorId = req.ownDoctorId ? undefined : req.body.doctorId; // doctors can't reassign an order

  if (doctorId !== undefined) {
    if (doctorId && !(await Doctor.exists({ _id: doctorId, tenantId: req.tenantId }))) fail(res, 400, "Doctor not found in this organisation");
    o.doctorId = doctorId || undefined;
  }
  if (assignedTo !== undefined) o.assignedTo = assignedTo ? await assertPerformer(req, res, assignedTo) : undefined;
  if (notes !== undefined) o.notes = String(notes).slice(0, 500);
  if (tests !== undefined) {
    if (o.status === "resulted" || o.tests.some((t) => t.result)) fail(res, 409, "Tests can't be changed after results are entered");
    o.tests = cleanTests(res, tests.map((t) => ({ name: t.name, unit: t.unit, refLow: t.refLow, refHigh: t.refHigh, testId: t.testId, code: t.code, specimenType: t.specimenType })));
    await checkCatalog(req, res, o.tests);
  }
  await o.save();
  res.json({ success: true, data: await withRefs(LabOrder.findById(o._id)) });
});

// DELETE /:id — admins only (route-level). Removes the order and its timeline.
const remove = asyncHandler(async (req, res) => {
  const o = await LabOrder.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId, ...own(req) });
  if (!o) fail(res, 404, "Lab order not found");
  res.json({ success: true, data: {} });
});

module.exports = { getAll, getOne, create, update, updateDetails, remove, technicians, flagFor };
