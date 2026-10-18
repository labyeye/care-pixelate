// Offline check of slot-guarded booking + allergy warnings (models stubbed; never touches Mongo).
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

// 2026-11-02 is a Monday; doctor works 10:00-11:00 IST in 30 min slots.
const DAYSTR = "2026-11-02";
const doctor = {
  _id: "d1",
  accountStatus: "active",
  consultation: {
    appointmentDurationMinutes: 30,
    consultationFee: 500,
    consultationModes: ["in_person"],
  },
  leaveDates: [],
  availability: [{ day: "mon", startTime: "10:00", endTime: "11:00" }],
};
const booked = [];
const created = [];

stub("models/Patient.js", {
  exists: async (q) => (q._id === "p1" ? { _id: "p1" } : null),
});
stub("models/Doctor.js", {
  findOne: async (q) => (q._id === "d1" ? doctor : null),
});
stub("models/Appointment.js", {
  find: () => ({ select: async () => booked }),
  countDocuments: async () => 2,
  create: async (d) => {
    created.push(d);
    return d;
  },
});
// In-memory stand-in for the slot-lock collection (unique doctorId+grain), so overlap logic is exercised offline.
const locks = [];
stub("models/AppointmentSlotLock.js", {
  find: (q) => ({
    select: async () =>
      locks.filter(
        (l) =>
          l.doctorId === q.doctorId &&
          String(l.appointmentId) === String(q.appointmentId),
      ),
  }),
  insertMany: async (docs) => {
    for (const d of docs)
      if (locks.some((l) => l.doctorId === d.doctorId && l.grain === d.grain)) {
        const e = new Error("dup");
        e.code = 11000;
        throw e;
      }
    locks.push(...docs);
  },
  deleteMany: async (q) => {
    for (let i = locks.length - 1; i >= 0; i--) {
      const l = locks[i];
      const byAppt =
        q.appointmentId !== undefined &&
        String(l.appointmentId) === String(q.appointmentId);
      const byGrain =
        q.grain &&
        q.grain.$in &&
        q.grain.$in.includes(l.grain) &&
        l.doctorId === q.doctorId &&
        String(l.appointmentId) === String(q.appointmentId);
      if (q.grain ? byGrain : byAppt) locks.splice(i, 1);
    }
  },
});
const slotLock = require("../utils/slotLock");
const A = require("../controllers/appointmentController");
const { allergyWarnings } = require("../controllers/consultationController");

const call = async (fn, body) => {
  const res = {
    code: 200,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  try {
    await fn({ body, tenantId: "t1", params: {}, query: {} }, res, (e) => {
      throw e;
    });
  } catch (e) {
    res.err = e.message;
  }
  return res;
};
const at = (hhmmIst) => new Date(`${DAYSTR}T${hhmmIst}:00+05:30`).toISOString();

(async () => {
  const realNow = Date;
  // freeze "now" before the booking day so slots aren't in the past
  global.Date = class extends realNow {
    constructor(...a) {
      a.length ? super(...a) : super("2026-10-20T00:00:00Z");
    }
    static now() {
      return new realNow("2026-10-20T00:00:00Z").getTime();
    }
  };

  let r = await call(A.create, {
    patientId: "p1",
    doctorId: "d1",
    scheduledAt: at("10:00"),
  });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(created[0].fee, 500);
  assert.strictEqual(
    created[0].endsAt.toISOString(),
    new realNow(at("10:30")).toISOString(),
  );

  r = await call(A.create, {
    patientId: "p1",
    doctorId: "d1",
    scheduledAt: at("09:00"),
  });
  assert.strictEqual(r.code, 409); // outside working hours

  booked.push({
    scheduledAt: new realNow(at("10:00")),
    endsAt: new realNow(at("10:30")),
  });
  r = await call(A.create, {
    patientId: "p1",
    doctorId: "d1",
    scheduledAt: at("10:00"),
  });
  assert.strictEqual(r.code, 409); // already taken

  r = await call(A.create, {
    patientId: "nope",
    doctorId: "d1",
    scheduledAt: at("10:30"),
  });
  assert.strictEqual(r.code, 400); // patient not in this tenant

  r = await call(A.create, {
    patientId: "p1",
    doctorId: "d1",
    type: "video",
    scheduledAt: at("10:30"),
  });
  assert.strictEqual(r.code, 400); // doctor has no online consult

  r = await call(A.create, {
    patientId: "p1",
    doctorId: "d1",
    type: "walk_in",
  });
  assert.strictEqual(r.code, 201, r.err);
  assert.strictEqual(created[created.length - 1].tokenNo, 3);

  global.Date = realNow;

  // Overlap guard: 10:00-10:30 is held, so a different start time inside it must be refused,
  // while the adjacent 10:30 slot and another doctor's 10:15 are fine.
  assert.ok(locks.length >= 6, "the 10:00 booking holds six 5-minute grains");
  const overlap = (doctorId, start, end) =>
    slotLock.acquire({
      tenantId: "t1",
      doctorId,
      appointmentId: `x-${start}-${doctorId}`,
      start: new realNow(at(start)),
      end: new realNow(at(end)),
    });
  await assert.rejects(
    () => overlap("d1", "10:15", "10:45"),
    /overlaps another appointment/,
  );
  await overlap("d1", "10:30", "11:00"); // back-to-back is allowed
  await overlap("d2", "10:15", "10:45"); // different doctor is independent
  const before = locks.length;
  await assert.rejects(() => overlap("d1", "10:25", "10:35"), /overlaps/); // clips two held windows
  assert.strictEqual(
    locks.length,
    before,
    "a refused booking leaves no partial locks behind",
  );
  const created0 = created[0]._id;
  await slotLock.release(created0);
  await overlap("d1", "10:15", "10:30"); // freed once the first appointment is cancelled/completed

  assert.deepStrictEqual(
    allergyWarnings({ medicalSummary: { allergies: ["Penicillin"] } }, [
      { drug: "Penicillin V 250" },
      { drug: "Paracetamol" },
    ]).length,
    1,
  );
  console.log("appointments ok");
})();
