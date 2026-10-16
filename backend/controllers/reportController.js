// Tabular reports (JSON for the web table, ?format=csv for download). Every report returns
// { title, columns, rows, totals } so one page can render any of them.
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");
const { toCsv } = require("../utils/csv");
const { INVENTORY_REPORTS, resolveFilters } = require("./inventoryReports");
const { ADMINS } = require("../middleware/auth");
const { own, patientScope } = require("../utils/doctorScope");
const { istDateString } = require("../utils/slots");

const DAY = 24 * 60 * 60 * 1000;
const MAX_ROWS = 5000;
const NAME = "firstName middleName lastName";
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ist = (d) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "");
const nameOf = (p) => (p && p.name) || "";

const ageOf = (dob, now = new Date()) => {
  if (!dob) return "";
  const d = new Date(dob);
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 150 ? a : "";
};

const col = (key, label, numeric = false) => ({ key, label, numeric });

const REPORTS = {
  appointments: {
    title: "Appointments",
    category: "clinical",
    desc: "Every booking in the period with patient, doctor, visit type, status and fee. Filter by status.",
    roles: "clinical",
    async build({ tenantId, range, query, mine }) {
      const filter = { tenantId, scheduledAt: { $gte: range.from, $lte: range.to } };
      for (const k of ["status", "doctorId", "clinicId", "type"]) if (query[k]) filter[k] = String(query[k]);
      Object.assign(filter, mine); // doctors: own appointments only
      const items = await Appointment.find(filter)
        .populate("patientId", `${NAME} patientId`)
        .populate("doctorId", `${NAME} doctorId`)
        .sort({ scheduledAt: 1 })
        .limit(MAX_ROWS);
      const rows = items.map((a) => ({
        when: ist(a.scheduledAt),
        patient: nameOf(a.patientId),
        patientRef: a.patientId?._id ? String(a.patientId._id) : "",
        patientId: a.patientId?.patientId || "",
        doctor: nameOf(a.doctorId),
        doctorRef: a.doctorId?._id ? String(a.doctorId._id) : "",
        type: a.type,
        status: a.status,
        fee: r2(a.fee),
        payment: a.paymentStatus,
      }));
      return {
        columns: [col("when", "Date & time"), col("patient", "Patient"), col("patientId", "Patient ID"), col("doctor", "Doctor"), col("type", "Type"), col("status", "Status"), col("fee", "Fee (₹)", true), col("payment", "Payment")],
        rows,
        totals: { patient: `${rows.length} appointments`, fee: r2(rows.reduce((s, r) => s + r.fee, 0)) },
      };
    },
  },

  patients: {
    title: "New patients",
    category: "clinical",
    desc: "Patients registered in the period with age, gender, phone and city.",
    roles: "clinical",
    async build({ tenantId, range, pScope }) {
      const items = await Patient.find({ tenantId, createdAt: { $gte: range.from, $lte: range.to }, ...pScope })
        .select(`${NAME} patientId gender dateOfBirth contact.phone address.city createdAt`)
        .sort({ createdAt: 1 })
        .limit(MAX_ROWS);
      const rows = items.map((p) => ({
        registered: ist(p.createdAt),
        patientId: p.patientId,
        patientRef: String(p._id),
        name: p.name,
        gender: p.gender,
        age: ageOf(p.dateOfBirth),
        phone: p.contact?.phone || "",
        city: p.address?.city || "",
      }));
      return {
        columns: [col("registered", "Registered"), col("patientId", "Patient ID"), col("name", "Name"), col("gender", "Gender"), col("age", "Age", true), col("phone", "Phone"), col("city", "City")],
        rows,
        totals: { name: `${rows.length} patients` },
      };
    },
  },

  doctors: {
    title: "Doctor performance",
    category: "clinical",
    desc: "Booked, completed, cancelled and no-show visits per doctor, with completion rate and consult fees.",
    roles: "clinical",
    async build({ tenantId, range, mine }) {
      const agg = await Appointment.aggregate([
        { $match: { tenantId, scheduledAt: { $gte: range.from, $lte: range.to }, ...mine } },
        {
          $group: {
            _id: "$doctorId",
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
            noShow: { $sum: { $cond: [{ $eq: ["$status", "no_show"] }, 1, 0] } },
            fees: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$fee", 0] } },
          },
        },
        { $sort: { completed: -1 } },
      ]);
      const docs = await Doctor.find({ tenantId, _id: { $in: agg.map((a) => a._id) } }).select(`${NAME} doctorId`);
      const by = Object.fromEntries(docs.map((d) => [String(d._id), d]));
      const rows = agg.map((a) => {
        const d = by[String(a._id)];
        return {
          doctor: d ? d.name : "Unknown",
          doctorRef: d ? String(d._id) : "",
          doctorId: d?.doctorId || "",
          total: a.total,
          completed: a.completed,
          cancelled: a.cancelled,
          noShow: a.noShow,
          completion: a.total ? r2((a.completed / a.total) * 100) : 0,
          fees: r2(a.fees),
        };
      });
      const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
      return {
        columns: [col("doctor", "Doctor"), col("doctorId", "ID"), col("total", "Booked", true), col("completed", "Completed", true), col("cancelled", "Cancelled", true), col("noShow", "No-show", true), col("completion", "Completion %", true), col("fees", "Consult fees (₹)", true)],
        rows,
        // fees = booked consultation fee of completed visits; actual money received is in the revenue report
        totals: { doctor: "Total", total: sum("total"), completed: sum("completed"), cancelled: sum("cancelled"), noShow: sum("noShow"), fees: r2(sum("fees")) },
      };
    },
  },

  revenue: {
    title: "Revenue (invoices)",
    category: "financial",
    desc: "Invoices raised in the period with discount, GST, amount paid and balance due. Void invoices are excluded from totals.",
    roles: "financial",
    async build({ tenantId, range, query }) {
      const filter = { tenantId, createdAt: { $gte: range.from, $lte: range.to } };
      if (query.status) filter.status = String(query.status);
      const items = await Invoice.find(filter).populate("patientId", `${NAME} patientId`).sort({ createdAt: 1 }).limit(MAX_ROWS);
      const rows = items.map((i) => ({
        date: ist(i.createdAt),
        number: i.number,
        patient: nameOf(i.patientId),
        patientRef: i.patientId?._id ? String(i.patientId._id) : "",
        subtotal: r2(i.subtotal),
        discount: r2(i.discount),
        gst: r2(i.gst),
        total: r2(i.total),
        paid: r2(i.paid),
        due: i.status === "void" ? 0 : r2(i.total - i.paid),
        status: i.status,
      }));
      const live = rows.filter((r) => r.status !== "void");
      const sum = (k) => r2(live.reduce((s, r) => s + r[k], 0));
      return {
        columns: [col("date", "Date"), col("number", "Invoice"), col("patient", "Patient"), col("subtotal", "Subtotal", true), col("discount", "Discount", true), col("gst", "GST", true), col("total", "Total", true), col("paid", "Paid", true), col("due", "Due", true), col("status", "Status")],
        rows,
        totals: { patient: "Total (excl. void)", subtotal: sum("subtotal"), discount: sum("discount"), gst: sum("gst"), total: sum("total"), paid: sum("paid"), due: sum("due") },
      };
    },
  },

  outstanding: {
    title: "Outstanding dues",
    category: "financial",
    desc: "Every open invoice still owed today, oldest and largest first, with the patient's phone for follow-up.",
    roles: "financial",
    // Not date-bound: everything still owed today, oldest first.
    async build({ tenantId }) {
      const items = await Invoice.find({ tenantId, status: { $in: ["unpaid", "partial"] } })
        .populate("patientId", `${NAME} patientId contact.phone`)
        .sort({ createdAt: 1 })
        .limit(MAX_ROWS);
      const now = Date.now();
      const rows = items
        .map((i) => ({
          number: i.number,
          patient: nameOf(i.patientId),
          patientRef: i.patientId?._id ? String(i.patientId._id) : "",
        patientRef: i.patientId?._id ? String(i.patientId._id) : "",
          phone: i.patientId?.contact?.phone || "",
          date: ist(i.createdAt),
          ageDays: Math.floor((now - new Date(i.createdAt).getTime()) / DAY),
          total: r2(i.total),
          paid: r2(i.paid),
          due: r2(i.total - i.paid),
        }))
        .sort((a, b) => b.due - a.due);
      return {
        columns: [col("number", "Invoice"), col("patient", "Patient"), col("phone", "Phone"), col("date", "Billed on"), col("ageDays", "Age (days)", true), col("total", "Total", true), col("paid", "Paid", true), col("due", "Due", true)],
        rows,
        totals: { patient: `${rows.length} open invoices`, total: r2(rows.reduce((s, r) => s + r.total, 0)), paid: r2(rows.reduce((s, r) => s + r.paid, 0)), due: r2(rows.reduce((s, r) => s + r.due, 0)) },
      };
    },
  },

  lab: {
    title: "Lab orders",
    category: "diagnostics",
    desc: "Lab orders in the period with abnormal result count and turnaround time.",
    roles: "clinical",
    async build({ tenantId, range, query, mine }) {
      const filter = { tenantId, createdAt: { $gte: range.from, $lte: range.to }, ...mine };
      if (query.status) filter.status = String(query.status);
      const items = await LabOrder.find(filter).populate("patientId", NAME).sort({ createdAt: 1 }).limit(MAX_ROWS);
      const rows = items.map((o) => ({
        ordered: ist(o.createdAt),
        number: o.number,
        patient: nameOf(o.patientId),
        patientRef: o.patientId?._id ? String(o.patientId._id) : "",
        tests: o.tests.map((t) => t.name).join("; "),
        abnormal: o.tests.filter((t) => t.flag === "high" || t.flag === "low").length,
        status: o.status,
        tatHours: o.resultedAt ? r2((new Date(o.resultedAt) - new Date(o.createdAt)) / 3600000) : "",
      }));
      return {
        columns: [col("ordered", "Ordered"), col("number", "Order"), col("patient", "Patient"), col("tests", "Tests"), col("abnormal", "Abnormal", true), col("status", "Status"), col("tatHours", "Turnaround (h)", true)],
        rows,
        totals: { patient: `${rows.length} orders`, abnormal: rows.reduce((s, r) => s + r.abnormal, 0) },
      };
    },
  },
};

