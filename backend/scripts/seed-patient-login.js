// Gives an EXISTING patient record a portal login so the patient dashboard can be tried with real data.
//   node scripts/seed-patient-login.js <owner-email> <patient-email> <password>     create / link the login
//   node scripts/seed-patient-login.js <owner-email> <patient-email> --remove        delete the login, unlink the profile
// <patient-email> must match a patient's contact email in the owner's clinic (e.g. karthik.rao@example.com).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const Patient = require("../models/Patient");

const [ownerEmail, patientEmail, arg] = process.argv.slice(2).map((s) => (s || "").trim());
if (!ownerEmail || !patientEmail || !arg) {
  console.error("Usage: node scripts/seed-patient-login.js <owner-email> <patient-email> <password | --remove>");
  process.exit(1);
}
const remove = arg === "--remove";
if (!remove && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(arg)) {
  console.error("Password must be 8+ characters with uppercase, lowercase and a number");
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const owner = await User.findOne({ email: ownerEmail.toLowerCase(), role: { $in: ["tenant_owner", "hospital_admin"] } });
  if (!owner) throw new Error(`No tenant owner/admin found for ${ownerEmail}`);
  const tenantId = owner.tenantId;
  const patient = await Patient.findOne({ tenantId, "contact.email": patientEmail.toLowerCase() });
  if (!patient) throw new Error(`No patient with contact email ${patientEmail} in this clinic`);

  if (remove) {
    if (patient.userId) await User.deleteOne({ _id: patient.userId, role: "patient" });
    await Patient.updateOne({ _id: patient._id }, { $unset: { userId: 1 } });
    console.log(`Removed the portal login of ${patient.name}`);
    return;
  }
  if (patient.userId) throw new Error(`${patient.name} already has a login`);
  if (await User.findOne({ email: patientEmail.toLowerCase() })) throw new Error("A user with that email already exists");

  const user = await User.create({
    name: patient.name, email: patientEmail.toLowerCase(), password: arg, role: "patient",
    phone: String(patient.contact?.phone || "").replace(/\D/g, "").slice(-10), tenantId,
  });
  await Patient.updateOne({ _id: patient._id }, { $set: { userId: user._id } });
  console.log(`Created login ${user.email} for ${patient.name} (${patient.patientId}) — sign in at /login`);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
