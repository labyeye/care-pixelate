const mongoose = require("mongoose");

// Doctor.departmentIds referenced a "Department" model that did not exist; this is it.
const departmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    departmentId: { type: String, required: true, trim: true }, // DEP-0001
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      default: null,
    }, // optional: department of one branch
    name: { type: String, required: true, trim: true, maxlength: 100 },
    nameKey: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: "", maxlength: 300 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

departmentSchema.index({ tenantId: 1, departmentId: 1 }, { unique: true });
// Same name may exist in different branches, but not twice in the same one.
departmentSchema.index(
  { tenantId: 1, clinicId: 1, nameKey: 1 },
  { unique: true },
);

module.exports = mongoose.model("Department", departmentSchema);
