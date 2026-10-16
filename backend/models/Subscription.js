const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: String,
    razorpayOrderId: String,
    razorpayPaymentId: String,
    plan: String,
    doctors: Number,
    billingCycle: String,
    subtotal: Number,
    gst: Number,
    amount: Number, // GST-inclusive, rupees
    status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
    paidAt: Date,
  },
  { timestamps: true },
);

const subscriptionSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    plan: { type: String, default: "trial" },
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    doctors: { type: Number, default: 1 },
    status: { type: String, enum: ["trialing", "active", "expired", "cancelled"], default: "trialing" },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    pendingOrder: {
      razorpayOrderId: String,
      plan: String,
      doctors: Number,
      billingCycle: String,
      subtotal: Number,
      gst: Number,
      amount: Number,
    },
    invoices: [invoiceSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
