const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    medicineId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    genericName: { type: String, default: "", trim: true },
    brandName: { type: String, default: "", trim: true },
    manufacturer: { type: String, default: "", trim: true },
    category: { type: String, default: "", trim: true },
    dosageForm: {
      type: String,
      enum: [
        "tablet",
        "capsule",
        "syrup",
        "suspension",
        "injection",
        "cream",
        "ointment",
        "drops",
        "inhaler",
        "powder",
        "gel",
        "lotion",
        "other",
      ],
      required: true,
    },
    strength: { type: String, default: "", trim: true },
    activeIngredients: [
      {
        _id: false,
        name: { type: String, required: true, trim: true },
        strength: { type: String, default: "", trim: true },
      },
    ],
    packSize: { type: Number, min: 1, default: 1 },
    unit: {
      type: String,
      enum: [
        "tablet",
        "capsule",
        "ml",
        "bottle",
        "vial",
        "tube",
        "strip",
        "piece",
        "pack",
        "other",
      ],
      default: "piece",
    },
    prescriptionRequired: { type: Boolean, default: true },
    scheduleCategory: { type: String, default: "" },
    storageInstructions: { type: String, default: "" },
    warnings: [{ type: String, trim: true }],
    mrp: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, min: 0, max: 100, default: 0 },
    hsnCode: { type: String, default: "" },
    barcode: { type: String, default: "", trim: true },
    sku: { type: String, default: "", trim: true },
    reorderLevel: { type: Number, min: 0, default: 10 },
    trackInventory: { type: Boolean, default: true },
    // Units on hand (in `unit`). Changed only through the stock endpoint so every change is attributable.
    // DERIVED summary = legacyStockQty + sellable batch stock (utils/inventory.syncMedicine). Never set directly.
    stockQty: { type: Number, min: 0, default: 0 },
    // Stock that existed before batch tracking and has no batch/expiry on record. It is never invented into a
    // batch: staff reconcile it (POST /inventory/medicines/:id/reconcile) when they have the real lot details.
    legacyStockQty: { type: Number, min: 0, default: 0 },
    expiryDate: { type: Date }, // earliest expiry of stock on hand
    // Supplier the stock came from — set on the medicine and updated on every stock-in.
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Unique medicine ID within each organization
medicineSchema.index({ tenantId: 1, medicineId: 1 }, { unique: true });
// Search medicines by name and strength
medicineSchema.index({ tenantId: 1, name: 1, strength: 1 });
// Barcode / SKU identify one product inside an organisation (only enforced when filled in).
medicineSchema.index(
  { tenantId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $gt: "" } } },
);
medicineSchema.index(
  { tenantId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $gt: "" } } },
);
medicineSchema.index({ tenantId: 1, genericName: 1 });

module.exports = mongoose.model("Medicine", medicineSchema);
