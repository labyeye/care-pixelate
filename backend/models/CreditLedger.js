const mongoose = require("mongoose");

// Append-only history. units is signed (debit < 0), in 1/config.UNIT credit.
const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    type: { type: String, enum: ["topup", "bonus", "debit", "refund", "adjust", "skipped"], required: true },
    units: { type: Number, required: true },
    bucket: { type: String, enum: ["main", "bonus"] },
    event: { type: String }, // template name for message rows
    phone: { type: String }, // masked
    wamid: { type: String, index: true, sparse: true },
    status: { type: String }, // debit: reserved | sent | refunded ; skipped
    refId: { type: String, unique: true, sparse: true }, // payment id / subscription id: makes grants idempotent
    note: { type: String },
  },
  { timestamps: true },
);
schema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("CreditLedger", schema);
