// Offline check of patient-portal ownership + validation (models stubbed; never touches Mongo).
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

const OWN = { _id: "p1", userId: "u1", tenantId: "t1" };
const made = { vital: [], record: [], reminder: [] };
const chain = (v) => ({
  sort: () => chain(v),
  select: async () => v,
  then: (r) => r(v),
});

stub("models/Patient.js", {
  findOne: (f) =>
    chain(f.userId === "u1" && (!f._id || f._id === "p1") ? OWN : null),
  find: () => chain([OWN]),
  countDocuments: async () => 0,
});
stub("models/Doctor.js", {});
stub("models/Appointment.js", { findOneAndUpdate: async () => null });
stub("models/Consultation.js", {});
stub("models/Tenant.js", {});
stub("models/PatientData.js", {
  Vital: { create: async (d) => (made.vital.push(d), d) },
  MedicineReminder: { create: async (d) => (made.reminder.push(d), d) },
  MedicalRecord: {
    create: async (d) => (made.record.push(d), { toObject: () => d }),
  },
});
stub("controllers/appointmentController.js", {
  prepare: async () => {},
  freeSlots: async () => [],
});

const c = require("../controllers/patientPortalController");
const call = async (fn, body = {}, params = {}) => {
  const res = {
    code: 200,
    status(x) {
      this.code = x;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  const req = { user: { _id: "u1", tenantId: "t1" }, body, params, query: {} };
  try {
    await fn(req, res, (e) => {
      throw e;
    });
  } catch (e) {
    res.err = e.message;
  }
  return res;
};

(async () => {
  let r = await call(c.addVital, { type: "bp", value: 120, value2: 80 });
  assert.strictEqual(r.code, 201);
  assert.strictEqual(made.vital[0].patientId, "p1");

  r = await call(c.addVital, {
    patientId: "someone-else",
    type: "bp",
    value: 1,
  });
  assert.strictEqual(r.code, 404); // not an owned profile

  r = await call(c.addReminder, { drug: "Met", times: ["25:99"] });
  assert.strictEqual(r.code, 400);
  r = await call(c.addReminder, { drug: "Met", times: ["08:00", "20:30"] });
  assert.strictEqual(r.code, 201);

  r = await call(c.uploadRecord, {
    title: "x",
    mimeType: "text/html",
    dataBase64: "aGk=",
  });
  assert.strictEqual(r.code, 400); // type not allowed
  r = await call(c.uploadRecord, {
    title: "x",
    mimeType: "application/pdf",
    dataBase64: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64"),
  });
  assert.strictEqual(r.code, 400); // too big
  r = await call(c.uploadRecord, {
    title: "Blood test",
    mimeType: "application/pdf",
    dataBase64: Buffer.from("%PDF-1").toString("base64"),
  });
  assert.strictEqual(r.code, 201);
  assert.ok(
    !("data" in r.body.data),
    "file bytes are never echoed in the list/upload response",
  );

  r = await call(c.cancel, {}, { id: "a1" });
  assert.strictEqual(r.code, 404); // nothing matching to cancel
  console.log("portal ok");
})();
