const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organisation name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    orgType: {
      type: String,
      enum: [
        "hospital",
        "clinic",
        "individual_doctor",
        "multi_speciality_hospital",
        "diagnostic_center",
        "pharmacy",
        "medical_college",
        "corporate_healthcare",
        "ngo_healthcare",
        "telemedicine_company",
      ],
      required: true,
    },
    ownerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan: {
      type: String,
      enum: ["trial", "basic", "starter", "pro", "clinic", "enterprise"],
      default: "trial",
    },
    planExpiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    status: {
      type: String,
      enum: ["active", "suspended", "cancelled"],
      default: "active",
    },
    branding: {
      logoUrl: { type: String, default: "" },
      primaryColor: { type: String, default: "#024BAB" },
      secondaryColor: { type: String, default: "#FA731C" },
      appName: { type: String, default: "" },
    },
    contact: {
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      timezone: { type: String, default: "Asia/Kolkata" },
      currency: { type: String, default: "INR" },
      language: { type: String, default: "en" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      website: { type: String, default: "" },
    },
    limits: {
      userLimit: { type: Number, default: 5 },
      doctorLimit: { type: Number, default: 1 },
      patientLimit: { type: Number, default: 50 }, // 0 = unlimited
      storageLimit: { type: Number, default: 5120 },
    },
    activeModules: {
      type: [String],
      default: ["patients", "doctors", "appointments"],
    },
    // { [role]: [pageKey] } set from Settings -> Role permissions; missing roles use utils/permissions DEFAULTS
    rolePermissions: { type: mongoose.Schema.Types.Mixed, default: {} },
    counters: {
      patient: { type: Number, default: 0 },
      doctor: { type: Number, default: 0 },
      staff: { type: Number, default: 0 },
      invoice: { type: Number, default: 0 },
      lab: { type: Number, default: 0 },
      medicine: { type: Number, default: 0 },
      vendor: { type: Number, default: 0 },
      purchase: { type: Number, default: 0 },
      pharmacySale: { type: Number, default: 0 },
      department: { type: Number, default: 0 },
      labTest: { type: Number, default: 0 },
    },
    profile: {
      expectedDoctors: { type: Number, default: 1 },
      termsAcceptedAt: { type: Date },
    },
    // The organisation's OWN gateway account: patient fees land in their bank, not ours. Secrets are select:false
    // and never returned by any API; read them only through utils/paymentConfig.credsFor().
    // WhatsApp messages to patients. Off by default; templates themselves live in utils/whatsappTemplates.js.
    whatsapp: {
      enabled: { type: Boolean, default: false },
      disabledTemplates: { type: [String], default: [] },
    },
    paymentConfig: {
      provider: {
        type: String,
        enum: ["razorpay", "cashfree", "phonepe", "paytm"],
        default: "razorpay",
      },
      enabled: { type: Boolean, default: false },
      razorpayKeyId: { type: String, default: "" },
      razorpayKeySecret: { type: String, default: "", select: false },
      cashfreeAppId: { type: String, default: "" },
      cashfreeSecretKey: { type: String, default: "", select: false },
      phonepeMerchantId: { type: String, default: "" },
      phonepeSaltKey: { type: String, default: "", select: false },
      phonepeSaltIndex: { type: String, default: "1" },
      paytmMerchantId: { type: String, default: "" },
      paytmMerchantKey: { type: String, default: "", select: false },
    },
    gstDetails: {
      gstin: { type: String, default: "" },
      legalName: { type: String, default: "" },
      pan: { type: String, default: "" },
    },
    // Printed on the invoice PDF (Settings -> Bank Details / Invoice & Printing).
    bank: {
      accountHolder: { type: String, default: "" },
      bankName: { type: String, default: "" },
      branch: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifsc: { type: String, default: "" },
      accountType: {
        type: String,
        enum: ["current", "savings"],
        default: "current",
      },
      upiId: { type: String, default: "" },
    },
    // Invoice Designer layout (validated by utils/invoiceTemplate.js); null = the classic invoice layout.
    invoiceTemplate: { type: mongoose.Schema.Types.Mixed, default: null },
    // Consultation Designer layout for the printed prescription of a completed consultation; null = classic.
    consultationTemplate: { type: mongoose.Schema.Types.Mixed, default: null },
    invoiceSettings: {
      terms: { type: String, default: "" },
      footerNote: { type: String, default: "" },
      signatoryName: { type: String, default: "" },
      signatoryTitle: { type: String, default: "" },
      showBank: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Tenant", tenantSchema);
