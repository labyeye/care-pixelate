const asyncHandler = require("express-async-handler");
const Invoice = require("../models/Invoice");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const Tenant = require("../models/Tenant");
require("../models/Doctor"); // registers the model used by populate("doctorId")
const Consultation = require("../models/Consultation");
const LabOrder = require("../models/LabOrder");
const PriceItem = require("../models/PriceItem");
const Medicine = require("../models/Medicine");
const Doctor = require("../models/Doctor");
const { searchFilter } = require("../utils/pick");
const { buildBillable, priceKey, srcKey, norm } = require("../utils/billable");
const { computeTotals, statusFor, r2 } = require("../utils/invoice");
const { pick, pageOpts } = require("../utils/pick");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// Atomic per-tenant counter, e.g. INV-2026-00007.
const nextNumber = async (tenantId) => {
  const t = await Tenant.findByIdAndUpdate(
    tenantId,
    { $inc: { "counters.invoice": 1 } },
    { new: true },
  ).select("counters");
  return `INV-${new Date().getFullYear()}-${String(t.counters.invoice).padStart(5, "0")}`;
};

// Keys already on a live (non-void) invoice for this patient, so nothing is billed twice.
const billedKeys = async (tenantId, patientId) => {
  const invs = await Invoice.find({
    tenantId,
    patientId,
    status: { $ne: "void" },
  }).select("appointmentId items.source");
  const set = new Set();
  for (const inv of invs) {
    // invoices made with the per-visit "Bill" button (or imported) carry the visit on appointmentId, not on a line
    if (inv.appointmentId) set.add(srcKey("appointment", inv.appointmentId));
    for (const it of inv.items)
      if (it.source)
        set.add(srcKey(it.source.kind, it.source.refId, it.source.key));
  }
  return set;
};

// Every source line must really belong to this patient in this organisation, and not be billed already.
const assertSources = async (req, res, patientId, lines) => {
  const withSrc = lines.filter((l) => l.source);
  if (!withSrc.length) return;
  const billed = await billedKeys(req.tenantId, patientId);
  const cache = new Map();
  const find = async (kind, id) => {
    const k = kind + id;
    if (!cache.has(k)) {
      const base = { _id: id, tenantId: req.tenantId, patientId };
      cache.set(
        k,
        kind === "appointment"
          ? await Appointment.findOne(base).select("_id")
          : kind === "lab"
            ? await LabOrder.findOne(base).select("tests.name")
            : await Consultation.findOne(base).select(
                "prescription.items.drug",
              ),
      );
    }
    return cache.get(k);
  };
  for (const l of withSrc) {
    const { kind, refId, key } = l.source;
    const doc = await find(kind, refId);
    const ok =
      doc &&
      (kind === "appointment" ||
        (kind === "lab" && doc.tests.some((t) => norm(t.name) === norm(key))) ||
        (kind === "medicine" &&
          (doc.prescription?.items || []).some(
            (m) => norm(m.drug) === norm(key),
          )));
    if (!ok) fail(res, 400, "A linked line does not belong to this patient");
    if (billed.has(srcKey(kind, refId, key)))
      fail(res, 409, `"${l.description}" is already on another invoice`);
  }
};

// Save typed prices of lab/medicine lines so next time they come pre-filled.
const rememberPrices = async (tenantId, lines) => {
  const ops = lines
    .filter(
      (l) =>
        l.source &&
        l.source.kind !== "appointment" &&
        l.rate > 0 &&
        l.source.key,
    )
    .map((l) => ({
      updateOne: {
        filter: { tenantId, kind: l.source.kind, nameKey: norm(l.source.key) },
        update: {
          $set: { name: l.source.key, price: l.rate, gstRate: l.gstRate || 0 },
        },
        upsert: true,
      },
    }));
  if (ops.length) await PriceItem.bulkWrite(ops);
};

const PAY_MODES = [
  "cash",
  "upi",
  "card",
  "bank",
  "insurance",
  "online",
  "other",
];

