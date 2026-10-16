// Gives every EXISTING sample patient (MED "SMP-P###" records) of one clinic a portal login, so the patient
// dashboard can be tried. Password is the same one the sample staff use.
//   node scripts/seed-patient-logins.js labh@hospital.com            create (idempotent)
//   node scripts/seed-patient-logins.js labh@hospital.com --remove   delete these logins, unlink the profiles
// Login email = the patient's contact email. Only touches patients whose patientId starts with SMP-P.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const Patient = require("../models/Patient");

const SAMPLE_PASSWORD = "Sample@1234";
const ownerEmail = (process.argv[2] || "").toLowerCase().trim();
const remove = process.argv.includes("--remove");
if (!ownerEmail.includes("@")) {
  console.error("Usage: node scripts/seed-patient-logins.js <owner-email> [--remove]");
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const owner = await User.findOne({ email: ownerEmail, role: { $in: ["tenant_owner", "hospital_admin"] } });
  if (!owner) throw new Error(`No tenant owner/admin found for ${ownerEmail}`);
  const patients = await Patient.find({ tenantId: owner.tenantId, patientId: /^SMP-P/ });

  let n = 0;
  for (const p of patients) {
    const email = String(p.contact?.email || "").toLowerCase();
    if (remove) {
      if (p.userId) {
        await User.deleteOne({ _id: p.userId, role: "patient", tenantId: owner.tenantId });
        await Patient.updateOne({ _id: p._id }, { $unset: { userId: 1 } });
        n++;
      }
      continue;
    }
    if (p.userId || !email) continue;
    if (await User.exists({ email })) {
      console.log(`skip ${p.name}: ${email} already has a user`);
      continue;
    }
    const user = await User.create({
      name: p.name, email, password: SAMPLE_PASSWORD, role: "patient", tenantId: owner.tenantId,
      phone: String(p.contact?.phone || "").replace(/\D/g, "").slice(-10),
    });
    await Patient.updateOne({ _id: p._id }, { $set: { userId: user._id } });
    n++;
  }
  console.log(remove ? `Removed ${n} patient logins` : `Created ${n} patient logins (password ${SAMPLE_PASSWORD})`);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
