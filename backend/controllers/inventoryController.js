const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const MedicineBatch = require("../models/MedicineBatch");
const StockTransaction = require("../models/StockTransaction");
const Medicine = require("../models/Medicine");
const { Clinic } = require("../models/Compliance");
const { pageOpts } = require("../utils/pick");
const { withTxn, opt } = require("../utils/txn");
const inv = require("../utils/inventory");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};
const oid = (v) => mongoose.isValidObjectId(v);
const DAY = 86_400_000;

// GET /batches?medicineId=&clinicId=&state=available|expiring|expired|empty|hold
const listBatches = asyncHandler(async (req, res) => {
  const f = { tenantId: req.tenantId };
  if (oid(req.query.medicineId))
    f.medicineId = new mongoose.Types.ObjectId(req.query.medicineId);
  if (req.query.clinicId === "main") f.clinicId = null;
  else if (oid(req.query.clinicId))
    f.clinicId = new mongoose.Types.ObjectId(req.query.clinicId);
  const today = inv.startOfToday();
  const state = req.query.state;
  if (state === "available")
    Object.assign(f, {
      quantityAvailable: { $gt: 0 },
      expiryDate: { $gte: today },
      status: "active",
    });
  if (state === "expiring")
    Object.assign(f, {
      quantityAvailable: { $gt: 0 },
      expiryDate: { $gte: today, $lte: new Date(today.getTime() + 90 * DAY) },
    });
  if (state === "expired")
    Object.assign(f, {
      quantityAvailable: { $gt: 0 },
      expiryDate: { $lt: today },
    });
  if (state === "empty") f.quantityAvailable = 0;
  if (state === "hold") f.status = "quarantined";
  const { limit, skip } = pageOpts(req.query);
  const [rows, total] = await Promise.all([
    MedicineBatch.find(f)
      .populate("medicineId", "name strength dosageForm medicineId")
      .populate("vendorId", "businessName vendorId")
      .sort({ expiryDate: 1 })
      .skip(skip)
      .limit(limit),
    MedicineBatch.countDocuments(f),
  ]);
  const data = rows.map((b) => ({
    ...b.toObject(),
    expired: inv.isExpired(b.expiryDate),
  }));
  res.json({ success: true, count: data.length, total, data });
});

// GET /ledger?medicineId=&batchId=&type=&referenceId=&from=&to=
const ledger = asyncHandler(async (req, res) => {
  const f = { tenantId: req.tenantId };
  if (oid(req.query.medicineId)) f.medicineId = req.query.medicineId;
  if (oid(req.query.batchId)) f.medicineBatchId = req.query.batchId;
  if (oid(req.query.referenceId)) f.referenceId = req.query.referenceId;
  if (StockTransaction.TYPES.includes(req.query.type))
    f.transactionType = req.query.type;
  const from = req.query.from && new Date(req.query.from);
  const to = req.query.to && new Date(req.query.to);
  if ((from && !isNaN(from)) || (to && !isNaN(to))) {
    f.occurredAt = {};
    if (from && !isNaN(from)) f.occurredAt.$gte = from;
    if (to && !isNaN(to)) f.occurredAt.$lte = to;
  }
  const { limit, skip } = pageOpts(req.query);
  const [rows, total] = await Promise.all([
    StockTransaction.find(f)
      .populate("performedBy", "name role")
      .populate("medicineId", "name strength")
      .populate("medicineBatchId", "batchNumber expiryDate")
      .sort({ occurredAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit),
    StockTransaction.countDocuments(f),
  ]);
  res.json({ success: true, count: rows.length, total, data: rows });
});

// POST /batches/:id/adjust { delta, type, reason } — increases are admin-only (route enforces); reductions pharmacist+admin.
const adjust = asyncHandler(async (req, res) => {
  const delta = Number(req.body.delta);
  if (
    delta > 0 &&
    !["super_admin", "tenant_owner", "hospital_admin"].includes(req.user.role)
  )
    fail(res, 403, "Only an administrator can increase stock manually");
  const b = await withTxn((session) =>
    inv.adjustBatch({
      tenantId: req.tenantId,
      batchId: req.params.id,
      delta,
      type: req.body.type || "adjustment",
      reason: req.body.reason,
      userId: req.user._id,
      session,
    }),
  );
  res.json({ success: true, data: b });
});

// POST /batches/:id/hold { hold: true|false } — quarantine a lot (recall / QC) so FEFO skips it.
const hold = asyncHandler(async (req, res) => {
  const b = await MedicineBatch.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: { status: req.body.hold === false ? "active" : "quarantined" } },
    { new: true },
  );
  if (!b) fail(res, 404, "Batch not found");
  await inv.syncMedicine(req.tenantId, b.medicineId, null);
  res.json({ success: true, data: b });
});

