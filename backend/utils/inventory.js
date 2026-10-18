// Inventory service — the ONLY place stock quantities change.
//   receiveLot    purchase receipt / reconciliation  -> MedicineBatch up   + StockTransaction
//   deduct        sale / dispensing (FEFO)            -> MedicineBatch down + StockTransaction
//   returnToBatch customer return                     -> MedicineBatch up   + StockTransaction
//   adjustBatch   damage / expiry / correction        -> MedicineBatch +-   + StockTransaction
//   adjustLegacy / reconcileLegacy                    -> pre-batch (un-batched) stock
// Every quantity change is a conditional atomic update ($gte guard), so stock can never go negative
// even under concurrent requests; every change writes a ledger row with before/after.
const Medicine = require("../models/Medicine");
const MedicineBatch = require("../models/MedicineBatch");
const StockTransaction = require("../models/StockTransaction");
const { opt } = require("./txn");

class StockError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
// A lot is sellable through its printed expiry date.
const isExpired = (d) => !!d && new Date(d) < startOfToday();
const sameDay = (a, b) =>
  new Date(a).toISOString().slice(0, 10) ===
  new Date(b).toISOString().slice(0, 10);
const withSession = (q, session) => (session ? q.session(session) : q);
const assertQty = (q, label = "Quantity") => {
  if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q))
    throw new StockError(`${label} must be a whole number above zero`, 400);
};

/**
 * Medicines created before batch tracking have a stockQty but no legacyStockQty field. The first time
 * anything touches one, carry that quantity over as un-batched legacy stock (once — the $exists guard makes
 * this idempotent and race-safe) so the derived summary below can never wipe out real stock.
 * scripts/migrate-pharmacy.js does the same in bulk.
 */
async function ensureLegacy(tenantId, medicineId, session) {
  await Medicine.collection.updateOne(
    { _id: medicineId, tenantId, legacyStockQty: { $exists: false } },
    [{ $set: { legacyStockQty: { $ifNull: ["$stockQty", 0] } } }],
    session ? { session } : {},
  );
}

/** Recompute the medicine's derived summary: unbatched legacy stock + sellable batch stock. */
async function syncMedicine(tenantId, medicineId, session) {
  await ensureLegacy(tenantId, medicineId, session);
  const [agg] = await withSession(
    MedicineBatch.aggregate([
      {
        $match: {
          tenantId,
          medicineId,
          status: "active",
          expiryDate: { $gte: startOfToday() },
          quantityAvailable: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          qty: { $sum: "$quantityAvailable" },
          next: { $min: "$expiryDate" },
        },
      },
    ]),
    session,
  );
  const m = await withSession(
    Medicine.findOne({ _id: medicineId, tenantId }).select("legacyStockQty"),
    session,
  );
  const set = { stockQty: (agg?.qty || 0) + (m?.legacyStockQty || 0) };
  if (agg?.next) set.expiryDate = agg.next;
  await Medicine.updateOne(
    { _id: medicineId, tenantId },
    { $set: set },
    opt(session),
  );
  return set;
}

const ledgerRow = (base, extra) => ({
  occurredAt: new Date(),
  ...base,
  ...extra,
});
const writeLedger = (rows, session) =>
  rows.length
    ? StockTransaction.insertMany(rows, opt(session, { ordered: true }))
    : [];

