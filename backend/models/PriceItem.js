const mongoose = require("mongoose");

// The clinic's price list for things that get billed by name (lab tests, medicines, procedures).
// Filled automatically the first time a price is typed on an invoice with "Remember prices" on.
const priceItemSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    kind: { type: String, enum: ["lab", "medicine", "procedure"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    nameKey: { type: String, required: true, lowercase: true, trim: true }, // case-insensitive match key
    // Optional catalogue links. The price row still keeps its own name/price snapshot, and plain
    // "Dressing" / "ECG" style lines need no link at all.
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", default: undefined },
    labTestId: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", default: undefined },
    price: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0, max: 28 },
  },
  { timestamps: true },
);

priceItemSchema.index({ tenantId: 1, kind: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model("PriceItem", priceItemSchema);
