const mongoose = require("mongoose");

// Profile / HR details for a login (User). The User owns email, password, role
// and active status; this document owns everything about the person.
const staffProfileSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    staffId: { type: String, required: true, trim: true },

    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, default: "", trim: true },
    lastName: { type: String, required: true, trim: true },
    profileImage: { type: String, default: "" },
    gender: { type: String, enum: ["male", "female", "other", "undisclosed"], default: "undisclosed" },
    dateOfBirth: { type: Date, default: null },
    bloodGroup: { type: String, enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"], default: "unknown" },
    maritalStatus: { type: String, enum: ["single", "married", "divorced", "widowed", "other", "undisclosed"], default: "undisclosed" },

    contact: {
      phone: { type: String, required: true, trim: true },
      alternatePhone: { type: String, default: "" },
      email: { type: String, lowercase: true, trim: true, default: "" }, // personal; login email lives on User
    },

    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      country: { type: String, default: "India" },
    },

    emergencyContact: {
      name: { type: String, default: "" },
      relationship: { type: String, default: "" },
      phone: { type: String, default: "" },
    },

    employment: {
      designation: { type: String, default: "", trim: true },
      department: { type: String, default: "", trim: true },
      employmentType: { type: String, enum: ["full_time", "part_time", "contract", "intern", "visiting"], default: "full_time" },
      joiningDate: { type: Date, default: null },
      shift: { type: String, enum: ["general", "morning", "evening", "night", "rotational"], default: "general" },
      workDays: [{ type: String, enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }],
      workStart: { type: String, default: "" }, // "HH:mm"
      workEnd: { type: String, default: "" },
      reportingTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      experienceYears: { type: Number, min: 0, default: 0 },
    },

    professional: {
      qualifications: [
        {
          degree: { type: String, required: true },
          institution: { type: String, default: "" },
          year: { type: Number, default: null },
        },
      ],
      licenseNumber: { type: String, default: "", trim: true }, // nursing / pharmacy / lab registration
      licenseAuthority: { type: String, default: "", trim: true },
      licenseExpiry: { type: Date, default: null },
      skills: [{ type: String, trim: true }],
      languages: [{ type: String }],
    },

    identity: {
      idType: { type: String, enum: ["", "aadhaar", "pan", "passport", "driving_license", "voter_id"], default: "" },
      idNumber: { type: String, default: "", trim: true },
    },

    bank: {
      accountHolder: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifsc: { type: String, default: "", uppercase: true },
      bankName: { type: String, default: "" },
      upiId: { type: String, default: "" },
    },

    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

staffProfileSchema.index({ tenantId: 1, staffId: 1 }, { unique: true });
staffProfileSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

staffProfileSchema.virtual("name").get(function () {
  return [this.firstName, this.middleName, this.lastName].filter(Boolean).join(" ");
});

module.exports = mongoose.model("StaffProfile", staffProfileSchema);
