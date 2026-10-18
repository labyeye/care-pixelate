// Hourly reminder job: appointment reminders (next ~24h) and follow-up reminders (due tomorrow).
// Does nothing until the WhatsApp API is connected, so no appointment is marked "reminded" without a real send.
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const {
  isConnected,
  notifyAppointment,
  notifyPatient,
  when,
} = require("./whatsapp");

const H = 3600 * 1000;
const istDayStart = (offsetDays = 0) =>
  new Date(
    new Date(
      `${new Date(Date.now() + 5.5 * H).toISOString().slice(0, 10)}T00:00:00+05:30`,
    ).getTime() +
      offsetDays * 24 * H,
  );

async function runOnce() {
  if (!isConnected()) return { appointments: 0, followUps: 0 };
  let appointments = 0;
  let followUps = 0;

  const appts = await Appointment.find({
    status: "scheduled",
    reminderSentAt: null,
    scheduledAt: {
      $gt: new Date(Date.now() + H),
      $lte: new Date(Date.now() + 25 * H),
    },
  })
    .select("_id")
    .limit(300);
  for (const a of appts) {
    const r = await notifyAppointment("appointment_reminder", a._id);
    if (r.sent) {
      await Appointment.updateOne(
        { _id: a._id },
        { reminderSentAt: new Date() },
      );
      appointments++;
    }
  }

  const cons = await Consultation.find({
    followUpReminderSentAt: null,
    followUpOn: { $gte: istDayStart(1), $lt: istDayStart(2) },
  })
    .select("tenantId patientId doctorId followUpOn")
    .limit(300);
  for (const c of cons) {
    const r = await notifyPatient({
      tenantId: c.tenantId,
      patientId: c.patientId,
      doctorId: c.doctorId,
      key: "followup_reminder",
      extra: { date: when(c.followUpOn).date },
      ref: { kind: "consultation", id: c._id },
    });
    if (r.sent) {
      await Consultation.updateOne(
        { _id: c._id },
        { followUpReminderSentAt: new Date() },
      );
      followUps++;
    }
  }
  return { appointments, followUps };
}

function start() {
  const tick = () =>
    runOnce().catch((e) => console.error("Reminder job failed:", e.message));
  setTimeout(tick, 60 * 1000);
  return setInterval(tick, H).unref();
}

module.exports = { runOnce, start };
