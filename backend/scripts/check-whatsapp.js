// Offline check: WhatsApp gating + logging, follow-up status, patient import, timeline summary (models stubbed).
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

const logs = [];
let wa = { enabled: true, disabledTemplates: [] };
stub("models/Tenant.js", {
  findById: () => ({ select: async () => ({ name: "NC", whatsapp: wa }) }),
});
stub("models/MessageLog.js", { create: async (d) => logs.push(d) });
stub("models/Patient.js", {
  findOne: () => ({
    select: async () => ({
      firstName: "Asha",
      lastName: "V",
      contact: { phone: "9876543210" },
    }),
  }),
});
stub("models/Doctor.js", {
  findById: () => ({
    select: async () => ({ firstName: "Raj", lastName: "K" }),
  }),
});

const { sendTemplate, notifyPatient, waNumber } = require("../utils/whatsapp");

(async () => {
  assert.strictEqual(waNumber("98765 43210"), "919876543210");
  assert.strictEqual(waNumber("+91 98765-43210"), "919876543210");
  assert.strictEqual(waNumber("12345"), "");

  // switched off in Settings: no log row, nothing sent
  wa = { enabled: false, disabledTemplates: [] };
  let r = await sendTemplate({
    tenantId: "t",
    key: "appointment_confirmed",
    to: "9876543210",
    vars: {},
  });
  assert.deepStrictEqual(
    [r.sent, r.status, logs.length],
    [false, "skipped", 0],
  );

  // one template off
  wa = { enabled: true, disabledTemplates: ["payment_receipt"] };
  r = await sendTemplate({
    tenantId: "t",
    key: "payment_receipt",
    to: "9876543210",
    vars: {},
  });
  assert.strictEqual(r.status, "skipped");

  // bad number is logged as skipped
  r = await sendTemplate({
    tenantId: "t",
    key: "appointment_confirmed",
    to: "123",
    vars: {},
  });
  assert.strictEqual(logs.at(-1).status, "skipped");

  // API not connected: logged, never sent
  r = await notifyPatient({
    tenantId: "t",
    patientId: "p",
    doctorId: "d",
    key: "prescription_ready",
  });
  assert.deepStrictEqual([r.sent, r.status], [false, "not_connected"]);
  assert.strictEqual(logs.at(-1).vars.patient, "Asha V");
  assert.strictEqual(logs.at(-1).vars.doctor, "Dr. Raj K");
  assert.strictEqual(
    (await sendTemplate({ tenantId: "t", key: "nope", to: "9876543210" }))
      .status,
    "skipped",
  );
  console.log("whatsapp ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
