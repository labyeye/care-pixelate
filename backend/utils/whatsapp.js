// Sends WhatsApp template messages for a clinic. Best-effort: never throws into the caller (a failed reminder
// must not fail a booking). Every attempt is written to MessageLog so the clinic can see what went out.
//
// THE API IS NOT CONNECTED YET. Until deliver() is implemented, every send is logged as "not_connected"
// and nothing leaves the server. To go live: implement deliver() below (templates are in whatsappTemplates.js,
// use params(key, vars) for the positional values) and return true from isConnected().
const Tenant = require("../models/Tenant");
const MessageLog = require("../models/MessageLog");
const { BY_KEY, params } = require("./whatsappTemplates");
const credits = require("./credits");

// The Meta call lives behind `driver` so a check can swap it; production uses the defaults below.
// Same platform number as the login OTP (WHATSAPP_PLATFORM_*), so no extra setup beyond approving the nc_* templates in Meta.
const WA_API = "https://graph.facebook.com/v20.0";
const driver = {
  isConnected: () =>
    !!(process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN && process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID),
  async deliver({ to, template, vars }) {
    const res = await fetch(`${WA_API}/${process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || template.language },
          components: [
            { type: "body", parameters: params(template.key, vars).map((text) => ({ type: "text", text })) },
          ],
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "WhatsApp API error");
    return { id: data?.messages?.[0]?.id };
  },
};
const isConnected = () => driver.isConnected();

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
    // WhatsApp credits: a metered clinic pays per message, charged before sending and refunded if the send fails.
    const hold = await credits.reserve(tenantId, { kind: key, phone: num });
    if (!hold.ok)
      return {
        ...(await log("skipped", hold.reason === "daily_cap" ? "Daily message limit reached" : "Not enough WhatsApp credits")),
        code: "NO_CREDITS",
      };
    let delivered;
    try {
      delivered = await driver.deliver({ to: num, template, vars });
    } catch (err) {
      await credits.refund(hold);
      throw err;
    }
    await credits.commit(hold, delivered?.id);
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
  _driver: driver, // for checks only
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
