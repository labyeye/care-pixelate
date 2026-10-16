// Gives an existing Doctor profile a login (role "doctor") and links it via Doctor.userId.
//   node scripts/create-doctor-login.js <owner-email> <doctor-first-name> <login-email> <password>
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const Doctor = require("../models/Doctor");

const [ownerEmail, first, loginEmail, password] = process.argv.slice(2);
if (!password) {
  console.error("Usage: node scripts/create-doctor-login.js <owner-email> <doctor-first-name> <login-email> <password>");
  process.exit(1);
}
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const owner = await User.findOne({ email: ownerEmail.toLowerCase(), role: { $in: ["tenant_owner", "hospital_admin"] } });
  if (!owner) throw new Error("Owner not found");
  const doc = await Doctor.findOne({ tenantId: owner.tenantId, firstName: new RegExp(`^${first}$`, "i") });
  if (!doc) throw new Error(`No doctor named ${first} in this tenant`);
  if (doc.userId) throw new Error("That doctor already has a login linked");
  if (await User.exists({ email: loginEmail.toLowerCase() })) throw new Error("A user with that email already exists");
  const user = await User.create({
    name: doc.name, email: loginEmail, password, role: "doctor", status: "active",
    phone: String(doc.contact?.phone || "").replace(/\D/g, "").slice(-10) || undefined, tenantId: owner.tenantId,
  });
  doc.userId = user._id;
  await doc.save();
  console.log(`Created login ${user.email} for Dr. ${doc.name} and linked it to the doctor profile`);
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
