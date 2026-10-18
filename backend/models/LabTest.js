const mongoose = require("mongoose");

// The organisation's catalogue of orderable lab tests. LabOrder.tests may point at one (testId) but always
// keeps its own name/unit/range snapshot so old reports never change.
const labTestSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    testId: { type: String, required: true, trim: true }, // LT-0001
    name: { type: String, required: true, trim: true, maxlength: 160 },
    nameKey: { type: String, required: true, lowercase: true, trim: true },
    code: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    category: { type: String, default: "", trim: true },
    specimenType: { type: String, default: "", trim: true }, // blood, urine, swab…
    description: { type: String, default: "", maxlength: 500 },
    defaultPrice: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, max: 28, default: 0 },
    unit: { type: String, default: "", trim: true },
    // A default only. Real ranges depend on method, lab and patient; the order keeps the range actually used.
    referenceRange: {
      low: { type: Number, default: null },
      high: { type: Number, default: null },
      text: { type: String, default: "" },
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

labTestSchema.index({ tenantId: 1, testId: 1 }, { unique: true });
labTestSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true });
labTestSchema.index(
  { tenantId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $gt: "" } } },
);

module.exports = mongoose.model("LabTest", labTestSchema);
