// One-off: converts legacy Patient docs (name/dob/phone/uhid/...) to the current schema.
// Idempotent and non-destructive — it only $sets new fields; legacy fields are left in place.
// Run once before starting the server:  node scripts/migrate-patients.js
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection("patients");
  const legacy = await col.find({ patientId: { $exists: false } }).toArray();
  let n = 0;
  for (const p of legacy) {
    const parts = String(p.name || "Unknown").trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "-";
    const middleName = parts.slice(1, -1).join(" ");
    const owner = await mongoose.connection.collection("tenants").findOne({ _id: p.tenantId }, { projection: { ownerUser: 1 } });
    await col.updateOne(
      { _id: p._id },
      {
        $set: {
          patientId: p.uhid || `LEG-${String(p._id).slice(-6)}`,
          firstName,
          middleName,
          lastName,
          dateOfBirth: p.dob || new Date("1900-01-01"),
          gender: ["male", "female", "other"].includes(p.gender) ? p.gender : "undisclosed",
          bloodGroup: p.bloodGroup || "unknown",
          contact: { phone: p.phone || "", alternatePhone: "", email: p.email || "" },
          address: { street: typeof p.address === "string" ? p.address : "", city: p.city || "", state: p.state || "", pincode: p.pincode || "", country: "India" },
          emergencyContact: { name: p.emergencyContact?.name || "", relationship: p.emergencyContact?.relation || "", phone: p.emergencyContact?.phone || "" },
          medicalSummary: {
            allergies: p.allergies || [],
            chronicConditions: p.chronicConditions || [],
            pastMedicalHistory: [],
            pastSurgicalHistory: [],
            familyMedicalHistory: [],
            currentMedications: (p.currentMedications || []).map((m) => ({ name: String(m) })),
            notes: "",
          },
          patientStatus: p.status === "inactive" ? "inactive" : "active",
          registeredBy: p.userId || owner?.ownerUser || p.tenantId,
        },
      },
    );
    n++;
  }
  console.log(`migrated ${n} patient(s)`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
