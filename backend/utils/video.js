const crypto = require("crypto");

// ponytail: video uses a Jitsi room (JITSI_DOMAIN, default the public meet.jit.si) with an unguessable
// name, gated by an appointment-time window. Self-host Jitsi (+ JWT auth) when you need moderation/recording.
const newRoom = () => `NestCare-${crypto.randomBytes(16).toString("hex")}`;

const linkFor = (room) =>
  `https://${process.env.JITSI_DOMAIN || "meet.jit.si"}/${room}`;

const EARLY_MS = 15 * 60 * 1000;
const LATE_MS = 30 * 60 * 1000;

// Joinable from 15 min before the slot until 30 min after it ends, for a live scheduled appointment.
function joinWindow(appt, now = new Date()) {
  if (appt.status !== "scheduled" || appt.type !== "video" || !appt.videoRoom)
    return { ok: false, reason: "No active video consult" };
  const start = new Date(appt.scheduledAt).getTime();
  const end = new Date(appt.endsAt || start + 15 * 60 * 1000).getTime();
  const t = now.getTime();
  if (t < start - EARLY_MS)
    return {
      ok: false,
      reason: "The call opens 15 minutes before your appointment",
    };
  if (t > end + LATE_MS) return { ok: false, reason: "This consult has ended" };
  return { ok: true };
}

module.exports = { newRoom, linkFor, joinWindow };

if (require.main === module) {
  const assert = require("assert");
  const a = {
    status: "scheduled",
    type: "video",
    videoRoom: "r",
    scheduledAt: new Date("2026-11-02T10:00:00Z"),
    endsAt: new Date("2026-11-02T10:30:00Z"),
  };
  assert.ok(!joinWindow(a, new Date("2026-11-02T09:40:00Z")).ok);
  assert.ok(joinWindow(a, new Date("2026-11-02T09:50:00Z")).ok);
  assert.ok(joinWindow(a, new Date("2026-11-02T10:59:00Z")).ok);
  assert.ok(!joinWindow(a, new Date("2026-11-02T11:01:00Z")).ok);
  assert.ok(
    !joinWindow({ ...a, status: "cancelled" }, new Date("2026-11-02T10:00:00Z"))
      .ok,
  );
  assert.ok(
    !joinWindow({ ...a, type: "in_clinic" }, new Date("2026-11-02T10:00:00Z"))
      .ok,
  );
  assert.match(newRoom(), /^NestCare-[0-9a-f]{32}$/);
  console.log("video ok");
}