Object.assign(REPORTS, INVENTORY_REPORTS);

// Who may run each class of report (the routes and the list endpoint share this).
const ROLE_SETS = {
  clinical: [...ADMINS, "doctor"],
  financial: [...ADMINS, "billing_executive"],
  inventory: [...ADMINS, "pharmacist"],
};

// GET /api/reports/:type?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
const run = asyncHandler(async (req, res) => {
  const def = REPORTS[req.params.type];
  if (!def) {
    res.status(404);
    throw new Error("Unknown report");
  }
  if (!req.tenantId) {
    res.status(400);
    throw new Error("No tenant specified");
  }
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999+05:30`) : new Date();
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+05:30`) : new Date(istDateString(new Date(to.getTime() - 29 * DAY)) + "T00:00:00+05:30");
  if (isNaN(from) || isNaN(to) || from > to || to - from > 366 * DAY) {
    res.status(400);
    throw new Error("Choose a valid date range of at most one year");
  }
  const tenantId = new mongoose.Types.ObjectId(String(req.tenantId));
  const out = await def.build({ tenantId, range: { from, to }, query: req.query, mine: own(req), pScope: await patientScope(req) });
  const truncated = out.rows.length >= MAX_ROWS;

  if (req.query.format === "csv") {
    const totalRow = out.totals ? [{ ...Object.fromEntries(out.columns.map((c) => [c.key, ""])), ...out.totals }] : [];
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${req.params.type}-${req.query.from || "recent"}-${req.query.to || "today"}.csv"`,
    });
    return res.send(toCsv(out.columns, [...out.rows, ...totalRow]));
  }
  res.json({ success: true, data: { type: req.params.type, title: def.title, range: { from, to }, truncated, ...out } });
});

// Only the reports this role may actually run, plus the filters each one offers.
const list = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId ? new mongoose.Types.ObjectId(String(req.tenantId)) : null;
  const mine = Object.entries(REPORTS).filter(([, d]) => (ROLE_SETS[d.roles] || []).includes(req.user.role));
  const data = await Promise.all(
    mine.map(async ([id, d]) => ({
      id,
      title: d.title,
      category: d.category,
      desc: d.desc,
      dateRange: !(id === "outstanding" || d.snapshot),
      filters: d.filters && tenantId ? await resolveFilters(tenantId, d.filters) : d.filters || [],
    })),
  );
  res.json({ success: true, data });
});

module.exports = { run, list, REPORTS, ROLE_SETS, ageOf };
