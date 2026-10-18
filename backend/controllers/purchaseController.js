const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const Medicine = require("../models/Medicine");
const MedicineBatch = require("../models/MedicineBatch");
const Vendor = require("../models/Vendor");
const Tenant = require("../models/Tenant");
const { Clinic } = require("../models/Compliance");
const { pick, pageOpts } = require("../utils/pick");
const { withTxn, opt } = require("../utils/txn");
const inv = require("../utils/inventory");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const oid = (v) => mongoose.isValidObjectId(v);

const HEADER_FIELDS = [
  "vendorId",
  "clinicId",
  "invoiceNumber",
  "invoiceDate",
  "dueDate",
  "notes",
];
const LINE_FIELDS = [
  "medicineId",
  "batchNumber",
  "manufacturingDate",
  "expiryDate",
  "quantity",
  "freeQuantity",
  "purchasePrice",
  "mrp",
  "sellingPrice",
  "discountPercent",
  "gstRate",
];

// Resolves medicines inside the tenant and prices every line on the server — client totals are ignored.
async function buildLines(req, res, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 200)
    fail(res, 400, "Add 1–200 line items");
  const ids = rawItems.map((i) => i && i.medicineId);
  if (ids.some((id) => !oid(id))) fail(res, 400, "Every line needs a medicine");
  const meds = await Medicine.find({
    _id: { $in: ids },
    tenantId: req.tenantId,
  });
  const byId = new Map(meds.map((m) => [String(m._id), m]));

  const seen = new Set();
  const lines = rawItems.map((raw, idx) => {
    const l = pick(raw, LINE_FIELDS);
    const m = byId.get(String(l.medicineId));
    const n = idx + 1;
    if (!m)
      fail(res, 400, `Line ${n}: medicine not found in this organisation`);
    if (!m.isActive) fail(res, 400, `Line ${n}: ${m.name} is inactive`);
    if (!m.trackInventory)
      fail(res, 400, `Line ${n}: inventory tracking is off for ${m.name}`);
    const qty = Number(l.quantity);
    const free = Number(l.freeQuantity || 0);
    if (!Number.isInteger(qty) || qty < 1)
      fail(res, 400, `Line ${n}: quantity must be a whole number ≥ 1`);
    if (!Number.isInteger(free) || free < 0)
      fail(res, 400, `Line ${n}: free quantity must be a whole number ≥ 0`);
    const price = Number(l.purchasePrice);
    if (!Number.isFinite(price) || price < 0)
      fail(res, 400, `Line ${n}: invalid purchase price`);
    const batchNumber = String(l.batchNumber || "")
      .trim()
      .toUpperCase();
    if (!batchNumber) fail(res, 400, `Line ${n}: batch number is required`);
    const expiry = new Date(l.expiryDate);
    if (isNaN(expiry)) fail(res, 400, `Line ${n}: invalid expiry date`);
    if (inv.isExpired(expiry))
      fail(res, 400, `Line ${n}: batch ${batchNumber} is already expired`);
    const mfg = l.manufacturingDate ? new Date(l.manufacturingDate) : null;
    if (mfg && (isNaN(mfg) || mfg > expiry))
      fail(res, 400, `Line ${n}: manufacturing date must be before expiry`);
    const dup = `${m._id}|${batchNumber}`;
    if (seen.has(dup))
      fail(
        res,
        400,
        `Line ${n}: batch ${batchNumber} of ${m.name} appears twice — merge the quantities`,
      );
    seen.add(dup);
    const disc = Number(l.discountPercent || 0);
    const gstRate =
      l.gstRate !== undefined ? Number(l.gstRate) : m.gstRate || 0;
    if (!(disc >= 0 && disc <= 100))
      fail(res, 400, `Line ${n}: discount must be 0–100%`);
    if (!(gstRate >= 0 && gstRate <= 28))
      fail(res, 400, `Line ${n}: GST rate must be 0–28%`);
    const mrp = l.mrp !== undefined ? Number(l.mrp) : m.mrp;
    const selling =
      l.sellingPrice !== undefined &&
      l.sellingPrice !== null &&
      l.sellingPrice !== ""
        ? Number(l.sellingPrice)
        : null;
    if (!(mrp >= 0)) fail(res, 400, `Line ${n}: invalid MRP`);
    if (selling !== null && (!(selling >= 0) || selling > mrp))
      fail(res, 400, `Line ${n}: selling price cannot exceed MRP`);

    const gross = r2(qty * price);
    const lineDisc = r2((gross * disc) / 100);
    const taxable = r2(gross - lineDisc);
    const gst = r2((taxable * gstRate) / 100);
    return {
      medicineId: m._id,
      medicineName: m.name,
      strength: m.strength,
      dosageForm: m.dosageForm,
      batchNumber,
      manufacturingDate: mfg,
      expiryDate: expiry,
      quantity: qty,
      freeQuantity: free,
      purchasePrice: price,
      mrp,
      sellingPrice: selling,
      discountPercent: disc,
      gstRate,
      taxableAmount: taxable,
      gstAmount: gst,
      lineTotal: r2(taxable + gst),
      _gross: gross,
      _disc: lineDisc,
    };
  });
  return lines;
}

