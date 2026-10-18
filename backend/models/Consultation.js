const mongoose = require("mongoose");

// `drug` stays the display name (and the legacy field every old prescription has). The extra fields are
// optional: medicineId links the catalog; the snapshots keep the prescription readable if the catalog changes.
const itemSchema = new mongoose.Schema(
  {
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      default: undefined,
    },
    drug: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true, default: "" },
    strength: { type: String, trim: true, default: "" },
    dosageForm: { type: String, trim: true, default: "" },
    dose: { type: String, trim: true, default: "" },
    route: { type: String, trim: true, default: "" }, // oral, topical, IV…
    frequency: { type: String, trim: true, default: "" }, // e.g. "1-0-1"
    days: { type: Number, min: 0 }, // duration in days (durationDays)
    quantity: { type: Number, min: 0 },
    instructions: { type: String, trim: true, default: "" },
  },
  { _id: true, timestamps: false },
);

// One visit = one consultation; the prescription lives inside it so it can never drift from the notes.
const consultationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    vitals: {
      bp: { type: String, default: "" },
      pulse: Number,
      tempC: Number,
      spo2: Number,
      weightKg: Number,
      heightCm: Number,
    },
    // Intake: nurse / receptionist can record vitals before the doctor opens the visit. The doctor sees them
    // pre-filled and can edit; these fields only say who captured them.
    vitalsRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    vitalsRecordedByName: { type: String, trim: true, default: "" },
    vitalsRecordedByRole: { type: String, trim: true, default: "" },
    vitalsRecordedAt: Date,
    complaints: { type: String, trim: true, default: "" },
    diagnosis: { type: [String], default: [] },
    notes: { type: String, trim: true, default: "" },
    followUpOn: Date,
    followUpReminderSentAt: Date,
    prescription: {
      items: { type: [itemSchema], default: [] },
      advice: { type: String, trim: true, default: "" },
    },
    status: { type: String, enum: ["draft", "signed"], default: "draft" },
    signedAt: Date,
    signedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

consultationSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });
consultationSchema.index(
  { tenantId: 1, appointmentId: 1 },
  { unique: true, sparse: true },
);

module.exports = mongoose.model("Consultation", consultationSchema);
