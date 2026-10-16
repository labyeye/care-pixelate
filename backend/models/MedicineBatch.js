const mongoose = require("mongoose");

// One received lot of one medicine at one location. Inventory = sum of batch.quantityAvailable;
// the medicine document only carries a derived summary (see utils/inventory.syncMedicine).
const medicineBatchSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
    // Stock location. null = the organisation's main store; otherwise a Clinic (branch) of the same tenant.
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: "Clinic", default: null },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 },
    manufacturingDate: { type: Date, default: null },
    expiryDate: { type: Date, required: true },
    quantityReceived: { type: Number, required: true, min: 0 },
    quantityAvailable: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, min: 0, default: 0 },
    mrp: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, default: null }, // only when this lot is priced differently from the catalog
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
    purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseInvoice", default: null },
    receivedAt: { type: Date, default: Date.now },
    // "quarantined" lots are never picked by FEFO (recall / QC hold).
    status: { type: String, enum: ["active", "quarantined"], default: "active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// A batch number is unique per medicine per location — receiving the same lot again tops it up.
medicineBatchSchema.index({ tenantId: 1, clinicId: 1, medicineId: 1, batchNumber: 1 }, { unique: true });
// FEFO pick: earliest expiry first among lots that still have stock.
medicineBatchSchema.index({ tenantId: 1, medicineId: 1, clinicId: 1, expiryDate: 1, quantityAvailable: 1 });
// "expiring soon" / expired sweeps across the whole store.
medicineBatchSchema.index({ tenantId: 1, expiryDate: 1 });
medicineBatchSchema.index({ tenantId: 1, purchaseInvoiceId: 1 });

module.exports = mongoose.model("MedicineBatch", medicineBatchSchema);