function totalsOf(lines) {
  let subtotal = 0,
    discount = 0,
    taxable = 0,
    gst = 0;
  const byRate = new Map();
  for (const l of lines) {
    subtotal += l._gross;
    discount += l._disc;
    taxable += l.taxableAmount;
    gst += l.gstAmount;
    const b = byRate.get(l.gstRate) || {
      gstRate: l.gstRate,
      taxable: 0,
      tax: 0,
    };
    b.taxable += l.taxableAmount;
    b.tax += l.gstAmount;
    byRate.set(l.gstRate, b);
  }
  const exact = taxable + gst;
  const total = Math.round(exact);
  return {
    subtotal: r2(subtotal),
    discount: r2(discount),
    taxableAmount: r2(taxable),
    taxBreakdown: [...byRate.values()].map((b) => ({
      gstRate: b.gstRate,
      taxable: r2(b.taxable),
      tax: r2(b.tax),
    })),
    roundOff: r2(total - exact),
    total,
  };
}
const clean = (lines) => lines.map(({ _gross, _disc, ...l }) => l);

async function checkHeader(req, res, body, existing) {
  const vendorId = body.vendorId || existing?.vendorId;
  const vendor = await Vendor.findOne({
    _id: vendorId,
    tenantId: req.tenantId,
  });
  if (!vendor) fail(res, 400, "Vendor not found in this organisation");
  if (vendor.status !== "active")
    fail(res, 409, `Vendor is ${vendor.status} — purchases are not allowed`);
  if (
    body.clinicId &&
    !(await Clinic.exists({ _id: body.clinicId, tenantId: req.tenantId }))
  )
    fail(res, 400, "Location not found in this organisation");
  const date = new Date(body.invoiceDate ?? existing?.invoiceDate);
  if (isNaN(date) || date > new Date(Date.now() + 86_400_000))
    fail(res, 400, "Invoice date is invalid or in the future");
  if (body.dueDate) {
    const d = new Date(body.dueDate);
    if (isNaN(d) || d < date)
      fail(res, 400, "Due date must be on or after the invoice date");
  }
  if (!String(body.invoiceNumber ?? existing?.invoiceNumber ?? "").trim())
    fail(res, 400, "The vendor's invoice number is required");
}

const POP = [["vendorId", "vendorId businessName phone"]];
const withRefs = (q) => POP.reduce((a, [p, s]) => a.populate(p, s), q);

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (["draft", "received", "cancelled"].includes(req.query.status))
    filter.status = req.query.status;
  if (["unpaid", "partial", "paid"].includes(req.query.paymentStatus))
    filter.paymentStatus = req.query.paymentStatus;
  if (oid(req.query.vendorId)) filter.vendorId = req.query.vendorId;
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    withRefs(
      PurchaseInvoice.find(filter)
        .select("-items")
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ),
    PurchaseInvoice.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

const getOne = asyncHandler(async (req, res) => {
  const p = await withRefs(
    PurchaseInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId }),
  );
  if (!p) fail(res, 404, "Purchase invoice not found");
  res.json({ success: true, data: p });
});

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, HEADER_FIELDS);
  await checkHeader(req, res, body, null);
  const lines = await buildLines(req, res, req.body.items);
  const doc = new PurchaseInvoice({
    ...body,
    tenantId: req.tenantId,
    number: "pending",
    items: clean(lines),
    ...totalsOf(lines),
    createdBy: req.user._id,
  });
  await doc.validate(); // bad input never burns a number
  const t = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $inc: { "counters.purchase": 1 } },
    { new: true },
  ).select("counters");
  doc.number = `PUR-${new Date().getFullYear()}-${String(t.counters.purchase).padStart(5, "0")}`;
  try {
    await doc.save();
  } catch (e) {
    if (e.code === 11000)
      fail(res, 409, "This vendor invoice number has already been booked");
    throw e;
  }
  res.status(201).json({ success: true, data: doc });
});

