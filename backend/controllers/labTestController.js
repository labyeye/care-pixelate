const asyncHandler = require("express-async-handler");
const LabTest = require("../models/LabTest");
const Tenant = require("../models/Tenant");
const { pick, pageOpts, searchFilter } = require("../utils/pick");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};
const FIELDS = [
  "name",
  "code",
  "category",
  "specimenType",
  "description",
  "defaultPrice",
  "gstRate",
  "unit",
  "referenceRange",
  "status",
];
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

const check = (res, b) => {
  if (b.defaultPrice !== undefined && !(Number(b.defaultPrice) >= 0))
    fail(res, 400, "Price must be zero or more");
  if (
    b.gstRate !== undefined &&
    !(Number(b.gstRate) >= 0 && Number(b.gstRate) <= 28)
  )
    fail(res, 400, "GST rate must be 0–28%");
  const r = b.referenceRange;
  if (
    r &&
    r.low != null &&
    r.high != null &&
    r.low !== "" &&
    r.high !== "" &&
    Number(r.low) > Number(r.high)
  )
    fail(res, 400, "Reference range low is above high");
};

const getAll = asyncHandler(async (req, res) => {
  const filter = {
    tenantId: req.tenantId,
    ...searchFilter(req.query.q, ["name", "code", "category"]),
  };
  if (["active", "inactive"].includes(req.query.status))
    filter.status = req.query.status;
  if (req.query.category) filter.category = String(req.query.category);
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    LabTest.find(filter).sort({ category: 1, name: 1 }).skip(skip).limit(limit),
    LabTest.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, FIELDS);
  if (!String(body.name || "").trim()) fail(res, 400, "Test name is required");
  check(res, body);
  const doc = new LabTest({
    ...body,
    nameKey: key(body.name),
    tenantId: req.tenantId,
    testId: "pending",
    createdBy: req.user._id,
  });
  await doc.validate();
  const t = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $inc: { "counters.labTest": 1 } },
    { new: true },
  ).select("counters");
  doc.testId = `LT-${String(t.counters.labTest).padStart(4, "0")}`;
  try {
    await doc.save();
  } catch (e) {
    if (e.code === 11000)
      fail(res, 409, "A test with that name or code already exists");
    throw e;
  }
  res.status(201).json({ success: true, data: doc });
});

const update = asyncHandler(async (req, res) => {
  const d = await LabTest.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!d) fail(res, 404, "Test not found");
  const body = pick(req.body, FIELDS);
  check(res, body);
  d.set(body);
  if (body.name !== undefined) d.nameKey = key(body.name);
  try {
    await d.save();
  } catch (e) {
    if (e.code === 11000)
      fail(res, 409, "A test with that name or code already exists");
    throw e;
  }
  res.json({ success: true, data: d });
});

// Existing lab orders keep their own snapshot, but a test is retired (inactive), not deleted.
const remove = asyncHandler(async (req, res) => {
  const d = await LabTest.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: { status: "inactive" } },
    { new: true },
  );
  if (!d) fail(res, 404, "Test not found");
  res.json({ success: true, data: d });
});

module.exports = { getAll, create, update, remove };
