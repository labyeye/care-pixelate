// WhatsApp template registry. `name` is the template name to create/approve in Meta Business Manager; {{vars}} are
// filled by name here and sent in `vars` order. Edit wording here, then re-submit the template to Meta.
const T = (key, o) => ({ key, language: "en", category: "UTILITY", ...o });

const TEMPLATES = [
  T("appointment_confirmed", {
    name: "nc_appointment_confirmed",
    title: "Appointment confirmed",
    trigger: "When an appointment is booked (reception or patient app)",
    vars: ["patient", "doctor", "date", "time", "clinic"],
    body: "Hi {{patient}}, your appointment with {{doctor}} is confirmed for {{date}} at {{time}}. - {{clinic}}",
  }),
  T("appointment_reminder", {
    name: "nc_appointment_reminder",
    title: "Appointment reminder",
    trigger: "About 24 hours before the appointment",
    vars: ["patient", "doctor", "date", "time", "clinic"],
    body: "Reminder: {{patient}}, you have an appointment with {{doctor}} on {{date}} at {{time}}. Reply to this chat if you need to reschedule. - {{clinic}}",
  }),
  T("appointment_cancelled", {
    name: "nc_appointment_cancelled",
    title: "Appointment cancelled",
    trigger: "When an appointment is cancelled",
    vars: ["patient", "doctor", "date", "time", "clinic"],
    body: "Hi {{patient}}, your appointment with {{doctor}} on {{date}} at {{time}} has been cancelled. Please contact us to book a new slot. - {{clinic}}",
  }),
  T("followup_reminder", {
    name: "nc_followup_reminder",
    title: "Follow-up reminder",
    trigger:
      "Day before the follow-up date set in the consultation, or from the Follow-ups page",
    vars: ["patient", "doctor", "date", "clinic"],
    body: "Hi {{patient}}, {{doctor}} has advised a follow-up visit on {{date}}. Please book a slot with us. - {{clinic}}",
  }),
  T("payment_receipt", {
    name: "nc_payment_receipt",
    title: "Payment received",
    trigger: "When a fee is paid online",
    vars: ["patient", "amount", "reference", "clinic"],
    body: "Hi {{patient}}, we received Rs. {{amount}} (ref {{reference}}). Thank you. - {{clinic}}",
  }),
  T("invoice_due", {
    name: "nc_invoice_due",
    title: "Payment due",
    trigger: "Manually, for unpaid invoices",
    vars: ["patient", "amount", "invoice", "due", "clinic"],
    body: "Hi {{patient}}, Rs. {{amount}} is pending on invoice {{invoice}} (due {{due}}). Kindly pay at the clinic or online. - {{clinic}}",
  }),
  T("prescription_ready", {
    name: "nc_prescription_ready",
    title: "Prescription ready",
    trigger: "When the doctor signs a consultation",
    vars: ["patient", "doctor", "clinic"],
    body: "Hi {{patient}}, your prescription from {{doctor}} is ready. You can view it in the {{clinic}} app under Prescriptions.",
  }),
  T("lab_report_ready", {
    name: "nc_lab_report_ready",
    title: "Lab report ready",
    trigger: "When a lab order is resulted",
    vars: ["patient", "order", "clinic"],
    body: "Hi {{patient}}, your lab report {{order}} is ready. View it in the {{clinic}} app or collect it at the clinic.",
  }),
  T("video_consult_link", {
    name: "nc_video_link",
    title: "Video consult link",
    trigger: "For video appointments, shortly before the visit",
    vars: ["patient", "doctor", "date", "time", "link"],
    body: "Hi {{patient}}, join your video consult with {{doctor}} on {{date}} at {{time}}: {{link}}",
  }),
  T("birthday_wish", {
    name: "nc_birthday_wish",
    title: "Birthday wish",
    category: "MARKETING",
    trigger: "On the patient's birthday (needs marketing consent)",
    vars: ["patient", "clinic"],
    body: "Happy birthday {{patient}}! Wishing you good health from all of us at {{clinic}}.",
  }),
];

const BY_KEY = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]));
const strip = (v) =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 200); // Meta rejects newlines in variables

const render = (key, vars = {}) =>
  BY_KEY[key].body.replace(/\{\{(\w+)\}\}/g, (_, k) => strip(vars[k]));
// Meta wants positional parameters in template order.
const params = (key, vars = {}) => BY_KEY[key].vars.map((k) => strip(vars[k]));

module.exports = { TEMPLATES, BY_KEY, render, params };

if (require.main === module) {
  const assert = require("assert");
  for (const t of TEMPLATES) {
    const used = [...t.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    assert.deepStrictEqual(
      [...new Set(used)].sort(),
      [...t.vars].sort(),
      `${t.key}: body variables must match vars`,
    );
    assert.match(
      t.name,
      /^[a-z0-9_]+$/,
      `${t.key}: Meta template names are lowercase_with_underscores`,
    );
  }
  assert.strictEqual(
    new Set(TEMPLATES.map((t) => t.name)).size,
    TEMPLATES.length,
    "unique Meta names",
  );
  assert.strictEqual(
    render("payment_receipt", {
      patient: "Asha\nV",
      amount: 500,
      reference: "pay_1",
      clinic: "NC",
    }),
    "Hi Asha V, we received Rs. 500 (ref pay_1). Thank you. - NC",
  );
  assert.deepStrictEqual(
    params("birthday_wish", { patient: "A", clinic: "C" }),
    ["A", "C"],
  );
  console.log("whatsappTemplates ok");
}
