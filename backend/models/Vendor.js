const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    vendorId: { type: String, required: true, trim: true },
    vendorType: {
      type: String,
      enum: ["manufacturer", "distributor", "wholesaler", "retailer", "other"],
      default: "distributor",
    },
    businessName: { type: String, required: true, trim: true },
    contactPerson: {
      name: { type: String, default: "" },
      designation: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, default: "" },
    email: { type: String, lowercase: true, trim: true, default: "" },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      country: { type: String, default: "India" },
    },
    gstin: { type: String, uppercase: true, trim: true, default: "" },
    drugLicenseNumber: { type: String, trim: true, default: "" },
    drugLicenseExpiry: { type: Date, default: null },
    paymentTerms: {
      type: String,
      enum: [
        "immediate",
        "7_days",
        "15_days",
        "30_days",
        "45_days",
        "60_days",
        "custom",
      ],
      default: "immediate",
    },
    creditLimit: { type: Number, min: 0, default: 0 },
    openingBalance: { type: Number, default: 0 },
    bankDetails: {
      accountHolderName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifscCode: { type: String, default: "" },
      bankName: { type: String, default: "" },
    },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

vendorSchema.index({ tenantId: 1, vendorId: 1 }, { unique: true });
vendorSchema.index({ tenantId: 1, businessName: 1 });

module.exports = mongoose.model("Vendor", vendorSchema);