const build = async (
  req,
  res,
  {
    patientId,
    appointmentId,
    items,
    discount,
    notes,
    remember,
    dueDate,
    doctorId,
    initialPayment,
  },
) => {
  if (!(await Patient.exists({ _id: patientId, tenantId: req.tenantId })))
    fail(res, 400, "Patient not found in this organisation");
  let totals;
  try {
    totals = computeTotals(items || [], discount);
  } catch (err) {
    fail(res, 400, err.message);
  }
  await assertSources(req, res, patientId, totals.lines);

  if (
    doctorId &&
    !(await Doctor.exists({ _id: doctorId, tenantId: req.tenantId }))
  )
    fail(res, 400, "Doctor not found in this organisation");
  const medIds = totals.lines.map((l) => l.medicineId).filter(Boolean);
  if (
    medIds.length &&
    (await Medicine.countDocuments({
      _id: { $in: medIds },
      tenantId: req.tenantId,
    })) !== new Set(medIds).size
  ) {
    fail(res, 400, "A medicine on this invoice is not in your inventory");
  }
  const due = dueDate ? new Date(dueDate) : undefined;
  if (due && isNaN(due)) fail(res, 400, "Invalid due date");

  // Payment received at the counter while billing (advance or full) is recorded on the invoice itself.
  let payments = [];
  let paid = 0;
  if (initialPayment && Number(initialPayment.amount) > 0) {
    paid = r2(Number(initialPayment.amount));
    if (!PAY_MODES.includes(initialPayment.mode))
      fail(res, 400, "Choose how the payment was received");
    if (paid > totals.total + 0.001)
      fail(res, 400, "Payment cannot exceed the invoice total");
    payments = [
      {
        amount: paid,
        mode: initialPayment.mode,
        reference: String(initialPayment.reference || "").slice(0, 100),
        receivedBy: req.user._id,
      },
    ];
  }
  if (remember) await rememberPrices(req.tenantId, totals.lines);
  return Invoice.create({
    tenantId: req.tenantId,
    number: await nextNumber(req.tenantId),
    patientId,
    appointmentId,
    items: totals.lines,
    subtotal: totals.subtotal,
    gst: totals.gst,
    discount: totals.discount,
    total: totals.total,
    paid,
    payments,
    status: statusFor(totals.total, paid),
    dueDate: due,
    doctorId: doctorId || undefined,
    notes: notes ? String(notes).slice(0, 500) : "",
    createdBy: req.user._id,
  });
};

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.patientId) filter.patientId = String(req.query.patientId);
  const { limit, skip } = pageOpts(req.query);
  const [data, total] = await Promise.all([
    Invoice.find(filter)
      .populate(
        "patientId",
        "firstName middleName lastName patientId contact.phone",
      )
      .populate("doctorId", "firstName middleName lastName")
      .populate("payments.receivedBy", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);
  res.json({ success: true, count: data.length, total, data });
});

const getOne = asyncHandler(async (req, res) => {
  const inv = await Invoice.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  })
    .populate(
      "patientId",
      "firstName middleName lastName patientId contact address gender dateOfBirth",
    )
    .populate(
      "doctorId",
      "firstName middleName lastName doctorId professionalDetails.registrationNumber professionalDetails.specializations",
    )
    .populate("payments.receivedBy", "name")
    .populate("createdBy", "name");
  if (!inv) fail(res, 404, "Invoice not found");
  res.json({ success: true, data: inv });
});

// GET /catalog?q=  type-ahead for an invoice line: inventory medicines first (price, GST, HSN, unit and stock
// come with them), then the clinic's own price list (lab tests, procedures).
const catalog = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ success: true, count: 0, data: [] });
  const [meds, prices] = await Promise.all([
    Medicine.find({
      tenantId: req.tenantId,
      isActive: true,
      ...searchFilter(q, [
        "name",
        "genericName",
        "brandName",
        "barcode",
        "sku",
        "medicineId",
      ]),
    })
      .select(
        "name strength dosageForm sellingPrice gstRate hsnCode unit stockQty trackInventory",
      )
      .sort({ name: 1 })
      .limit(8),
    PriceItem.find({
      tenantId: req.tenantId,
      kind: { $ne: "medicine" },
      ...searchFilter(q, ["name"]),
    })
      .sort({ name: 1 })
      .limit(6),
  ]);
  const data = [
    ...meds.map((m) => {
      const label =
        m.strength && !norm(m.name).includes(norm(m.strength))
          ? `${m.name} ${m.strength}`
          : m.name;
      return {
        kind: "medicine",
        label,
        description: `Medicine: ${label}`,
        rate: m.sellingPrice,
        gstRate: m.gstRate || 0,
        hsnCode: m.hsnCode || "",
        unit: m.unit || "",
        medicineId: String(m._id),
        stock: m.trackInventory ? m.stockQty : null,
        detail: m.dosageForm || "",
      };
    }),
    ...prices.map((p) => ({
      kind: p.kind,
      label: p.name,
      description: `${p.kind === "lab" ? "Lab" : "Service"}: ${p.name}`,
      rate: p.price,
      gstRate: p.gstRate || 0,
      hsnCode: "",
      unit: "nos",
      stock: null,
      detail: p.kind,
    })),
  ];
  res.json({ success: true, count: data.length, data });
});

