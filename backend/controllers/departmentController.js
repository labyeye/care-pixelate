const asyncHandler = require("express-async-handler");
const Department = require("../models/Department");
const Doctor = require("../models/Doctor");
const Tenant = require("../models/Tenant");
const { Clinic } = require("../models/Compliance");
const { pick, pageOpts } = require("../utils/pick");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};
const FIELDS = ["name", "description", "clinicId", "status"];
const key = (s) => String(s || "").trim().toLowerCase();

const checkClinic = async (res, tenantId, clinicId) => {
  if (clinicId && !(await Clinic.exists({ _id: clinicId, tenantId }))) fail(res, 400, "Location not found in this organisation");
};

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (["active", "inactive"].includes(req.query.status)) filter.status = req.query.status;
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([Department.find(filter).sort({ name: 1 }).skip(skip).limit(limit), Department.countDocuments(filter)]);
  res.json({ success: true, count: data.length, total, data });
});

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, FIELDS);
  if (!String(body.name || "").trim()) fail(res, 400, "Department name is required");
  await checkClinic(res, req.tenantId, body.clinicId);
  const doc = new Department({ ...body, clinicId: body.clinicId || null, nameKey: key(body.name), tenantId: req.tenantId, departmentId: "pending", createdBy: req.user._id });
  await doc.validate();
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { "counters.department": 1 } }, { new: true }).select("counters");
  doc.departmentId = `DEP-${String(t.counters.department).padStart(4, "0")}`;
  try {
    await doc.save();
  } catch (e) {
    if (e.code === 11000) fail(res, 409, "A department with that name already exists here");
    throw e;
  }
  res.status(201).json({ success: true, data: doc });
});

const update = asyncHandler(async (req, res) => {
  const d = await Department.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!d) fail(res, 404, "Department not found");
  const body = pick(req.body, FIELDS);
  if (body.clinicId !== undefined) await checkClinic(res, req.tenantId, body.clinicId);
  d.set({ ...body, clinicId: body.clinicId === undefined ? d.clinicId : body.clinicId || null });
  if (body.name !== undefined) d.nameKey = key(body.name);
  try {
    await d.save();
  } catch (e) {
    if (e.code === 11000) fail(res, 409, "A department with that name already exists here");
    throw e;
  }
  res.json({ success: true, data: d });
});

// Departments that doctors belong to are deactivated, never deleted.
const remove = asyncHandler(async (req, res) => {
  const inUse = await Doctor.countDocuments({ tenantId: req.tenantId, departmentIds: req.params.id });
  if (inUse) fail(res, 409, `${inUse} doctor(s) belong to this department — mark it inactive instead`);
  const d = await Department.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!d) fail(res, 404, "Department not found");
  res.json({ success: true, data: {} });
});

module.exports = { getAll, create, update, remove };
