// Slot generation for a doctor on one calendar day.
// ponytail: clinic-local time is fixed to IST (+05:30, no DST). Per-tenant timezone
// support = swap IST for Tenant.contact.timezone via Intl when a non-India tenant exists.
const IST = "+05:30";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MIN = 60 * 1000;

const istDateString = (d) =>
  new Date(d.getTime() + 330 * MIN).toISOString().slice(0, 10);
const dayStart = (dateStr) => new Date(`${dateStr}T00:00:00${IST}`);
const toDate = (dateStr, hhmm) => new Date(`${dateStr}T${hhmm}:00${IST}`);
const isDateStr = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(dayStart(s));

// booked: [{ start: Date, end: Date }]. Returns [{ start: Date, end: Date }] free slots.
function generateSlots(doctor, dateStr, booked = [], now = new Date()) {
  if ((doctor.leaveDates || []).includes(dateStr)) return [];
  const step = (doctor.consultation?.appointmentDurationMinutes || 15) * MIN;
  const dayKey = DAYS[new Date(`${dateStr}T12:00:00${IST}`).getUTCDay()];
  const out = [];
  for (const w of (doctor.availability || []).filter((a) => a.day === dayKey)) {
    const end = toDate(dateStr, w.endTime).getTime();
    for (
      let t = toDate(dateStr, w.startTime).getTime();
      t + step <= end;
      t += step
    ) {
      const s = new Date(t);
      const e = new Date(t + step);
      const clash = booked.some((b) => s < b.end && e > b.start);
      if (!clash && s > now) out.push({ start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

module.exports = { generateSlots, istDateString, dayStart, isDateStr, IST };

if (require.main === module) {
  const assert = require("assert");
  const doc = {
    consultation: { appointmentDurationMinutes: 30 },
    availability: [{ day: "mon", startTime: "10:00", endTime: "12:00" }],
    leaveDates: ["2026-11-09"],
  };
  const past = new Date("2026-01-01T00:00:00Z");
  // 2026-11-02 is a Monday
  const all = generateSlots(doc, "2026-11-02", [], past);
  assert.strictEqual(all.length, 4);
  assert.strictEqual(all[0].start.toISOString(), "2026-11-02T04:30:00.000Z");
  const one = generateSlots(
    doc,
    "2026-11-02",
    [{ start: all[1].start, end: all[1].end }],
    past,
  );
  assert.strictEqual(one.length, 3);
  assert.strictEqual(generateSlots(doc, "2026-11-09", [], past).length, 0); // leave
  assert.strictEqual(generateSlots(doc, "2026-11-03", [], past).length, 0); // Tuesday
  assert.strictEqual(
    generateSlots(doc, "2026-11-02", [], all[3].start).length,
    0,
  ); // all in the past
  assert.strictEqual(
    istDateString(new Date("2026-11-02T20:00:00Z")),
    "2026-11-03",
  );
  assert.ok(
    isDateStr("2026-11-02") && !isDateStr("2026-13-40") && !isDateStr("x"),
  );
  console.log("slots ok");
}
