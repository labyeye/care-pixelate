// Pharmacy counter sales / dispensing. Prescribing (Consultation) and dispensing stay separate:
// signing a prescription never moves stock — only a sale created here does.
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const PharmacySale = require("../models/PharmacySale");
const Medicine = require("../models/Medicine");
const Patient = require("../models/Patient");
const Consultation = require("../models/Consultation");
const Invoice = require("../models/Invoice");
const Tenant = require("../models/Tenant");
const { Clinic } = require("../models/Compliance");
const { pageOpts } = require("../utils/pick");
const { computeTotals, statusFor, r2 } = require("../utils/invoice");
const { withTxn, opt } = require("../utils/txn");
const inv = require("../utils/inventory");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};
const oid = (v) => mongoose.isValidObjectId(v);
const STRICT_SCHEDULE = /^(h1|x|narcotic|ndps)/i; // tighter record-keeping: needs a named patient + prescription
const norm = (s) => String(s || "").trim().toLowerCase();

// Does a signed prescription item cover this medicine?
const prescribes = (item, med) =>
  (item.medicineId && String(item.medicineId) === String(med._id)) ||
  norm(item.drug) === norm(med.name) ||
  norm(item.drug) === norm(`${med.name} ${med.strength}`);

async function dispensedAgainst(tenantId, consultationId, med) {
  const rows = await PharmacySale.aggregate([
    { $match: { tenantId, consultationId, status: { $ne: "cancelled" } } },
    { $unwind: "$items" },
    { $match: { "items.medicineId": med._id } },
    { $group: { _id: null, q: { $sum: { $subtract: ["$items.quantity", { $sum: "$items.allocations.returnedQuantity" }] } } } },
  ]);
  return rows[0]?.q || 0;
}

