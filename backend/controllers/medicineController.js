const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Medicine = require("../models/Medicine");
const Tenant = require("../models/Tenant");
const Vendor = require("../models/Vendor");
const MedicineBatch = require("../models/MedicineBatch");
const StockTransaction = require("../models/StockTransaction");
const { pick, pageOpts, searchFilter } = require("../utils/pick");
const { withTxn } = require("../utils/txn");
const inv = require("../utils/inventory");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// Fields a client may set (tenantId, medicineId, stockQty, createdBy are server-controlled).
const FIELDS = [
  "name", "genericName", "brandName", "manufacturer", "category", "dosageForm", "strength", "activeIngredients",
  "packSize", "unit", "prescriptionRequired", "scheduleCategory", "storageInstructions", "warnings", "mrp",
  "sellingPrice", "gstRate", "hsnCode", "barcode", "sku", "reorderLevel", "trackInventory", "description", "isActive", "vendor",
];

const VENDOR_SHOW = "vendorId businessName phone";

// "" / null clears the link; anything else must be a vendor of this tenant.
const checkVendor = async (res, tenantId, id) => {
  if (!id) return null;
  if (!(await Vendor.exists({ _id: id, tenantId }))) fail(res, 400, "Vendor not found");
  return id;
};

const check = (res, d) => {
  if (d.sellingPrice !== undefined && d.mrp !== undefined && Number(d.sellingPrice) > Number(d.mrp)) {
    fail(res, 400, "Selling price cannot be higher than MRP");
  }
};

// ?q= name/generic/brand/barcode/sku/id, ?vendor=<id>|none, ?category=, ?form=, ?stock=low|out|expiring, ?active=true|false
const getAll = asyncHandler(async (req, res) => {
  const { q, category, form, stock, active } = req.query;
  const filter = { tenantId: req.tenantId, ...searchFilter(q, ["name", "genericName", "brandName", "barcode", "sku", "medicineId"]) };
  if (req.query.vendor === "none") filter.vendor = null;
  else if (mongoose.isValidObjectId(req.query.vendor)) filter.vendor = req.query.vendor;
  if (category) filter.category = String(category);
  if (form) filter.dosageForm = String(form);
  if (active === "true" || active === "false") filter.isActive = active === "true";
  if (stock === "out") Object.assign(filter, { trackInventory: true, stockQty: 0 });
  if (stock === "low") Object.assign(filter, { trackInventory: true, $expr: { $lte: ["$stockQty", "$reorderLevel"] } });
  if (stock === "expiring") filter.expiryDate = { $lte: new Date(Date.now() + 90 * 86_400_000) };
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    Medicine.find(filter).sort({ name: 1, strength: 1 }).skip(skip).limit(limit).populate("vendor", VENDOR_SHOW),
    Medicine.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

// Headline numbers for the page cards (true totals, not just the loaded rows).
const stats = asyncHandler(async (req, res) => {
  const t = { tenantId: req.tenantId };
  const soon = new Date(Date.now() + 90 * 86_400_000);
  const [total, active, low, out, expiring, value] = await Promise.all([
    Medicine.countDocuments(t),
    Medicine.countDocuments({ ...t, isActive: true }),
    Medicine.countDocuments({ ...t, trackInventory: true, stockQty: { $gt: 0 }, $expr: { $lte: ["$stockQty", "$reorderLevel"] } }),
    Medicine.countDocuments({ ...t, trackInventory: true, stockQty: 0 }),
    Medicine.countDocuments({ ...t, expiryDate: { $lte: soon }, stockQty: { $gt: 0 } }),
    Medicine.aggregate([
      { $match: { ...t, trackInventory: true } },
      { $group: { _id: null, v: { $sum: { $multiply: ["$stockQty", "$sellingPrice"] } } } },
    ]),
  ]);
  res.json({ success: true, data: { total, active, lowStock: low, outOfStock: out, expiringSoon: expiring, stockValue: Math.round((value[0]?.v || 0) * 100) / 100 } });
});

const getOne = asyncHandler(async (req, res) => {
  const m = await Medicine.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate("vendor", VENDOR_SHOW);
  if (!m) fail(res, 404, "Medicine not found");
  res.json({ success: true, data: m });
});

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, FIELDS);
  check(res, body);
  if (body.vendor !== undefined) body.vendor = await checkVendor(res, req.tenantId, body.vendor);
  const t = await Tenant.findByIdAndUpdate(req.tenantId, { $inc: { "counters.medicine": 1 } }, { new: true }).select("counters");
  const data = await Medicine.create({
    ...body,
    tenantId: req.tenantId,
    medicineId: `MED-${String(t.counters.medicine).padStart(5, "0")}`,
    createdBy: req.user._id,
  });
  await data.populate("vendor", VENDOR_SHOW);
  res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const body = pick(req.body, FIELDS);
  const m = await Medicine.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!m) fail(res, 404, "Medicine not found");
  check(res, { mrp: body.mrp ?? m.mrp, sellingPrice: body.sellingPrice ?? m.sellingPrice });
  if (body.vendor !== undefined) body.vendor = await checkVendor(res, req.tenantId, body.vendor);
  m.set(body);
  await m.save();
  await m.populate("vendor", VENDOR_SHOW);
  res.json({ success: true, data: m });
});

