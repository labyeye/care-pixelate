const crypto = require("crypto");
const User = require("../models/User");
const { sendSecurityAlertEmail } = require("./notify");

const MAX_DEVICES = 10;

function describe(ua = "") {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os && `on ${os}`].filter(Boolean).join(" ") || "Unknown device";
}

// Records the sign-in (lastLogin) and emails the user when it comes from a device we haven't seen before.
// The very first device never alerts. Best effort: never blocks the login.
async function noteSignIn(req, user) {
  try {
    const name = String(req.headers["x-device-name"] || "").slice(0, 80) || describe(req.headers["user-agent"]);
    const hash = crypto.createHash("sha256").update(`${name}|${req.headers["x-device-platform"] || "web"}`).digest("hex").slice(0, 24);
    const cur = await User.findById(user._id).select("+knownDevices");
    const devices = cur?.knownDevices || [];
    const known = devices.some((d) => d.hash === hash);
    const update = { $set: { lastLogin: new Date() } };
    if (!known) update.$push = { knownDevices: { $each: [{ hash, name, at: new Date() }], $slice: -MAX_DEVICES } };
    await User.updateOne({ _id: user._id }, update);
    if (!known && devices.length)
      sendSecurityAlertEmail({ to: user.email, name: user.name, what: `New sign-in to your NestDoc account from ${name}, IP ${req.ip || "unknown"}.` }).catch(() => {});
  } catch {
    /* ignore */
  }
}

module.exports = { noteSignIn };
