const mongoose = require("mongoose");

// Concurrency-safe overlap guard. Each live appointment owns one row per 5-minute grain it covers;
// the unique (doctorId, grain) index makes two overlapping bookings impossible even when the
// requests race, without needing multi-document transactions.
const appointmentSlotLockSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
    grain: { type: Number, required: true }, // floor(epochMs / 5min)
  },
  { timestamps: false },
);

appointmentSlotLockSchema.index({ doctorId: 1, grain: 1 }, { unique: true });
appointmentSlotLockSchema.index({ appointmentId: 1 });

module.exports = mongoose.model("AppointmentSlotLock", appointmentSlotLockSchema);
