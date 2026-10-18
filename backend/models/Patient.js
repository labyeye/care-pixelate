const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    patientId: {
      type: String,
      required: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    middleName: {
      type: String,
      trim: true,
      default: "",
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other", "undisclosed"],
      required: true,
    },

    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
      default: "unknown",
    },

    maritalStatus: {
      type: String,
      enum: [
        "single",
        "married",
        "divorced",
        "widowed",
        "other",
        "undisclosed",
      ],
      default: "undisclosed",
    },

    contact: {
      phone: { type: String, required: true, trim: true },
      alternatePhone: { type: String, default: "" },
      email: { type: String, lowercase: true, trim: true, default: "" },
    },

    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      country: { type: String, default: "India" },
    },

    emergencyContact: {
      name: { type: String, default: "" },
      relationship: { type: String, default: "" },
      phone: { type: String, default: "" },
    },

    guardian: {
      name: { type: String, default: "" },
      relationship: { type: String, default: "" },
      phone: { type: String, default: "" },
    },

    medicalSummary: {
      allergies: [{ type: String }],
      chronicConditions: [{ type: String }],
      pastMedicalHistory: [{ type: String }],
      pastSurgicalHistory: [{ type: String }],
      familyMedicalHistory: [{ type: String }],
      currentMedications: [
        {
          name: String,
          dosage: String,
          frequency: String,
        },
      ],
      notes: { type: String, default: "" },
    },

    patientStatus: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },

    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

patientSchema.index({ tenantId: 1, patientId: 1 }, { unique: true });

patientSchema.index({ tenantId: 1, "contact.phone": 1 });

// Display name for lists / print-outs. Needs firstName + lastName in any `.select()`.
patientSchema.virtual("name").get(function () {
  return [this.firstName, this.middleName, this.lastName]
    .filter(Boolean)
    .join(" ");
});

const Patient = mongoose.model("Patient", patientSchema);

// NOTE: the pre-migration schema had a unique (tenantId, uhid) index that collides on null for every new
// patient. It is dropped explicitly by scripts/migrate-pharmacy.js --apply (never by an automatic syncIndexes).

module.exports = Patient;
