// One-off: converts legacy Doctor docs (name/specialization/qualification/fee/slotMinutes/...) to the
// current schema (firstName/lastName, contact, professionalDetails, consultation, accountStatus).
// Idempotent and non-destructive: it only $sets new fields, legacy fields stay in place.
// Placeholders ("PENDING") mark data the legacy model never captured; verificationStatus stays "pending".
// Run once before starting the server:  node scripts/migrate-doctors.js
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  const col = db.collection("doctors");
  const tenants = db.collection("tenants");

  const legacy = await col.find({ doctorId: { $exists: false } }).toArray();
  let n = 0;
  for (const d of legacy) {
    const parts = String(d.name || "Unknown")
      .replace(/^dr\.?\s+/i, "")
      .trim()
      .split(/\s+/);
    const firstName = parts[0] || "Unknown";
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "-";
    const middleName = parts.slice(1, -1).join(" ");

    // Sequential per-tenant ID, same counter the API uses.
    const t = await tenants.findOneAndUpdate(
      { _id: d.tenantId },
      { $inc: { "counters.doctor": 1 } },
      { returnDocument: "after", projection: { counters: 1, ownerUser: 1 } },
    );
    const doc = t.value || t; // driver v5 returns the doc, v4 returns { value }
    const seq = doc?.counters?.doctor || n + 1;

    await col.updateOne(
      { _id: d._id },
      {
        $set: {
          doctorId: `DR-${String(seq).padStart(4, "0")}`,
          firstName,
          middleName,
          lastName,
          gender: "undisclosed",
          contact: {
            phone: d.phone || "PENDING",
            email: d.email || "pending@invalid.local",
          },
          professionalDetails: {
            registrationNumber: d.registrationNumber || "PENDING",
            registrationCouncil: "PENDING",
            qualifications: d.qualification
              ? [{ degree: d.qualification, institution: "", year: null }]
              : [],
            specializations: d.specialization ? [d.specialization] : [],
            experienceYears: d.experienceYears || 0,
            bio: d.bio || "",
            languages: d.languages || [],
          },
          consultation: {
            consultationFee: d.fee || 0,
            followUpFee: d.followUpFee || 0,
            currency: "INR",
            appointmentDurationMinutes: d.slotMinutes || 15,
            consultationModes: d.onlineConsult
              ? ["in_person", "video"]
              : ["in_person"],
            acceptingAppointments: true,
          },
          followUpDays: d.followUpDays ?? 7,
          verificationStatus: "pending",
          accountStatus: d.status === "inactive" ? "inactive" : "active",
          createdBy: d.createdBy || doc?.ownerUser || null,
        },
      },
    );
    n++;
  }
  console.log(
    `Migrated ${n} doctor(s); ${await col.countDocuments({ doctorId: { $exists: true } })} now on the current schema.`,
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