const POP = [
  ["patientId", "firstName middleName lastName patientId"],
  ["dispensedBy", "name role"],
];
const withRefs = (q) => POP.reduce((a, [p, s]) => a.populate(p, s), q);

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (["completed", "partially_returned", "returned", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  if (oid(req.query.patientId)) filter.patientId = req.query.patientId;
  if (oid(req.query.consultationId)) filter.consultationId = req.query.consultationId;
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    withRefs(PharmacySale.find(filter).select("-items.allocations").sort({ createdAt: -1 }).skip(skip).limit(limit)),
    PharmacySale.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

const getOne = asyncHandler(async (req, res) => {
  const s = await withRefs(PharmacySale.findOne({ _id: req.params.id, tenantId: req.tenantId }));
  if (!s) fail(res, 404, "Sale not found");
  res.json({ success: true, data: s });
});

// POST / { idempotencyKey, patientId?, consultationId?, customerName?, clinicId?, items:[{medicineId, quantity, batchId?}],
//          discount?, payments?:[{amount, mode, reference}], notes? }
const createSale = asyncHandler(async (req, res) => {
  const { tenantId } = req;
  const key = String(req.body.idempotencyKey || "").trim();
  if (key.length < 8 || key.length > 100) fail(res, 400, "idempotencyKey (8–100 chars) is required so a retried request can't sell twice");

  // Replay: same key -> the original sale, no second deduction.
  const prior = await withRefs(PharmacySale.findOne({ tenantId, idempotencyKey: key }));
  if (prior) return res.status(200).json({ success: true, replayed: true, data: prior });

  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!rawItems.length || rawItems.length > 100) fail(res, 400, "Add 1–100 items");

  // ---- who is it for
  let patient = null;
  let consultation = null;
  if (req.body.consultationId) {
    if (!oid(req.body.consultationId)) fail(res, 400, "Invalid consultation");
    consultation = await Consultation.findOne({ _id: req.body.consultationId, tenantId });
    if (!consultation) fail(res, 400, "Consultation not found in this organisation");
    if (consultation.status !== "signed") fail(res, 409, "The prescription is not signed yet");
  }
  const patientId = req.body.patientId || consultation?.patientId;
  if (patientId) {
    if (!oid(patientId)) fail(res, 400, "Invalid patient");
    patient = await Patient.findOne({ _id: patientId, tenantId }).select("_id");
    if (!patient) fail(res, 400, "Patient not found in this organisation");
    if (consultation && String(consultation.patientId) !== String(patient._id)) fail(res, 400, "That prescription belongs to a different patient");
  }
  const clinicId = req.body.clinicId || null;
  if (clinicId && !(await Clinic.exists({ _id: clinicId, tenantId }))) fail(res, 400, "Location not found in this organisation");

  // ---- merge duplicate lines, load medicines inside the tenant
  const wanted = new Map();
  for (const [i, r] of rawItems.entries()) {
    if (!r || !oid(r.medicineId)) fail(res, 400, `Line ${i + 1}: choose a medicine`);
    const qty = Number(r.quantity);
    if (!Number.isInteger(qty) || qty < 1) fail(res, 400, `Line ${i + 1}: quantity must be a whole number ≥ 1`);
    if (r.batchId && !oid(r.batchId)) fail(res, 400, `Line ${i + 1}: invalid batch`);
    const k = `${r.medicineId}|${r.batchId || ""}`;
    const cur = wanted.get(k) || { medicineId: String(r.medicineId), batchId: r.batchId || null, quantity: 0 };
    cur.quantity += qty;
    wanted.set(k, cur);
  }
  const meds = await Medicine.find({ _id: { $in: [...new Set([...wanted.values()].map((w) => w.medicineId))] }, tenantId });
  const byId = new Map(meds.map((m) => [String(m._id), m]));

  const lines = [];
  for (const w of wanted.values()) {
    const m = byId.get(w.medicineId);
    if (!m) fail(res, 400, "A selected medicine was not found in this organisation");
    if (!m.isActive) fail(res, 409, `${m.name} is inactive`);
    if (!m.trackInventory) fail(res, 409, `${m.name} is not stock-tracked and cannot be dispensed here`);

    // prescription rules
    if (m.prescriptionRequired || STRICT_SCHEDULE.test(m.scheduleCategory || "")) {
      if (!consultation) fail(res, 409, `${m.name} needs a prescription — attach the signed consultation`);
      const item = (consultation.prescription?.items || []).find((it) => prescribes(it, m));
      if (!item) fail(res, 409, `${m.name} is not on this prescription`);
      if (item.quantity) {
        const done = await dispensedAgainst(tenantId, consultation._id, m);
        if (done + w.quantity > item.quantity) fail(res, 409, `${m.name}: prescribed ${item.quantity}, already dispensed ${done}`);
      }
    }
    if (STRICT_SCHEDULE.test(m.scheduleCategory || "") && !patient) fail(res, 409, `${m.name} (${m.scheduleCategory}) must be dispensed to a named patient`);

    const unitPrice = m.sellingPrice;
    if (unitPrice > m.mrp) fail(res, 409, `${m.name}: selling price is above MRP — fix the catalog first`);
    const gstRate = m.gstRate || 0;
    const rate = r2(unitPrice / (1 + gstRate / 100));
    lines.push({ m, w, unitPrice, gstRate, rate });
  }

  const totals = computeTotals(
    lines.map((l) => ({ description: `${l.m.name}${l.m.strength ? ` ${l.m.strength}` : ""}`, qty: l.w.quantity, rate: l.rate, gstRate: l.gstRate })),
    Number(req.body.discount || 0),
  );

  // ---- payments (validated up front)
  const payments = (Array.isArray(req.body.payments) ? req.body.payments : []).map((p, i) => {
    const amount = r2(Number(p.amount));
    if (!(amount > 0) || !["cash", "upi", "card", "bank", "insurance", "other"].includes(p.mode)) fail(res, 400, `Payment ${i + 1} is invalid`);
    return { amount, mode: p.mode, reference: String(p.reference || "").slice(0, 80) };
  });
  const paid = r2(payments.reduce((s, p) => s + p.amount, 0));
  if (paid > totals.total + 0.005) fail(res, 400, "Payments exceed the sale total");

  const saleId = new mongoose.Types.ObjectId();
  let out;
  try {
    out = await withTxn(async (session) => {
      const t = await Tenant.findOneAndUpdate({ _id: tenantId }, { $inc: { "counters.pharmacySale": 1 } }, { new: true, ...opt(session) }).select("counters");
      const saleDoc = {
        _id: saleId, tenantId, clinicId, patientId: patient?._id || null, consultationId: consultation?._id || null,
        number: `RX-${new Date().getFullYear()}-${String(t.counters.pharmacySale).padStart(5, "0")}`,
        customerName: patient ? "" : String(req.body.customerName || "").slice(0, 120),
        items: lines.map((l, i) => ({
          medicineId: l.m._id, medicineName: l.m.name, strength: l.m.strength, dosageForm: l.m.dosageForm, hsnCode: l.m.hsnCode,
          quantity: l.w.quantity, unitPrice: l.unitPrice, mrp: l.m.mrp, gstRate: l.gstRate,
          rate: totals.lines[i].rate, amount: totals.lines[i].amount, gstAmount: r2((totals.lines[i].amount * l.gstRate) / 100),
        })),
        subtotal: totals.subtotal, gst: totals.gst, discount: totals.discount, total: totals.total,
        idempotencyKey: key, notes: String(req.body.notes || "").slice(0, 500), dispensedBy: req.user._id,
      };
      // Gate first: the unique (tenant, idempotencyKey) index lets exactly one of two racing requests continue.
      const [sale] = await PharmacySale.create([saleDoc], opt(session));
      try {
        for (const [i, l] of lines.entries()) {
          const allocations = await inv.deduct({
            tenantId, clinicId, medicine: l.m, quantity: l.w.quantity, type: "dispensing", referenceType: "pharmacy_sale", referenceId: sale._id,
            userId: req.user._id, batchId: l.w.batchId, reason: l.w.batchId ? "Manual batch selection" : "", idempotencyBase: `sale:${sale._id}`, session,
          });
          sale.items[i].allocations = allocations.map((a) => ({
            medicineBatchId: a.medicineBatchId, batchNumber: a.batchNumber, expiryDate: a.expiryDate, quantity: a.quantity, purchasePrice: a.purchasePrice,
          }));
          // a lot priced differently is honoured only when the manager picked that lot explicitly
          if (l.w.batchId && allocations[0]?.sellingPrice != null && allocations[0].sellingPrice !== sale.items[i].unitPrice) {
            sale.notes = `${sale.notes ? sale.notes + " · " : ""}Batch ${allocations[0].batchNumber} chosen manually`.slice(0, 500);
          }
        }
        // Patient sales are billed on the invoice; counter sales keep their payments on the sale.
        if (patient) {
          const it = await Tenant.findOneAndUpdate({ _id: tenantId }, { $inc: { "counters.invoice": 1 } }, { new: true, ...opt(session) }).select("counters");
          const [invoice] = await Invoice.create(
            [{
              tenantId, patientId: patient._id, number: `INV-${new Date().getFullYear()}-${String(it.counters.invoice).padStart(5, "0")}`,
              items: totals.lines.map((tl, i) => ({ ...tl, source: { kind: "pharmacy_sale", refId: sale._id, key: String(lines[i].m._id) } })),
              subtotal: totals.subtotal, gst: totals.gst, discount: totals.discount, total: totals.total, paid,
              payments: payments.map((p) => ({ ...p, receivedBy: req.user._id })), status: statusFor(totals.total, paid),
              notes: `Pharmacy sale ${sale.number}`, createdBy: req.user._id,
            }],
            opt(session),
          );
          sale.invoiceId = invoice._id;
        } else {
          sale.payments = payments;
        }
        await sale.save(opt(session));
        return sale;
      } catch (e) {
        // standalone MongoDB (no transaction): retract the gate row so nothing half-exists
        if (!session) await PharmacySale.deleteOne({ _id: sale._id });
        throw e;
      }
    });
  } catch (e) {
    if (e && e.code === 11000 && /idempotencyKey/.test(e.message || "")) {
      const again = await withRefs(PharmacySale.findOne({ tenantId, idempotencyKey: key }));
      if (again) return res.status(200).json({ success: true, replayed: true, data: again });
    }
    throw e;
  }
  res.status(201).json({ success: true, data: await withRefs(PharmacySale.findById(out._id)) });
});

// POST /:id/return { items?: [{ lineId, quantity }], cancel?: true, reason }
const returnSale = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "").trim().slice(0, 200);
  if (!reason) fail(res, 400, "A reason is required");
  const result = await withTxn(async (session) => {
    const sale = await PharmacySale.findOne({ _id: req.params.id, tenantId: req.tenantId }).session(session || null);
    if (!sale) throw new inv.StockError("Sale not found", 404);
    if (["returned", "cancelled"].includes(sale.status)) throw new inv.StockError(`This sale is already ${sale.status}`, 409);

    const asked = req.body.cancel
      ? sale.items.map((l) => ({ lineId: String(l._id), quantity: l.quantity - l.allocations.reduce((s, a) => s + a.returnedQuantity, 0) })).filter((x) => x.quantity > 0)
      : Array.isArray(req.body.items) ? req.body.items.map((x) => ({ lineId: String(x.lineId), quantity: Number(x.quantity) })) : [];
    if (!asked.length) throw new inv.StockError("Choose what to return", 400);
    if (req.body.cancel && sale.returns.length) throw new inv.StockError("A sale with returns can't be cancelled — return the rest instead", 409);

    const seq = sale.returnSeq;
    const restock = [];
    let refundValue = 0;
    for (const x of asked) {
      const line = sale.items.id(x.lineId);
      if (!line) throw new inv.StockError("That line is not part of this sale", 400);
      const left = line.quantity - line.allocations.reduce((s, a) => s + a.returnedQuantity, 0);
      if (!Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > left) throw new inv.StockError(`${line.medicineName}: only ${left} unit(s) can still be returned`, 409);
      let need = x.quantity;
      for (const a of [...line.allocations].reverse()) {
        const room = a.quantity - a.returnedQuantity;
        const take = Math.min(room, need);
        if (take > 0) {
          a.returnedQuantity += take;
          restock.push({ batchId: a.medicineBatchId, quantity: take });
          need -= take;
        }
        if (!need) break;
      }
      sale.returns.push({ lineId: line._id, quantity: x.quantity, reason, returnedBy: req.user._id });
      refundValue += x.quantity * line.unitPrice;
    }
    const allBack = sale.items.every((l) => l.allocations.reduce((s, a) => s + a.returnedQuantity, 0) >= l.quantity);
    const status = allBack ? (req.body.cancel ? "cancelled" : "returned") : "partially_returned";

    // Optimistic lock: only one of two simultaneous return requests can pass this gate.
    const gate = await PharmacySale.findOneAndUpdate(
      { _id: sale._id, tenantId: req.tenantId, returnSeq: seq },
      { $set: { items: sale.items, returns: sale.returns, status, cancelReason: req.body.cancel ? reason : sale.cancelReason, returnSeq: seq + 1 } },
      { new: true, ...opt(session) },
    );
    if (!gate) throw new inv.StockError("This sale was just changed by someone else — reload and try again", 409);

    for (const r of restock) {
      await inv.returnToBatch({
        tenantId: req.tenantId, batchId: r.batchId, quantity: r.quantity, type: "customer_return", referenceType: "pharmacy_sale",
        referenceId: sale._id, userId: req.user._id, reason, session,
      });
    }

    let refundDue = 0;
    if (sale.invoiceId) {
      const invoice = await Invoice.findOne({ _id: sale.invoiceId, tenantId: req.tenantId }).session(session || null);
      if (invoice && req.body.cancel && !invoice.payments.length && invoice.status !== "void") {
        invoice.status = "void";
        invoice.voidReason = `Sale ${sale.number} cancelled: ${reason}`;
        await invoice.save(opt(session));
      } else if (invoice) {
        refundDue = r2(Math.min(invoice.paid, refundValue));
      }
    } else {
      refundDue = r2(Math.min(sale.payments.reduce((s, p) => s + p.amount, 0), refundValue));
    }
    return { sale: gate, refundDue };
  });
  res.json({ success: true, data: result.sale, refundDue: result.refundDue });
});

module.exports = { getAll, getOne, createSale, returnSale };
