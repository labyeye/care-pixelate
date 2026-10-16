// Serves profile photos as real images so lists, reports and tables can use plain <img src> and the browser
// caches each person once, instead of every JSON row carrying a base64 blob.
const asyncHandler = require("express-async-handler");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const StaffProfile = require("../models/StaffProfile");

const DATA_URL = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/;

// Returns { type, buffer } for a stored data URL, or null for anything else (never trusts other schemes).
const decodeImage = (value) => {
  const m = DATA_URL.exec(String(value || ""));
  if (!m) return null;
  const buffer = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) return null;
  return { type: m[1] === "image/jpg" ? "image/jpeg" : m[1], buffer };
};

const FINDERS = {
  patient: (tenantId, id) => Patient.findOne({ _id: id, tenantId }).select("profileImage"),
  doctor: (tenantId, id) => Doctor.findOne({ _id: id, tenantId }).select("profileImage"),
  // staff are addressed by their login (User) id, which is what the staff list and audit log carry
  staff: (tenantId, id) => StaffProfile.findOne({ userId: id, tenantId }).select("profileImage"),
};

const photo = asyncHandler(async (req, res) => {
  const find = FINDERS[req.params.kind];
  if (!find || !/^[0-9a-f]{24}$/i.test(req.params.id)) {
    res.status(404);
    throw new Error("Not found");
  }
  const doc = await find(req.tenantId, req.params.id);
  const img = doc && decodeImage(doc.profileImage);
  if (!img) {
    res.status(404);
    throw new Error("No photo");
  }
  res.set({
    "Content-Type": img.type,
    "Content-Length": img.buffer.length,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'", // an image response never needs to run anything
  });
  res.send(img.buffer);
});

module.exports = { photo, decodeImage };

if (require.main === module) {
  const assert = require("assert");
  const ok = decodeImage("data:image/png;base64,iVBORw0KGgo=");
  assert.strictEqual(ok.type, "image/png");
  assert.ok(ok.buffer.length > 0);
  assert.strictEqual(decodeImage("data:image/svg+xml;base64,PHN2Zz4="), null, "svg can carry script: refused");
  assert.strictEqual(decodeImage("data:text/html;base64,PGgxPg=="), null);
  assert.strictEqual(decodeImage("https://evil.example/x.png"), null);
  assert.strictEqual(decodeImage(""), null);
  assert.strictEqual(decodeImage("data:image/jpg;base64,/9j/4AAQ").type, "image/jpeg");
  console.log("photo ok");
}
