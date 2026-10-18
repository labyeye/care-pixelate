const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");
const { own, patientScope } = require("../utils/doctorScope");

const DAY = 24 * 60 * 60 * 1000;
const asMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));

// GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days, IST day buckets)
const summary = asyncHandler(async (req, res) => {
  if (!req.tenantId) {
    res.status(400);
    throw new Error("No tenant specified");
  }
  const tenantId = new mongoose.Types.ObjectId(String(req.tenantId));
  const to = req.query.to
    ? new Date(`${req.query.to}T23:59:59.999+05:30`)
    : new Date();
  const from = req.query.from
    ? new Date(`${req.query.from}T00:00:00+05:30`)
    : new Date(to.getTime() - 30 * DAY);
  if (isNaN(from) || isNaN(to) || from > to || to - from > 366 * DAY) {
    res.status(400);
    throw new Error("Choose a valid date range of at most one year");
  }
  // Doctors: their own appointments, lab orders and invoices, and their own patients.
  const mine = own(req);
  const apptMatch = {
    tenantId,
    scheduledAt: { $gte: from, $lte: to },
    ...mine,
  };
  const created = { tenantId, createdAt: { $gte: from, $lte: to } };

  const [byStatus, byDay, topRaw, newPatients, invoiceTotals, payModes, lab] =
    await Promise.all([
      Appointment.aggregate([
        { $match: apptMatch },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]),
      Appointment.aggregate([
        { $match: apptMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$scheduledAt",
                timezone: "+05:30",
              },
            },
            n: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Appointment.aggregate([
        { $match: { ...apptMatch, status: "completed" } },
        { $group: { _id: "$doctorId", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
      ]),
      Patient.countDocuments({ ...created, ...(await patientScope(req)) }),
      Invoice.aggregate([
        { $match: { ...created, ...mine, status: { $ne: "void" } } },
        {
          $group: {
            _id: null,
            billed: { $sum: "$total" },
            collected: { $sum: "$paid" },
            count: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: { tenantId, ...mine } },
        { $unwind: "$payments" },
        { $match: { "payments.receivedAt": { $gte: from, $lte: to } } },
        { $group: { _id: "$payments.mode", n: { $sum: "$payments.amount" } } },
      ]),
      LabOrder.aggregate([
        { $match: { ...created, ...mine } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
      ]),
    ]);

  const docs = await Doctor.find({
    _id: { $in: topRaw.map((t) => t._id) },
    tenantId,
  }).select("firstName middleName lastName");
  const nameOf = Object.fromEntries(docs.map((d) => [String(d._id), d.name]));
  const inv = invoiceTotals[0] || { billed: 0, collected: 0, count: 0 };
  const statusCounts = asMap(byStatus);
  const totalAppts = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  res.json({
    success: true,
    data: {
      range: { from, to },
      appointments: {
        total: totalAppts,
        byStatus: statusCounts,
        byDay: byDay.map((d) => ({ date: d._id, count: d.n })),
        noShowRate: totalAppts
          ? Math.round(((statusCounts.no_show || 0) / totalAppts) * 1000) / 10
          : 0,
      },
      newPatients,
      revenue: {
        invoices: inv.count,
        billed: Math.round(inv.billed * 100) / 100,
        collected: Math.round(inv.collected * 100) / 100, // payments applied to invoices created in range
        outstanding: Math.round((inv.billed - inv.collected) * 100) / 100,
        receivedByMode: asMap(payModes), // cash actually received in range, any invoice date
      },
      topDoctors: topRaw.map((t) => ({
        doctorId: t._id,
        name: nameOf[String(t._id)] || "Unknown",
        completed: t.n,
      })),
      lab: asMap(lab),
    },
  });
});

module.exports = { summary };
