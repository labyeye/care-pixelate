const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Vendor = require("../models/Vendor");
const Medicine = require("../models/Medicine");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Tenant = require("../models/Tenant");
const { pick, pageOpts, searchFilter } = require("../utils/pick");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// tenantId, vendorId, createdBy are server-controlled.
const FIELDS = [
  "vendorType", "businessName", "contactPerson", "phone", "alternatePhone", "email", "address", "gstin",
  "drugLicenseNumber", "drugLicenseExpiry", "paymentTerms", "creditLimit", "openingBalance", "bankDetails", "notes", "status",
];

// Per-vendor supply figures from the medicines linked to it: { [vendorId]: { medicines, units, value, low } }.
const supplyByVendor = async (tenantId) => {
  const agg = await Medicine.aggregate([
    { $match: { tenantId, vendor: { $ne: null } } },
    {
      $group: {
        _id: "$vendor",
        medicines: { $sum: 1 },
        units: { $sum: "$stockQty" },
        value: { $sum: { $multiply: ["$stockQty", "$sellingPrice"] } },
        low: { $sum: { $cond: [{ $and: ["$trackInventory", { $lte: ["$stockQty", "$reorderLevel"] }] }, 1, 0] } },
      },
    },
  ]);
  return Object.fromEntries(agg.map((a) => [String(a._id), { medicines: a.medicines, units: a.units, value: Math.round(a.value * 100) / 100, low: a.low }]));
};

// ?q= name/id/phone/gstin, ?status=active|inactive|blocked
const getAll = asyncHandler(async (req, res) => {
  const { q, status } = req.query;
  const filter = { tenantId: req.tenantId, ...searchFilter(q, ["businessName", "vendorId", "phone", "gstin"]) };
  if (["active", "inactive", "blocked"].includes(status)) filter.status = status;
  const { limit, skip } = pageOpts(req.query);
  const [items, total, supply] = await Promise.all([
    Vendor.find(filter).sort({ businessName: 1 }).skip(skip).limit(limit),
    Vendor.countDocuments(filter),
    supplyByVendor(req.tenantId),
  ]);
  const none = { medicines: 0, units: 0, value: 0, low: 0 };
  const data = items.map((v) => ({ ...v.toObject(), supply: supply[String(v._id)] || none }));
  res.json({ success: true, count: data.length, total, data });
});

// Headline numbers for the page cards (true totals, not just the loaded rows).
const stats = asyncHandler(async (req, res) => {
  const t = { tenantId: req.tenantId };
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const [total, active, inactive, blocked, licenceDue, unlinked, supply] = await Promise.all([
    Vendor.countDocuments(t),
    Vendor.countDocuments({ ...t, status: "active" }),
    Vendor.countDocuments({ ...t, status: "inactive" }),
    Vendor.countDocuments({ ...t, status: "blocked" }),
    Vendor.countDocuments({ ...t, drugLicenseExpiry: { $ne: null, $lte: soon } }),
    Medicine.countDocuments({ ...t, vendor: null }),
    supplyByVendor(req.tenantId),
  ]);
  const payable = await Vendor.aggregate([{ $match: { tenantId: new mongoose.Types.ObjectId(String(req.tenantId)) } }, { $group: { _id: null, v: { $sum: "$openingBalance" } } }]);
  const stockValue = Object.values(supply).reduce((s, x) => s + x.value, 0);
  res.json({
    success: true,
    data: { total, active, inactive, blocked, licenceDue, medicinesWithoutVendor: unlinked, stockValue: Math.round(stockValue * 100) / 100, openingBalance: payable[0]?.v || 0 },
  });
});

const getOne = asyncHandler(async (req, res) => {
  const v = await Vendor.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!v) fail(res, 404, "Vendor not found");
  res.json({ success: true, data: v });
});

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, FIELDS);
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { "counters.vendor": 1 } }, { new: true }).select("counters");
  const data = await Vendor.create({
    ...body,
    tenantId: req.tenantId,
    vendorId: `VND-${String(t.counters.vendor).padStart(5, "0")}`,
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const v = await Vendor.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!v) fail(res, 404, "Vendor not found");
  v.set(pick(req.body, FIELDS));
  await v.save();
  res.json({ success: true, data: v });
});

const remove = asyncHandler(async (req, res) => {
  const bought = await PurchaseInvoice.countDocuments({ tenantId: req.tenantId, vendorId: req.params.id });
  if (bought) fail(res, 409, `${bought} purchase invoice(s) exist for this vendor — mark it inactive instead`);
  const inUse = await Medicine.countDocuments({ tenantId: req.tenantId, vendor: req.params.id });
  if (inUse) fail(res, 409, `${inUse} medicine(s) are linked to this vendor — mark it inactive instead`);
  const v = await Vendor.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!v) fail(res, 404, "Vendor not found");
  res.json({ success: true, data: {} });
});

module.exports = { getAll, stats, getOne, create, update, remove };
