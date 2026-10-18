// Sends WhatsApp template messages for a clinic. Best-effort: never throws into the caller (a failed reminder
// must not fail a booking). Every attempt is written to MessageLog so the clinic can see what went out.
//
// THE API IS NOT CONNECTED YET. Until deliver() is implemented, every send is logged as "not_connected"
// and nothing leaves the server. To go live: implement deliver() below (templates are in whatsappTemplates.js,
// use params(key, vars) for the positional values) and return true from isConnected().
const Tenant = require("../models/Tenant");
const MessageLog = require("../models/MessageLog");
const { BY_KEY, params } = require("./whatsappTemplates");

const isConnected = () => false;

// eslint-disable-next-line no-unused-vars
async function deliver({ to, template, vars }) {
  // TODO(whatsapp-api): POST to the provider with { to, template: template.name, language: template.language, params: params(template.key, vars) }
  throw new Error("WhatsApp API is not connected yet");
}

// Indian numbers: 10 digits (or 0/91 prefixed) -> 91XXXXXXXXXX. Anything else is rejected.
const waNumber = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d[0] === "0") return `91${d.slice(1)}`;
  return d.length === 12 && d.startsWith("91") ? d : "";
};

async function sendTemplate({ tenantId, key, to, vars = {}, ref }) {
  const log = (status, reason = "") =>
    MessageLog.create({
      tenantId,
      template: key,
      to,
      vars,
      status,
      reason,
      ref,
    }).then(() => ({ sent: status === "sent", status, reason }));
  try {
    const template = BY_KEY[key];
    if (!template)
      return { sent: false, status: "skipped", reason: "Unknown template" };
    const t = await Tenant.findById(tenantId).select("whatsapp");
    if (!t?.whatsapp?.enabled)
      return {
        sent: false,
        status: "skipped",
        reason: "WhatsApp messages are switched off in Settings",
      };
    if ((t.whatsapp.disabledTemplates || []).includes(key))
      return {
        sent: false,
        status: "skipped",
        reason: "This message is switched off in Settings",
      };
    const num = waNumber(to);
    if (!num) return log("skipped", "Patient has no valid mobile number");
    if (!isConnected())
      return log("not_connected", "WhatsApp API is not connected yet");
    await deliver({ to: num, template, vars });
    return log("sent");
  } catch (err) {
    return log("failed", String(err.message || err).slice(0, 200)).catch(
      () => ({ sent: false, status: "failed", reason: err.message }),
    );
  }
}

const when = (d) => ({
  date: new Date(d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }),
  time: new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }),
});
const docName = (d) =>
  d
    ? `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(" ")}`
    : "your doctor";
const personName = (p) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "there";

// Message about an appointment (confirmed / reminder / cancelled / video link). Fire-and-forget safe.
async function notifyAppointment(key, appointmentId) {
  try {
    const Appointment = require("../models/Appointment");
    const a = await Appointment.findById(appointmentId)
      .select("+videoRoom")
      .populate("patientId", "firstName lastName contact.phone")
      .populate("doctorId", "firstName lastName");
    if (!a?.patientId)
      return {
        sent: false,
        status: "skipped",
        reason: "Appointment not found",
      };
    const t = await Tenant.findById(a.tenantId).select("name branding.appName");
    const vars = {
      patient: personName(a.patientId),
      doctor: docName(a.doctorId),
      ...when(a.scheduledAt),
      clinic: t?.branding?.appName || t?.name || "the clinic",
    };
    if (key === "video_consult_link")
      vars.link = require("./video").linkFor(a.videoRoom);
    return await sendTemplate({
      tenantId: a.tenantId,
      key,
      to: a.patientId.contact?.phone,
      vars,
      ref: { kind: "appointment", id: a._id },
    });
  } catch (err) {
    return { sent: false, status: "failed", reason: err.message };
  }
}

// Message to a patient about something that is not an appointment (payment, prescription, lab report...).
async function notifyPatient({
  tenantId,
  patientId,
  key,
  doctorId,
  extra = {},
  ref,
}) {
  try {
    const Patient = require("../models/Patient");
    const p = await Patient.findOne({ _id: patientId, tenantId }).select(
      "firstName lastName contact.phone",
    );
    if (!p)
      return { sent: false, status: "skipped", reason: "Patient not found" };
    const t = await Tenant.findById(tenantId).select("name branding.appName");
    let doctor = "your doctor";
    if (doctorId)
      doctor = docName(
        await require("../models/Doctor")
          .findById(doctorId)
          .select("firstName lastName"),
      );
    const vars = {
      patient: personName(p),
      doctor,
      clinic: t?.branding?.appName || t?.name || "the clinic",
      ...extra,
    };
    return await sendTemplate({
      tenantId,
      key,
      to: p.contact?.phone,
      vars,
      ref,
    });
  } catch (err) {
    return { sent: false, status: "failed", reason: err.message };
  }
}

module.exports = {
  sendTemplate,
  notifyAppointment,
  notifyPatient,
  isConnected,
  waNumber,
  params,
  when,
  docName,
  personName,
};