// GET /billable?patientId=  everything about this patient that can be billed and isn't yet
const billable = asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || "");
  if (
    !/^[0-9a-f]{24}$/i.test(patientId) ||
    !(await Patient.exists({ _id: patientId, tenantId: req.tenantId }))
  ) {
    fail(res, 400, "Choose a patient");
  }
  const t = { tenantId: req.tenantId, patientId };
  const [appts, labs, cons, priceDocs, billed, medicines] = await Promise.all([
    Appointment.find({ ...t, status: "completed" })
      .populate("doctorId", "firstName middleName lastName")
      .sort({ scheduledAt: -1 })
      .limit(50),
    LabOrder.find({ ...t, status: { $ne: "cancelled" } })
      .select("number createdAt tests.name")
      .sort({ createdAt: -1 })
      .limit(50),
    Consultation.find({ ...t, status: "signed" })
      .populate("doctorId", "firstName middleName lastName")
      .select("doctorId signedAt createdAt prescription.items")
      .sort({ signedAt: -1 })
      .limit(50),
    PriceItem.find({ tenantId: req.tenantId }),
    billedKeys(req.tenantId, patientId),
    Medicine.find({ tenantId: req.tenantId }).select(
      "name strength sellingPrice gstRate hsnCode unit",
    ),
  ]);
  const prices = new Map(
    priceDocs.map((p) => [
      priceKey(p.kind, p.name),
      { price: p.price, gstRate: p.gstRate },
    ]),
  );
  const docName = (d) => (d && d.name ? `Dr. ${d.name}` : "");
  const items = buildBillable({
    appointments: appts.map((a) => ({
      _id: a._id,
      scheduledAt: a.scheduledAt,
      fee: a.fee,
      doctorName: docName(a.doctorId),
    })),
    labOrders: labs.map((o) => ({
      _id: o._id,
      number: o.number,
      createdAt: o.createdAt,
      tests: o.tests,
    })),
    consultations: cons.map((c) => ({
      _id: c._id,
      signedAt: c.signedAt,
      createdAt: c.createdAt,
      prescription: c.prescription,
      doctorName: docName(c.doctorId),
    })),
    prices,
    billed,
    medicines,
  });
  res.json({ success: true, count: items.length, data: items });
});

const create = asyncHandler(async (req, res) => {
  const inv = await build(req, res, {
    ...pick(req.body, [
      "patientId",
      "items",
      "discount",
      "notes",
      "dueDate",
      "doctorId",
      "initialPayment",
    ]),
    remember: req.body.rememberPrices === true,
  });
  res.status(201).json({ success: true, data: inv });
});

// POST /from-appointment/:appointmentId: one consultation line at the doctor's fee captured at booking.
const fromAppointment = asyncHandler(async (req, res) => {
  const appt = await Appointment.findOne({
    _id: req.params.appointmentId,
    tenantId: req.tenantId,
  }).populate("doctorId", "firstName middleName lastName");
  if (!appt) fail(res, 404, "Appointment not found");
  if (
    await Invoice.exists({
      tenantId: req.tenantId,
      appointmentId: appt._id,
      status: { $ne: "void" },
    })
  ) {
    fail(res, 409, "This appointment is already billed");
  }
  const items = [
    {
      description: `Consultation - ${appt.doctorId?.name || "Doctor"}`,
      qty: 1,
      rate: appt.fee || 0,
      gstRate: 0,
      source: { kind: "appointment", refId: String(appt._id), key: "" },
    },
  ];
  const inv = await build(req, res, {
    patientId: appt.patientId,
    appointmentId: appt._id,
    items,
    discount: 0,
    notes: "",
  });
  res.status(201).json({ success: true, data: inv });
});

const addPayment = asyncHandler(async (req, res) => {
  const amount = r2(Number(req.body.amount));
  if (!(amount > 0)) fail(res, 400, "Enter a valid amount");
  if (
    !["cash", "upi", "card", "bank", "insurance", "other"].includes(
      req.body.mode,
    )
  )
    fail(res, 400, "Invalid payment mode");

  // Guarded in the query itself so two receptionists can't overpay the same invoice.
  const inv = await Invoice.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      status: { $in: ["unpaid", "partial"] },
      $expr: {
        $lte: [{ $add: ["$paid", amount] }, { $add: ["$total", 0.001] }],
      },
    },
    {
      $push: {
        payments: {
          amount,
          mode: req.body.mode,
          reference: String(req.body.reference || "").slice(0, 100),
          receivedBy: req.user._id,
        },
      },
      $inc: { paid: amount },
    },
    { new: true },
  );
  if (!inv)
    fail(
      res,
      409,
      "Invoice not found, already settled/void, or the amount exceeds the balance due",
    );
  inv.paid = r2(inv.paid);
  inv.status = statusFor(inv.total, inv.paid, inv.status);
  await inv.save();
  res.json({ success: true, data: inv });
});

const voidInvoice = asyncHandler(async (req, res) => {
  const inv = await Invoice.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!inv) fail(res, 404, "Invoice not found");
  if (inv.status === "void") fail(res, 409, "Invoice is already void");
  if (inv.paid > 0) fail(res, 409, "Refund recorded payments before voiding");
  inv.status = "void";
  inv.voidReason = String(req.body.reason || "").slice(0, 200);
  await inv.save();
  res.json({ success: true, data: inv });
});

module.exports = {
  getAll,
  getOne,
  billable,
  catalog,
  create,
  fromAppointment,
  addPayment,
  voidInvoice,
  build,
};
