// One call returns the headline numbers for every list page's summary cards, so cards always show
// true totals (list pages only load the first page of rows).
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");
const Consultation = require("../models/Consultation");
const { Clinic, AuditLog } = require("../models/Compliance");
const { dayStart, istDateString } = require("../utils/slots");
const { own, patientScope } = require("../utils/doctorScope");

const DAY = 24 * 60 * 60 * 1000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MONEY_ROLES = [
  "super_admin",
  "tenant_owner",
  "hospital_admin",
  "billing_executive",
];
const ADMIN_ROLES = ["super_admin", "tenant_owner", "hospital_admin"];

const summary = asyncHandler(async (req, res) => {
  if (!req.tenantId) {
    res.status(400);
    throw new Error("No tenant specified");
  }
  const tenantId = new mongoose.Types.ObjectId(String(req.tenantId));
  const t = { tenantId };
  const now = new Date();
  const todayStart = dayStart(istDateString(now));
  const todayEnd = new Date(todayStart.getTime() + DAY);
  const monthStart = new Date(
    `${istDateString(now).slice(0, 8)}01T00:00:00+05:30`,
  );
  const canMoney = MONEY_ROLES.includes(req.user.role);
  const isAdmin = ADMIN_ROLES.includes(req.user.role);

  // Doctors see numbers for their own work only (their patients, appointments, consultations, lab orders).
  const mine = own(req);
  const pScope = await patientScope(req);
  const scopeOf = (M) =>
    M === Patient
      ? pScope
      : [Appointment, LabOrder, Consultation].includes(M)
        ? mine
        : {};
  const c = (M, q) => M.countDocuments({ ...t, ...q, ...scopeOf(M) });
  const [
    pTotal,
    pActive,
    pInactive,
    pArchived,
    pNew,
    dTotal,
    dActive,
    dVerified,
    dPending,
    sTotal,
    sActive,
    sInactive,
    sDoctors,
    aTotal,
    aToday,
    aUpcoming,
    aCompleted,
    aCancelled,
    aNoShow,
    lOrdered,
    lCollected,
    lResulted,
    lAbnormal,
    cTotal,
    cActive,
    xToday,
    xDraft,
    xSigned,
    xFollowUps,
    money,
    audit,
  ] = await Promise.all([
    c(Patient, {}),
    c(Patient, { patientStatus: "active" }),
    c(Patient, { patientStatus: "inactive" }),
    c(Patient, { patientStatus: "archived" }),
    c(Patient, { createdAt: { $gte: monthStart } }),
    c(Doctor, {}),
    c(Doctor, { accountStatus: "active" }),
    c(Doctor, { verificationStatus: "verified" }),
    c(Doctor, { verificationStatus: "pending" }),
    User.countDocuments({ ...t, role: { $ne: "patient" } }),
    User.countDocuments({ ...t, role: { $ne: "patient" }, status: "active" }),
    User.countDocuments({ ...t, role: { $ne: "patient" }, status: "inactive" }),
    User.countDocuments({ ...t, role: "doctor" }),
    c(Appointment, {}),
    c(Appointment, { scheduledAt: { $gte: todayStart, $lt: todayEnd } }),
    c(Appointment, { status: "scheduled", scheduledAt: { $gte: now } }),
    c(Appointment, { status: "completed" }),
    c(Appointment, { status: "cancelled" }),
    c(Appointment, { status: "no_show" }),
    c(LabOrder, { status: "ordered" }),
    c(LabOrder, { status: "collected" }),
    c(LabOrder, { status: "resulted" }),
    c(LabOrder, { status: "resulted", "tests.flag": { $in: ["high", "low"] } }),
    c(Clinic, {}),
    c(Clinic, { status: "active" }),
    c(Consultation, { createdAt: { $gte: todayStart, $lt: todayEnd } }),
    c(Consultation, { status: "draft" }),
    c(Consultation, { status: "signed" }),
    c(Consultation, {
      status: "signed",
      followUpOn: {
        $gte: todayStart,
        $lt: new Date(todayStart.getTime() + 8 * DAY),
      },
    }),
    canMoney
      ? Invoice.aggregate([
          { $match: { ...t, status: { $ne: "void" } } },
          {
            $group: {
              _id: "$status",
              n: { $sum: 1 },
              billed: { $sum: "$total" },
              paid: { $sum: "$paid" },
            },
          },
        ])
      : Promise.resolve(null),
    isAdmin
      ? AuditLog.aggregate([
          { $match: { ...t, at: { $gte: todayStart, $lt: todayEnd } } },
          {
            $group: {
              _id: { $cond: [{ $gte: ["$status", 400] }, "denied", "$action"] },
              n: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve(null),
  ]);

  let invoices = null;
  if (money) {
    const by = Object.fromEntries(money.map((m) => [m._id, m]));
    const billed = money.reduce((s, m) => s + m.billed, 0);
    const collected = money.reduce((s, m) => s + m.paid, 0);
    invoices = {
      count: money.reduce((s, m) => s + m.n, 0),
      billed: r2(billed),
      collected: r2(collected),
      outstanding: r2(billed - collected),
      unpaid: by.unpaid?.n || 0,
      partial: by.partial?.n || 0,
      paid: by.paid?.n || 0,
    };
  }
  let auditToday = null;
  if (audit) {
    const a = Object.fromEntries(audit.map((x) => [x._id, x.n]));
    auditToday = {
      events: audit.reduce((s, x) => s + x.n, 0),
      views: a.view || 0,
      changes:
        (a.create || 0) + (a.update || 0) + (a.delete || 0) + (a.action || 0),
      denied: a.denied || 0,
    };
  }

  res.json({
    success: true,
    data: {
      patients: {
        total: pTotal,
        active: pActive,
        inactive: pInactive,
        archived: pArchived,
        newThisMonth: pNew,
      },
      doctors: {
        total: dTotal,
        active: dActive,
        verified: dVerified,
        pendingVerification: dPending,
      },
      staff: {
        total: sTotal,
        active: sActive,
        inactive: sInactive,
        doctors: sDoctors,
      },
      appointments: {
        total: aTotal,
        today: aToday,
        upcoming: aUpcoming,
        completed: aCompleted,
        cancelled: aCancelled,
        noShow: aNoShow,
      },
      invoices,
      lab: {
        ordered: lOrdered,
        collected: lCollected,
        resulted: lResulted,
        abnormal: lAbnormal,
      },
      clinics: { total: cTotal, active: cActive },
      consultations: {
        today: xToday,
        drafts: xDraft,
        signed: xSigned,
        followUpsThisWeek: xFollowUps,
      },
      auditToday,
    },
  });
});

module.exports = { summary };
