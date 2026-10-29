const mongoose = require("mongoose");

// One wallet per gym. A gym WITHOUT a wallet (or metered:false) is not metered: WhatsApp stays free as today.
// balance/bonusBalance are integers in 1/config.UNIT credit.
const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    metered: { type: Boolean, default: true },
    balance: { type: Number, default: 0 },
    bonusBalance: { type: Number, default: 0 },
    bonusExpiresAt: { type: Date },
    alerted: { type: String, enum: [null, "low", "zero"], default: null },
    dayKey: { type: String },
    dayCount: { type: Number, default: 0 },
    dailyCap: { type: Number },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CreditWallet", schema);
