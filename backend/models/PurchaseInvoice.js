const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
  {
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
    },
    // Snapshots: the document must read the same after the catalog changes.
    medicineName: { type: String, required: true, trim: true },
    strength: { type: String, default: "" },
    dosageForm: { type: String, default: "" },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    manufacturingDate: { type: Date, default: null },
    expiryDate: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    freeQuantity: { type: Number, min: 0, default: 0 },
    purchasePrice: { type: Number, required: true, min: 0 }, // per unit, excl. GST
    mrp: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, default: null },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    gstRate: { type: Number, min: 0, max: 28, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
    // set when the line has been received into stock
    medicineBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicineBatch",
      default: null,
    },
  },
  { _id: true },
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    mode: {
      type: String,
      enum: ["cash", "upi", "card", "bank", "cheque", "other"],
      required: true,
    },
    reference: { type: String, trim: true, default: "" },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

const returnSchema = new mongoose.Schema(
  {
    medicineBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicineBatch",
      required: true,
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, default: "" },
    returnedAt: { type: Date, default: Date.now },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true },
);

// Invoice received from a vendor. Creating it does NOT touch stock; "receive" does (once).
const purchaseInvoiceSchema = new mongoose.Schema(
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
    number: { type: String, required: true }, // our internal PUR-…
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    invoiceNumber: { type: String, required: true, trim: true, maxlength: 60 }, // the vendor's number
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    items: { type: [lineSchema], required: true },
    subtotal: { type: Number, default: 0 }, // sum of qty * price before discounts
    discount: { type: Number, default: 0 }, // line discounts + invoice-level
    taxableAmount: { type: Number, default: 0 },
    taxBreakdown: [
      { _id: false, gstRate: Number, taxable: Number, tax: Number },
    ],
    roundOff: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    payments: { type: [paymentSchema], default: [] },
    returns: { type: [returnSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "received", "cancelled"],
      default: "draft",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    receivedAt: { type: Date, default: null },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: { type: String, default: "", maxlength: 500 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

purchaseInvoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true });
// A vendor's own invoice number can only be booked once per organisation.
purchaseInvoiceSchema.index(
  { tenantId: 1, vendorId: 1, invoiceNumber: 1 },
  // (not { $ne: "cancelled" } — MongoDB rejects $ne in partial indexes)
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["draft", "received"] } },
  },
);
purchaseInvoiceSchema.index({ tenantId: 1, invoiceDate: -1 });
purchaseInvoiceSchema.index({ tenantId: 1, status: 1, paymentStatus: 1 });

module.exports = mongoose.model("PurchaseInvoice", purchaseInvoiceSchema);