const loadMedicine = async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id))
    await inv.ensureLegacy(
      req.tenantId,
      new mongoose.Types.ObjectId(req.params.id),
      null,
    );
  const m = await Medicine.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!m) fail(res, 404, "Medicine not found");
  return m;
};

// POST /medicines/:id/legacy { delta, reason } — correct the un-batched count (admin only).
const legacyAdjust = asyncHandler(async (req, res) => {
  const m = await loadMedicine(req, res);
  const out = await withTxn((session) =>
    inv.adjustLegacy({
      tenantId: req.tenantId,
      medicine: m,
      delta: Number(req.body.delta),
      reason: req.body.reason,
      userId: req.user._id,
      session,
    }),
  );
  res.json({ success: true, data: out });
});

// POST /medicines/:id/reconcile { batchNumber, expiryDate, quantity, manufacturingDate?, purchasePrice?, mrp?, clinicId? }
const reconcile = asyncHandler(async (req, res) => {
  const m = await loadMedicine(req, res);
  if (
    req.body.clinicId &&
    !(await Clinic.exists({ _id: req.body.clinicId, tenantId: req.tenantId }))
  )
    fail(res, 400, "Location not found in this organisation");
  const b = await withTxn((session) =>
    inv.reconcileLegacy({
      tenantId: req.tenantId,
      clinicId: req.body.clinicId || null,
      medicine: m,
      userId: req.user._id,
      session,
      lot: {
        batchNumber: req.body.batchNumber,
        expiryDate: req.body.expiryDate,
        manufacturingDate: req.body.manufacturingDate,
        quantity: Number(req.body.quantity),
        purchasePrice: req.body.purchasePrice,
        mrp: req.body.mrp,
      },
    }),
  );
  res.json({ success: true, data: b });
});

// POST /expire-sweep { confirm: true } — write off every expired lot that still has stock (admin only).
const expireSweep = asyncHandler(async (req, res) => {
  if (req.body.confirm !== true)
    fail(res, 400, "Send { confirm: true } to write off expired stock");
  const expired = await MedicineBatch.find({
    tenantId: req.tenantId,
    quantityAvailable: { $gt: 0 },
    expiryDate: { $lt: inv.startOfToday() },
  });
  let units = 0;
  for (const b of expired) {
    await withTxn((session) =>
      inv.adjustBatch({
        tenantId: req.tenantId,
        batchId: b._id,
        delta: -b.quantityAvailable,
        type: "expired",
        reason: `Expired ${b.expiryDate.toISOString().slice(0, 10)} — written off`,
        userId: req.user._id,
        referenceType: "expiry_sweep",
        session,
      }),
    )
      .then(() => (units += b.quantityAvailable))
      .catch(() => {});
  }
  res.json({ success: true, data: { batches: expired.length, units } });
});

// GET /reconciliation — does the ledger add up to the batch quantities? (should return no rows)
const reconciliation = asyncHandler(async (req, res) => {
  const tenantId = new mongoose.Types.ObjectId(req.tenantId);
  const sums = await StockTransaction.aggregate([
    { $match: { tenantId, medicineBatchId: { $ne: null } } },
    { $group: { _id: "$medicineBatchId", net: { $sum: "$quantityChange" } } },
  ]);
  const net = new Map(sums.map((s) => [String(s._id), s.net]));
  const batches = await MedicineBatch.find({ tenantId }).select(
    "batchNumber medicineId quantityAvailable",
  );
  const mismatches = batches
    .filter((b) => (net.get(String(b._id)) ?? 0) !== b.quantityAvailable)
    .map((b) => ({
      batchId: b._id,
      batchNumber: b.batchNumber,
      medicineId: b.medicineId,
      onHand: b.quantityAvailable,
      ledgerNet: net.get(String(b._id)) ?? 0,
    }));
  res.json({ success: true, data: { checked: batches.length, mismatches } });
});

module.exports = {
  listBatches,
  ledger,
  adjust,
  hold,
  legacyAdjust,
  reconcile,
  expireSweep,
  reconciliation,
};
void opt;
