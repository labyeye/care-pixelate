const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Please add a valid email"],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    role: {
      type: String,
      enum: [
        "super_admin",
        "tenant_owner",
        "hospital_admin",
        "doctor",
        "nurse",
        "receptionist",
        "pharmacist",
        "lab_technician",
        "billing_executive",
        "patient",
        "staff",
      ],
      default: "staff",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    phone: {
      type: String,
      trim: true,
    },
    phoneVerified: { type: Boolean, default: false },
    totpEnabled: { type: Boolean, default: false },
    totpSecret: { type: String, select: false },
    // sha256 hashes + expiry; separate pairs so OTP purposes can't be crossed
    phoneOtpHash: { type: String, select: false },
    phoneOtpExpires: { type: Date, select: false },
    loginOtpHash: { type: String, select: false },
    loginOtpExpires: { type: Date, select: false },
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    // Wrong guesses against the current OTP; 5 strikes burn the code (6 digits are only 10^6 possibilities).
    loginOtpTries: { type: Number, default: 0, select: false },
    phoneOtpTries: { type: Number, default: 0, select: false },
    // Bumped on every password change (pre-save hook); older JWTs carry the old value and are refused by `protect`.
    tokenVersion: { type: Number, default: 0 },
    // Brute-force guard: 10 wrong passwords lock the account for 15 minutes.
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  if (!this.isNew) this.tokenVersion = (this.tokenVersion || 0) + 1;
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