/** Put a lot into stock (creates the batch or tops up the same batch number). */
async function receiveLot({
  tenantId,
  clinicId = null,
  medicine,
  vendorId = null,
  purchaseInvoiceId = null,
  lot,
  userId,
  type = "purchase_receipt",
  referenceType = "purchase_invoice",
  referenceId = null,
  reason = "",
  session = null,
}) {
  await ensureLegacy(tenantId, medicine._id, session);
  const qty = Number(lot.quantity || 0) + Number(lot.freeQuantity || 0);
  assertQty(qty, "Received quantity");
  const batchNumber = String(lot.batchNumber || "")
    .trim()
    .toUpperCase();
  if (!batchNumber) throw new StockError("Batch number is required", 400);
  const expiry = new Date(lot.expiryDate);
  if (isNaN(expiry))
    throw new StockError(`Invalid expiry date for batch ${batchNumber}`, 400);
  if (isExpired(expiry))
    throw new StockError(
      `Batch ${batchNumber} is already expired and cannot be received`,
      400,
    );
  if (lot.manufacturingDate && new Date(lot.manufacturingDate) > expiry)
    throw new StockError(
      `Batch ${batchNumber}: manufacturing date is after expiry`,
      400,
    );

  const key = { tenantId, clinicId, medicineId: medicine._id, batchNumber };
  const existing = await withSession(MedicineBatch.findOne(key), session);
  if (existing && !sameDay(existing.expiryDate, expiry)) {
    throw new StockError(
      `Batch ${batchNumber} already exists with a different expiry date`,
      409,
    );
  }
  const batch = await MedicineBatch.findOneAndUpdate(
    key,
    {
      $inc: { quantityReceived: qty, quantityAvailable: qty },
      $setOnInsert: {
        expiryDate: expiry,
        manufacturingDate: lot.manufacturingDate
          ? new Date(lot.manufacturingDate)
          : null,
        purchasePrice: Number(lot.purchasePrice || 0),
        mrp: Number(lot.mrp ?? medicine.mrp ?? 0),
        sellingPrice:
          lot.sellingPrice != null ? Number(lot.sellingPrice) : null,
        vendorId,
        purchaseInvoiceId,
        receivedAt: new Date(),
        status: "active",
        createdBy: userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...opt(session) },
  );
  await writeLedger(
    [
      ledgerRow(
        {
          tenantId,
          clinicId,
          medicineId: medicine._id,
          medicineBatchId: batch._id,
          transactionType: type,
          referenceType,
          referenceId,
          reason,
          performedBy: userId,
        },
        {
          quantityChange: qty,
          quantityBefore: batch.quantityAvailable - qty,
          quantityAfter: batch.quantityAvailable,
        },
      ),
    ],
    session,
  );
  await syncMedicine(tenantId, medicine._id, session);
  return batch;
}

/**
 * Take `quantity` units out, earliest-expiry-first across sellable batches (or from `batchId` when a
 * manager overrides). Returns the allocations — the exact lots that supplied the units.
 * All-or-nothing: with a session the transaction rolls back; without one the units already taken are
 * put back before the error is thrown.
 */
async function deduct({
  tenantId,
  clinicId = null,
  medicine,
  quantity,
  type = "dispensing",
  referenceType = "",
  referenceId = null,
  userId,
  reason = "",
  batchId = null,
  idempotencyBase = null,
  session = null,
}) {
  assertQty(quantity);
  await ensureLegacy(tenantId, medicine._id, session);
  const today = startOfToday();
  const filter = {
    tenantId,
    clinicId,
    medicineId: medicine._id,
    status: "active",
    quantityAvailable: { $gt: 0 },
    expiryDate: { $gte: today },
  };
  if (batchId) {
    const b = await withSession(
      MedicineBatch.findOne({
        _id: batchId,
        tenantId,
        clinicId,
        medicineId: medicine._id,
      }),
      session,
    );
    if (!b) throw new StockError("Batch not found for this medicine", 400);
    if (isExpired(b.expiryDate))
      throw new StockError(
        `Batch ${b.batchNumber} is expired and cannot be dispensed`,
        409,
      );
    if (b.status !== "active")
      throw new StockError(`Batch ${b.batchNumber} is on hold`, 409);
    filter._id = b._id;
  }

  const allocations = [];
  const rows = [];
  let need = quantity;
  const undo = async () => {
    if (session) return; // the transaction abort handles it
    for (const a of allocations)
      await MedicineBatch.updateOne(
        { _id: a.medicineBatchId, tenantId },
        { $inc: { quantityAvailable: a.quantity } },
      );
  };

  try {
    for (let attempts = 0; need > 0; attempts++) {
      if (attempts > 40)
        throw new StockError(
          "Stock is being updated by another request — please retry",
          409,
        );
      const b = await withSession(
        MedicineBatch.findOne(filter).sort({
          expiryDate: 1,
          receivedAt: 1,
          _id: 1,
        }),
        session,
      );
      if (!b) break;
      const take = Math.min(b.quantityAvailable, need);
      const upd = await MedicineBatch.findOneAndUpdate(
        { _id: b._id, tenantId, quantityAvailable: { $gte: take } },
        { $inc: { quantityAvailable: -take } },
        { new: true, ...opt(session) },
      );
      if (!upd) continue; // lost a race for this lot — re-read and try again
      allocations.push({
        medicineBatchId: upd._id,
        batchNumber: upd.batchNumber,
        expiryDate: upd.expiryDate,
        quantity: take,
        purchasePrice: upd.purchasePrice,
        mrp: upd.mrp,
        sellingPrice: upd.sellingPrice,
      });
      rows.push(
        ledgerRow(
          {
            tenantId,
            clinicId,
            medicineId: medicine._id,
            medicineBatchId: upd._id,
            transactionType: type,
            referenceType,
            referenceId,
            reason,
            performedBy: userId,
            ...(idempotencyBase
              ? { idempotencyKey: `${idempotencyBase}:${upd._id}` }
              : {}),
          },
          {
            quantityChange: -take,
            quantityBefore: upd.quantityAvailable + take,
            quantityAfter: upd.quantityAvailable,
          },
        ),
      );
      need -= take;
    }
    if (need > 0) {
      const have = quantity - need;
      throw new StockError(
        have > 0
          ? `Only ${have} unit(s) of ${medicine.name} are available in non-expired batches`
          : `${medicine.name} has no sellable (non-expired) stock`,
      );
    }
    await writeLedger(rows, session);
    await syncMedicine(tenantId, medicine._id, session);
    return allocations;
  } catch (err) {
    await undo();
    throw err;
  }
}

/** Put returned units back on the batch they came from (never above what was received). */
async function returnToBatch({
  tenantId,
  batchId,
  quantity,
  type = "customer_return",
  referenceType = "",
  referenceId = null,
  userId,
  reason = "",
  idempotencyKey,
  session = null,
}) {
  assertQty(quantity);
  const b = await MedicineBatch.findOneAndUpdate(
    {
      _id: batchId,
      tenantId,
      $expr: {
        $lte: [{ $add: ["$quantityAvailable", quantity] }, "$quantityReceived"],
      },
    },
    { $inc: { quantityAvailable: quantity } },
    { new: true, ...opt(session) },
  );
  if (!b)
    throw new StockError(
      "Return is larger than the quantity originally taken from this batch",
      409,
    );
  await writeLedger(
    [
      ledgerRow(
        {
          tenantId,
          clinicId: b.clinicId,
          medicineId: b.medicineId,
          medicineBatchId: b._id,
          transactionType: type,
          referenceType,
          referenceId,
          reason,
          performedBy: userId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
        {
          quantityChange: quantity,
          quantityBefore: b.quantityAvailable - quantity,
          quantityAfter: b.quantityAvailable,
        },
      ),
    ],
    session,
  );
  await syncMedicine(tenantId, b.medicineId, session);
  return b;
}

const OUT_TYPES = [
  "damaged",
  "expired",
  "adjustment",
  "supplier_return",
  "transfer_out",
];

/** Manual correction of one batch. delta<0 removes stock; delta>0 is only allowed as an "adjustment". */
async function adjustBatch({
  tenantId,
  batchId,
  delta,
  type = "adjustment",
  reason,
  userId,
  referenceType = "manual",
  referenceId = null,
  session = null,
}) {
  if (!Number.isInteger(delta) || delta === 0)
    throw new StockError("Enter a whole-number change", 400);
  if (!String(reason || "").trim())
    throw new StockError("A reason is required for stock adjustments", 400);
  let b;
  if (delta < 0) {
    if (!OUT_TYPES.includes(type))
      throw new StockError("Invalid type for a stock reduction", 400);
    b = await MedicineBatch.findOneAndUpdate(
      { _id: batchId, tenantId, quantityAvailable: { $gte: -delta } },
      { $inc: { quantityAvailable: delta } },
      { new: true, ...opt(session) },
    );
    if (!b) throw new StockError("Not enough stock in this batch", 409);
  } else {
    if (type !== "adjustment")
      throw new StockError("Stock can only be increased as an adjustment", 400);
    b = await MedicineBatch.findOneAndUpdate(
      { _id: batchId, tenantId },
      { $inc: { quantityAvailable: delta, quantityReceived: delta } },
      { new: true, ...opt(session) },
    );
    if (!b) throw new StockError("Batch not found", 404);
  }
  await writeLedger(
    [
      ledgerRow(
        {
          tenantId,
          clinicId: b.clinicId,
          medicineId: b.medicineId,
          medicineBatchId: b._id,
          transactionType: type,
          referenceType,
          referenceId,
          reason: String(reason).slice(0, 300),
          performedBy: userId,
        },
        {
          quantityChange: delta,
          quantityBefore: b.quantityAvailable - delta,
          quantityAfter: b.quantityAvailable,
        },
      ),
    ],
    session,
  );
  await syncMedicine(tenantId, b.medicineId, session);
  return b;
}

/** Un-batched stock (carried over from before batch tracking). */
async function adjustLegacy({
  tenantId,
  medicine,
  delta,
  reason,
  userId,
  session = null,
}) {
  if (!Number.isInteger(delta) || delta === 0)
    throw new StockError("Enter a whole-number change", 400);
  await ensureLegacy(tenantId, medicine._id, session);
  const filter = { _id: medicine._id, tenantId };
  if (delta < 0) filter.legacyStockQty = { $gte: -delta };
  const m = await Medicine.findOneAndUpdate(
    filter,
    { $inc: { legacyStockQty: delta } },
    { new: true, ...opt(session) },
  );
  if (!m)
    throw new StockError(
      `Only ${medicine.legacyStockQty || 0} un-batched unit(s) available`,
      409,
    );
  await writeLedger(
    [
      ledgerRow(
        {
          tenantId,
          clinicId: null,
          medicineId: m._id,
          medicineBatchId: null,
          transactionType: "legacy_adjustment",
          referenceType: "manual",
          reason: String(reason || "").slice(0, 300),
          performedBy: userId,
        },
        {
          quantityChange: delta,
          quantityBefore: m.legacyStockQty - delta,
          quantityAfter: m.legacyStockQty,
        },
      ),
    ],
    session,
  );
  await syncMedicine(tenantId, m._id, session);
  return m;
}

/** Move un-batched legacy stock into a real batch once the staff has the batch number / expiry. */
async function reconcileLegacy({
  tenantId,
  clinicId = null,
  medicine,
  lot,
  userId,
  session = null,
}) {
  const qty = Number(lot.quantity);
  assertQty(qty);
  await ensureLegacy(tenantId, medicine._id, session);
  const m = await Medicine.findOneAndUpdate(
    { _id: medicine._id, tenantId, legacyStockQty: { $gte: qty } },
    { $inc: { legacyStockQty: -qty } },
    { new: true, ...opt(session) },
  );
  if (!m)
    throw new StockError(
      `Only ${medicine.legacyStockQty || 0} un-batched unit(s) to reconcile`,
      409,
    );
  await writeLedger(
    [
      ledgerRow(
        {
          tenantId,
          clinicId: null,
          medicineId: m._id,
          medicineBatchId: null,
          transactionType: "legacy_adjustment",
          referenceType: "reconciliation",
          reason: "Moved into a batch",
          performedBy: userId,
        },
        {
          quantityChange: -qty,
          quantityBefore: m.legacyStockQty + qty,
          quantityAfter: m.legacyStockQty,
        },
      ),
    ],
    session,
  );
  return receiveLot({
    tenantId,
    clinicId,
    medicine: m,
    lot: { ...lot, quantity: qty, freeQuantity: 0 },
    userId,
    type: "adjustment",
    referenceType: "reconciliation",
    reason: "Legacy stock reconciled into batch",
    session,
  });
}

module.exports = {
  StockError,
  ensureLegacy,
  syncMedicine,
  receiveLot,
  deduct,
  returnToBatch,
  adjustBatch,
  adjustLegacy,
  reconcileLegacy,
  isExpired,
  startOfToday,
};
