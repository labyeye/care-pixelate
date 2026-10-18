const mongoose = require("mongoose");

// One row per WhatsApp message attempt (what, to whom, outcome). Variables are kept so a failed send can be re-sent.
const messageLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    template: { type: String, required: true },
    to: { type: String, default: "" },
    vars: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["sent", "failed", "skipped", "not_connected"],
      required: true,
    },
    reason: { type: String, default: "" },
    ref: { kind: String, id: mongoose.Schema.Types.ObjectId }, // appointment / consultation / invoice this was about
  },
  { timestamps: true },
);
messageLogSchema.index({ tenantId: 1, createdAt: -1 });
messageLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 3600 },
); // keep 90 days

module.exports = mongoose.model("MessageLog", messageLogSchema);
