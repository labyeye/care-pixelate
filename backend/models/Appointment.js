const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
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
    scheduledAt: {
      type: Date,
      required: [true, "Appointment date/time is required"],
    },
    endsAt: { type: Date },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: "Clinic" },
    videoRoom: { type: String, select: false }, // set for type=video; joined via /video-link, never listed
    source: {
      type: String,
      enum: ["reception", "app", "web"],
      default: "reception",
    },
    type: {
      type: String,
      enum: ["in_clinic", "video", "walk_in"],
      default: "in_clinic",
    },
    tokenNo: { type: Number },
    fee: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "waived"],
      default: "unpaid",
    },
    // Online payment trail (the org's own gateway). orderId is what verify matches against.
    payment: {
      gateway: { type: String },
      orderId: { type: String, select: false },
      paymentId: { type: String },
      paidAt: { type: Date },
    },
    reminderSentAt: { type: Date },
    checkedInAt: { type: Date },
    completedAt: { type: Date },
    cancelReason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled", "no_show"],
      default: "scheduled",
    },
    reason: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

// Race-safe backstop for the overlap check: one live booking per doctor per start time.
appointmentSchema.index(
  { doctorId: 1, scheduledAt: 1 },
  { unique: true, partialFilterExpression: { status: "scheduled" } },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