// Drafts only: a received document is a financial record.
const update = asyncHandler(async (req, res) => {
  const p = await PurchaseInvoice.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!p) fail(res, 404, "Purchase invoice not found");
  if (p.status !== "draft")
    fail(res, 409, `A ${p.status} purchase invoice can no longer be edited`);
  const body = pick(req.body, HEADER_FIELDS);
  await checkHeader(req, res, body, p);
  p.set(body);
  if (req.body.items !== undefined) {
    const lines = await buildLines(req, res, req.body.items);
    p.items = clean(lines);
    p.set(totalsOf(lines));
  }
  try {
    await p.save();
  } catch (e) {
    if (e.code === 11000)
      fail(res, 409, "This vendor invoice number has already been booked");
    throw e;
  }
  res.json({ success: true, data: p });
});

// POST /:id/receive — goods accepted: creates/tops up batches + ledger rows, exactly once.
const receive = asyncHandler(async (req, res) => {
  const probe = await PurchaseInvoice.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!probe) fail(res, 404, "Purchase invoice not found");
  if (probe.status !== "draft")
    fail(
      res,
      409,
      probe.status === "received"
        ? "This invoice was already received"
        : `A ${probe.status} invoice cannot be received`,
    );
  const vendor = await Vendor.findOne({
    _id: probe.vendorId,
    tenantId: req.tenantId,
  });
  if (!vendor || vendor.status !== "active")
    fail(res, 409, "Vendor is not active");

  // Pre-flight (outside any transaction) so a bad line fails before anything is written.
  const meds = await Medicine.find({
    _id: { $in: probe.items.map((i) => i.medicineId) },
    tenantId: req.tenantId,
  });
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  for (const it of probe.items) {
    const m = byId.get(String(it.medicineId));
    if (!m || !m.isActive || !m.trackInventory)
      fail(
        res,
        409,
        `${it.medicineName} can no longer be received (inactive or untracked)`,
      );
    if (inv.isExpired(it.expiryDate))
      fail(res, 409, `Batch ${it.batchNumber} expired before it was received`);
    const existing = await MedicineBatch.findOne({
      tenantId: req.tenantId,
      clinicId: probe.clinicId || null,
      medicineId: it.medicineId,
      batchNumber: it.batchNumber,
    });
    if (
      existing &&
      existing.expiryDate.toISOString().slice(0, 10) !==
        new Date(it.expiryDate).toISOString().slice(0, 10)
    ) {
      fail(
        res,
        409,
        `Batch ${it.batchNumber} already exists with a different expiry date`,
      );
    }
  }

  let doc;
  try {
    doc = await withTxn(async (session) => {
      // The status flip is the idempotency gate: only one request can move draft -> received.
      const d = await PurchaseInvoice.findOneAndUpdate(
        { _id: probe._id, tenantId: req.tenantId, status: "draft" },
        {
          $set: {
            status: "received",
            receivedAt: new Date(),
            receivedBy: req.user._id,
          },
        },
        { new: true, ...opt(session) },
      );
      if (!d)
        throw new inv.StockError("This invoice was already received", 409);
      for (const it of d.items) {
        const batch = await inv.receiveLot({
          tenantId: req.tenantId,
          clinicId: d.clinicId || null,
          medicine: byId.get(String(it.medicineId)),
          vendorId: d.vendorId,
          purchaseInvoiceId: d._id,
          userId: req.user._id,
          referenceId: d._id,
          session,
          lot: {
            batchNumber: it.batchNumber,
            expiryDate: it.expiryDate,
            manufacturingDate: it.manufacturingDate,
            quantity: it.quantity,
            freeQuantity: it.freeQuantity,
            purchasePrice: it.purchasePrice,
            mrp: it.mrp,
            sellingPrice: it.sellingPrice,
          },
        });
        it.medicineBatchId = batch._id;
      }
      await d.save(opt(session));
      return d;
    });
  } catch (e) {
    // Without transactions (standalone MongoDB) hand the document back to draft so it can be retried.
    await PurchaseInvoice.updateOne(
      {
        _id: probe._id,
        tenantId: req.tenantId,
        status: "received",
        "items.medicineBatchId": null,
      },
      { $set: { status: "draft" }, $unset: { receivedAt: 1, receivedBy: 1 } },
    );
    throw e;
  }
  res.json({ success: true, data: doc });
});

