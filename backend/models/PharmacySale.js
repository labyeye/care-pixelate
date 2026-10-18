const mongoose = require("mongoose");

const allocationSchema = new mongoose.Schema(
  {
    medicineBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicineBatch",
      required: true,
    },
    batchNumber: { type: String, default: "" },
    expiryDate: { type: Date },
    quantity: { type: Number, required: true, min: 1 },
    returnedQuantity: { type: Number, default: 0, min: 0 },
    purchasePrice: { type: Number, default: 0 }, // cost snapshot for margin reports
  },
  { _id: false },
);

const lineSchema = new mongoose.Schema(
  {
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
    },
    medicineName: { type: String, required: true },
    strength: { type: String, default: "" },
    dosageForm: { type: String, default: "" },
    hsnCode: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 }, // GST-inclusive selling price per unit
    mrp: { type: Number, default: 0 },
    gstRate: { type: Number, default: 0 },
    rate: { type: Number, required: true }, // GST-exclusive unit rate (what the invoice line carries)
    amount: { type: Number, required: true }, // quantity * rate
    gstAmount: { type: Number, default: 0 },
    allocations: { type: [allocationSchema], default: [] }, // the batches that actually supplied this line
  },
  { _id: true },
);

const returnSchema = new mongoose.Schema(
  {
    lineId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, default: "" },
    returnedAt: { type: Date, default: Date.now },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    mode: {
      type: String,
      enum: ["cash", "upi", "card", "bank", "insurance", "other"],
      required: true,
    },
    reference: { type: String, default: "" },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Counter sale / dispensing. Prescribing (Consultation) and dispensing (this) stay separate workflows.
const pharmacySaleSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      default: null,
    },
    number: { type: String, required: true },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    }, // null = counter sale
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
      default: null,
    },
    customerName: { type: String, default: "", maxlength: 120 }, // for counter sales without a patient
    items: { type: [lineSchema], required: true },
    subtotal: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    // Patient sales are billed on the invoice (payments live there); counter sales carry payments here.
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    payments: { type: [paymentSchema], default: [] },
    returns: { type: [returnSchema], default: [] },
    status: {
      type: String,
      enum: ["completed", "partially_returned", "returned", "cancelled"],
      default: "completed",
    },
    cancelReason: { type: String, default: "" },
    idempotencyKey: { type: String, required: true },
    returnSeq: { type: Number, default: 0 }, // optimistic-lock counter so two returns can never both pass
    notes: { type: String, default: "", maxlength: 500 },
    dispensedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

pharmacySaleSchema.index({ tenantId: 1, number: 1 }, { unique: true });
// A retried POST with the same key returns the original sale instead of selling twice.
pharmacySaleSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
pharmacySaleSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });
pharmacySaleSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("PharmacySale", pharmacySaleSchema);
