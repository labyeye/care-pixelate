const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    qty: { type: Number, default: 1 },
    rate: { type: Number, required: true },
    gstRate: { type: Number, default: 0 },
    amount: { type: Number, required: true }, // after the line discount, before GST
    hsnCode: { type: String, trim: true, default: "" }, // HSN (goods) / SAC (services), shown on the tax invoice
    unit: { type: String, trim: true, default: "" }, // tablet, strip, nos, ml...
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      default: undefined,
    }, // inventory item this line was picked from
    // Which clinical record this line was generated from (visit / lab order / prescription). Lets the app
    // show it as already billed and refuse to bill it twice.
    source: {
      type: new mongoose.Schema(
        {
          kind: {
            type: String,
            enum: ["appointment", "lab", "medicine", "pharmacy_sale"],
            required: true,
          },
          refId: { type: mongoose.Schema.Types.ObjectId, required: true },
          key: { type: String, default: "" }, // test name / drug name within the record
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    mode: {
      type: String,
      enum: ["cash", "upi", "card", "bank", "insurance", "online", "other"],
      required: true,
    },
    reference: { type: String, trim: true, default: "" },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// Lines are frozen once created (an invoice is a legal record); corrections = void + re-issue.
const invoiceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    number: { type: String, required: true },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    items: { type: [lineSchema], required: true },
    subtotal: { type: Number, required: true },
    gst: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paid: { type: Number, default: 0 },
    payments: { type: [paymentSchema], default: [] },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid", "void"],
      default: "unpaid",
    },
    notes: { type: String, trim: true, default: "" },
    dueDate: Date,
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" }, // treating / billing doctor, printed on the invoice
    voidReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

invoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });
// One live invoice per appointment, so "bill this visit" can't be double-clicked into two.
// (MongoDB rejects $ne / $not inside a partial index — the previous definition failed to build, so the
// guard silently did not exist. $in over the live statuses is supported and means the same thing.)
invoiceSchema.index(
  { tenantId: 1, appointmentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appointmentId: { $exists: true },
      status: { $in: ["unpaid", "partial", "paid"] },
    },
  },
);

module.exports = mongoose.model("Invoice", invoiceSchema);