const cancel = asyncHandler(async (req, res) => {
  const p = await PurchaseInvoice.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, status: "draft" },
    {
      $set: {
        status: "cancelled",
        notes: String(req.body.reason || "").slice(0, 300) || undefined,
      },
    },
    { new: true },
  );
  if (!p)
    fail(
      res,
      409,
      "Only a draft purchase invoice can be cancelled; return received goods to the vendor instead",
    );
  res.json({ success: true, data: p });
});

// POST /:id/payments { amount, mode, reference }
const addPayment = asyncHandler(async (req, res) => {
  const amount = r2(Number(req.body.amount));
  const mode = String(req.body.mode || "");
  if (!(amount > 0)) fail(res, 400, "Enter a valid amount");
  if (!["cash", "upi", "card", "bank", "cheque", "other"].includes(mode))
    fail(res, 400, "Invalid payment mode");
  const p = await PurchaseInvoice.findOneAndUpdate(
    // overpayment is rejected inside the update itself, so two simultaneous payments can't both pass
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      status: "received",
      $expr: {
        $lte: [{ $add: ["$paidAmount", amount] }, { $add: ["$total", 0.005] }],
      },
    },
    {
      $push: {
        payments: {
          amount,
          mode,
          reference: String(req.body.reference || "").slice(0, 80),
          recordedBy: req.user._id,
        },
      },
      $inc: { paidAmount: amount },
    },
    { new: true },
  );
  if (!p)
    fail(
      res,
      409,
      "Payment rejected: invoice is not received, or the amount exceeds the balance",
    );
  p.paymentStatus = p.paidAmount + 0.005 >= p.total ? "paid" : "partial";
  await p.save();
  res.json({ success: true, data: p });
});

// POST /:id/return { items: [{ medicineBatchId, quantity, reason }] } — goods back to the vendor.
const returnToVendor = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) fail(res, 400, "Choose at least one batch to return");
  const result = await withTxn(async (session) => {
    const p = await PurchaseInvoice.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      status: "received",
    }).session(session || null);
    if (!p)
      throw new inv.StockError(
        "Only a received purchase invoice can have returns",
        409,
      );
    for (const r of items) {
      const qty = Number(r.quantity);
      const line = p.items.find(
        (l) => String(l.medicineBatchId) === String(r.medicineBatchId),
      );
      if (!line)
        throw new inv.StockError("That batch is not part of this invoice", 400);
      const already = p.returns
        .filter(
          (x) => String(x.medicineBatchId) === String(line.medicineBatchId),
        )
        .reduce((s, x) => s + x.quantity, 0);
      if (
        !Number.isInteger(qty) ||
        qty < 1 ||
        already + qty > line.quantity + line.freeQuantity
      ) {
        throw new inv.StockError(
          `Cannot return ${qty} of batch ${line.batchNumber} (received ${line.quantity + line.freeQuantity}, already returned ${already})`,
          409,
        );
      }
      await inv.adjustBatch({
        tenantId: req.tenantId,
        batchId: line.medicineBatchId,
        delta: -qty,
        type: "supplier_return",
        reason: String(r.reason || "Returned to vendor").slice(0, 300),
        userId: req.user._id,
        referenceType: "purchase_invoice",
        referenceId: p._id,
        session,
      });
      p.returns.push({
        medicineBatchId: line.medicineBatchId,
        medicineId: line.medicineId,
        quantity: qty,
        reason: String(r.reason || "").slice(0, 200),
        returnedBy: req.user._id,
      });
    }
    await p.save(opt(session));
    return p;
  });
  res.json({ success: true, data: result });
});

module.exports = {
  getAll,
  getOne,
  create,
  update,
  receive,
  cancel,
  addPayment,
  returnToVendor,
  totalsOf,
};
