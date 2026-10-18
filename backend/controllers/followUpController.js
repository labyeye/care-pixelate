const asyncHandler = require("express-async-handler");
const Consultation = require("../models/Consultation");
const Appointment = require("../models/Appointment");
const { own } = require("../utils/doctorScope");
const { notifyPatient, when } = require("../utils/whatsapp");

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};
const DAY = 24 * 60 * 60 * 1000;
const istDayStart = () =>
  new Date(
    `${new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)}T00:00:00+05:30`,
  );

// A follow-up is "visited" once the patient has a completed visit after the consultation, "booked" if a later visit is
// scheduled, otherwise "pending" (the ones the clinic needs to chase).
const statusOf = (c, later) => {
  const mine = later.filter(
    (a) =>
      String(a.patientId) === String(c.patientId._id || c.patientId) &&
      String(a._id) !== String(c.appointmentId) &&
      a.scheduledAt >= c.createdAt,
  );
  if (mine.some((a) => a.status === "completed")) return "visited";
  if (mine.some((a) => a.status === "scheduled")) return "booked";
  return "pending";
};

// GET ?bucket=overdue|today|week|upcoming|all &status=open|pending|booked|visited|all
const list = asyncHandler(async (req, res) => {
  const start = istDayStart();
  const range = {
    overdue: { $lt: start },
    today: { $gte: start, $lt: new Date(+start + DAY) },
    week: { $gte: start, $lt: new Date(+start + 7 * DAY) },
    upcoming: { $gte: start },
  }[req.query.bucket];
  const filter = {
    tenantId: req.tenantId,
    followUpOn: range || { $ne: null, $gte: new Date(+start - 90 * DAY) },
    ...own(req),
  };
  const cons = await Consultation.find(filter)
    .populate(
      "patientId",
      "firstName middleName lastName patientId contact.phone",
    )
    .populate("doctorId", "firstName middleName lastName")
    .sort({ followUpOn: req.query.bucket === "overdue" ? -1 : 1 })
    .limit(300);

  const pids = [...new Set(cons.map((c) => String(c.patientId?._id)))];
  const later = pids.length
    ? await Appointment.find({
        tenantId: req.tenantId,
        patientId: { $in: pids },
        status: { $in: ["scheduled", "completed"] },
      }).select("patientId status scheduledAt")
    : [];
  const want = req.query.status || "open";
  const rows = cons
    .filter((c) => c.patientId)
    .map((c) => ({
      _id: c._id,
      patient: c.patientId,
      doctor: c.doctorId,
      followUpOn: c.followUpOn,
      consultedOn: c.createdAt,
      status: statusOf(c, later),
      reminderSentAt: c.followUpReminderSentAt || null,
    }))
    .filter((r) =>
      want === "all"
        ? true
        : want === "open"
          ? r.status !== "visited"
          : r.status === want,
    );
  res.json({ success: true, count: rows.length, data: rows });
});

// POST /:id/remind: send the follow-up WhatsApp now.
const remind = asyncHandler(async (req, res) => {
  const c = await Consultation.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    followUpOn: { $ne: null },
    ...own(req),
  });
  if (!c) fail(res, 404, "Follow-up not found");
  const r = await notifyPatient({
    tenantId: req.tenantId,
    patientId: c.patientId,
    doctorId: c.doctorId,
    key: "followup_reminder",
    extra: { date: when(c.followUpOn).date },
    ref: { kind: "consultation", id: c._id },
  });
  if (r.sent)
    await Consultation.updateOne(
      { _id: c._id },
      { followUpReminderSentAt: new Date() },
    );
  res.json({ success: true, data: r });
});

module.exports = { list, remind };