// POST /:id/stock { type: "in" | "out" | "set", qty, batchNumber?, expiryDate?, manufacturingDate?, purchasePrice?, vendor?, note? }
// Compatibility endpoint for the Medicines page. Every change now goes through the batch/ledger service:
//   in  + batchNumber & expiryDate -> a real batch (manual receipt)      in without them -> un-batched stock
//   out                            -> un-batched stock first, then earliest-expiry batches
//   set                            -> the difference is applied as an in/out
const adjustStock = asyncHandler(async (req, res) => {
  const { type } = req.body;
  const qty = Number(req.body.qty);
  if (!["in", "out", "set"].includes(type)) fail(res, 400, "Type must be in, out or set");
  if (!Number.isInteger(qty) || qty < 0 || (type !== "set" && qty === 0)) fail(res, 400, "Enter a whole-number quantity");
  await inv.ensureLegacy(req.tenantId, new (require("mongoose").Types.ObjectId)(req.params.id), null).catch(() => {});
  const m0 = await Medicine.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!m0) fail(res, 404, "Medicine not found");
  if (!m0.trackInventory) fail(res, 409, "Inventory tracking is off for this medicine");
  const vendorId = req.body.vendor ? await checkVendor(res, req.tenantId, req.body.vendor) : null;
  const reason = String(req.body.note || (type === "set" ? "Stock count correction" : type === "out" ? "Manual stock out" : "Manual stock in")).slice(0, 300);
  const userId = req.user._id;
  const tenantId = req.tenantId;

  await withTxn(async (session) => {
    const m = await Medicine.findOne({ _id: m0._id, tenantId }).session(session || null);
    const change = type === "set" ? qty - m.stockQty : type === "in" ? qty : -qty;
    if (change > 0) {
      if (req.body.batchNumber && req.body.expiryDate) {
        await inv.receiveLot({
          tenantId, medicine: m, vendorId, userId, type: "adjustment", referenceType: "manual", reason, session,
          lot: { batchNumber: req.body.batchNumber, expiryDate: req.body.expiryDate, manufacturingDate: req.body.manufacturingDate, quantity: change, purchasePrice: req.body.purchasePrice, mrp: m.mrp },
        });
      } else {
        await inv.adjustLegacy({ tenantId, medicine: m, delta: change, reason, userId, session });
        if (req.body.expiryDate) {
          const d = new Date(req.body.expiryDate);
          if (isNaN(d)) throw new inv.StockError("Invalid expiry date", 400);
          if (!m.expiryDate || d < m.expiryDate) await Medicine.updateOne({ _id: m._id, tenantId }, { $set: { expiryDate: d } }, session ? { session } : {});
        }
      }
    } else if (change < 0) {
      let need = -change;
      if (need > m.stockQty) throw new inv.StockError(`Only ${m.stockQty} in stock`, 409);
      const fromLegacy = Math.min(m.legacyStockQty || 0, need);
      if (fromLegacy > 0) {
        await inv.adjustLegacy({ tenantId, medicine: m, delta: -fromLegacy, reason, userId, session });
        need -= fromLegacy;
      }
      if (need > 0) {
        await inv.deduct({ tenantId, medicine: m, quantity: need, type: "adjustment", referenceType: "manual", userId, reason, session });
      }
    }
    if (vendorId && change > 0) await Medicine.updateOne({ _id: m._id, tenantId }, { $set: { vendor: vendorId } }, session ? { session } : {});
  });
  const out = await Medicine.findOne({ _id: m0._id, tenantId }).populate("vendor", VENDOR_SHOW);
  res.json({ success: true, data: out });
});

// A medicine with stock history is deactivated, never deleted — batches, ledger rows and sales point at it.
const remove = asyncHandler(async (req, res) => {
  const used =
    (await MedicineBatch.exists({ tenantId: req.tenantId, medicineId: req.params.id })) ||
    (await StockTransaction.exists({ tenantId: req.tenantId, medicineId: req.params.id }));
  if (used) fail(res, 409, "This medicine has stock history — mark it inactive instead of deleting it");
  const m = await Medicine.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!m) fail(res, 404, "Medicine not found");
  res.json({ success: true, data: {} });
});

module.exports = { getAll, stats, getOne, create, update, adjustStock, remove };
