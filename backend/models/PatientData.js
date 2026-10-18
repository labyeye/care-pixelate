const mongoose = require("mongoose");

const ref = (name, required = true) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: name,
  required,
});

// A reading the patient logs themselves (BP is value=systolic, value2=diastolic).
const Vital = mongoose.model(
  "Vital",
  new mongoose.Schema(
    {
      tenantId: ref("Tenant"),
      patientId: ref("Patient"),
      type: {
        type: String,
        enum: ["bp", "sugar", "weight", "pulse", "spo2", "temp"],
        required: true,
      },
      value: { type: Number, required: true },
      value2: Number,
      unit: { type: String, default: "" },
      note: { type: String, trim: true, default: "" },
      measuredAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
  ).index({ tenantId: 1, patientId: 1, type: 1, measuredAt: -1 }),
);

// Delivery (push/WhatsApp) is a scheduler job on top of this; the model only stores the plan.
const MedicineReminder = mongoose.model(
  "MedicineReminder",
  new mongoose.Schema(
    {
      tenantId: ref("Tenant"),
      patientId: ref("Patient"),
      drug: { type: String, required: true, trim: true },
      medicineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Medicine",
        default: undefined,
      }, // optional: outside-catalog drugs stay valid
      consultationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Consultation",
        default: undefined,
      },
      prescriptionItemId: {
        type: mongoose.Schema.Types.ObjectId,
        default: undefined,
      },
      dose: { type: String, trim: true, default: "" },
      frequency: { type: String, trim: true, default: "" },
      timezone: { type: String, default: "Asia/Kolkata" },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
      },
      times: { type: [String], default: [] }, // "HH:MM" clinic-local
      startDate: { type: Date, default: Date.now },
      endDate: Date,
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ).index({ tenantId: 1, patientId: 1 }),
);

// ponytail: file bytes live in Mongo (<=2MB each) so no storage service is needed yet.
// Upgrade path: swap `data` for an S3/GCS key + signed URL when volumes grow.
const MedicalRecord = mongoose.model(
  "MedicalRecord",
  new mongoose.Schema(
    {
      tenantId: ref("Tenant"),
      patientId: ref("Patient"),
      uploadedBy: ref("User", false),
      title: { type: String, required: true, trim: true, maxlength: 120 },
      type: {
        type: String,
        enum: [
          "prescription",
          "lab_report",
          "bill",
          "scan",
          "discharge",
          "other",
        ],
        default: "other",
      },
      recordDate: { type: Date, default: Date.now },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
      data: { type: Buffer, select: false, required: true },
    },
    { timestamps: true },
  ).index({ tenantId: 1, patientId: 1, recordDate: -1 }),
);

module.exports = { Vital, MedicineReminder, MedicalRecord };
