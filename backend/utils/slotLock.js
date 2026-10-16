const AppointmentSlotLock = require("../models/AppointmentSlotLock");

const GRAIN_MS = 5 * 60 * 1000;

/** Epoch-grain numbers covered by [start, end). */
const grainsFor = (start, end) => {
  const a = Math.floor(new Date(start).getTime() / GRAIN_MS);
  const b = Math.ceil(new Date(end).getTime() / GRAIN_MS); // exclusive
  const out = [];
  for (let g = a; g < Math.max(b, a + 1); g++) out.push(g);
  return out;
};

class SlotConflict extends Error {
  constructor() {
    super("That time overlaps another appointment for this doctor");
    this.status = 409;
  }
}

/**
 * Claim every grain of [start,end) for this appointment. Throws SlotConflict (and leaves nothing
 * behind) if any grain already belongs to a different appointment. Safe to call again for the same
 * appointment with a new window (reschedule): grains it already owns are kept.
 */
async function acquire({ tenantId, doctorId, appointmentId, start, end }) {
  const want = grainsFor(start, end);
  const mine = (await AppointmentSlotLock.find({ doctorId, appointmentId }).select("grain")).map((l) => l.grain);
  const have = new Set(mine);
  const fresh = want.filter((g) => !have.has(g));
  if (fresh.length) {
    try {
      await AppointmentSlotLock.insertMany(
        fresh.map((grain) => ({ tenantId, doctorId, appointmentId, grain })),
        { ordered: false },
      );
    } catch (err) {
      // Some inserts may have succeeded before the duplicate — remove exactly those (they are ours), then report.
      await AppointmentSlotLock.deleteMany({ doctorId, appointmentId, grain: { $in: fresh } });
      if (err && (err.code === 11000 || (err.writeErrors || []).some((w) => w.code === 11000))) throw new SlotConflict();
      throw err;
    }
  }
  // Drop grains of the old window that the new window no longer covers.
  const stale = mine.filter((g) => !want.includes(g));
  if (stale.length) await AppointmentSlotLock.deleteMany({ doctorId, appointmentId, grain: { $in: stale } });
}

/** Free everything this appointment holds (cancelled / completed / no-show / deleted). */
const release = (appointmentId) => AppointmentSlotLock.deleteMany({ appointmentId });

module.exports = { acquire, release, grainsFor, SlotConflict, GRAIN_MS };
