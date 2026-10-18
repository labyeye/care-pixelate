const mongoose = require("mongoose");

const TYPES = [
  "purchase_receipt",
  "sale",
  "dispensing",
  "customer_return",
  "supplier_return",
  "damaged",
  "expired",
  "adjustment",
  "transfer_in",
  "transfer_out",
  "legacy_adjustment", // un-batched stock (pre-batch inventory) moved in/out
];

// Append-only inventory ledger. Corrections are new rows (compensating entries) — never edits.
const stockTransactionSchema = new mongoose.Schema(
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
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
    },
    medicineBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicineBatch",
      default: null,
    }, // null = un-batched legacy stock
    transactionType: { type: String, enum: TYPES, required: true },
    quantityChange: { type: Number, required: true }, // + in, - out
    quantityBefore: { type: Number, required: true },
    quantityAfter: { type: Number, required: true, min: 0 },
    referenceType: { type: String, default: "" }, // purchase_invoice | pharmacy_sale | manual | ...
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, trim: true, default: "", maxlength: 300 },
    // Makes retried requests no-ops: one ledger row per (tenant, key).
    idempotencyKey: { type: String, default: undefined },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

stockTransactionSchema.index({ tenantId: 1, medicineId: 1, occurredAt: -1 });
stockTransactionSchema.index({
  tenantId: 1,
  medicineBatchId: 1,
  occurredAt: -1,
});
stockTransactionSchema.index({ tenantId: 1, referenceType: 1, referenceId: 1 });
stockTransactionSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

// The ledger is immutable at the model level too, so no controller can rewrite history by accident.
const refuse = function (next) {
  next(
    new Error(
      "Stock transactions are append-only; record a compensating entry instead",
    ),
  );
};
[
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
].forEach((op) => stockTransactionSchema.pre(op, refuse));
stockTransactionSchema.pre("save", function (next) {
  if (!this.isNew) return next(new Error("Stock transactions are append-only"));
  next();
});

const StockTransaction = mongoose.model(
  "StockTransaction",
  stockTransactionSchema,
);
StockTransaction.TYPES = TYPES;
module.exports = StockTransaction;
