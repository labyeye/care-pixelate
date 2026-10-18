const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LabTest",
      default: undefined,
    }, // optional catalogue link
    code: { type: String, trim: true, default: "" },
    specimenType: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    result: { type: String, trim: true, default: "" },
    unit: { type: String, trim: true, default: "" },
    refLow: Number,
    refHigh: Number,
    flag: { type: String, enum: ["", "low", "normal", "high"], default: "" },
  },
  { _id: false },
);

// One entry per lifecycle step, appended as it happens — the order's audit trail.
const stageSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["ordered", "collected", "resulted", "cancelled"],
      required: true,
    },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byName: { type: String, trim: true, default: "" }, // snapshot, survives a renamed / removed user
    byRole: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" }, // sample type, cancel reason, remarks
  },
  { _id: true },
);

const labOrderSchema = new mongoose.Schema(
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
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
    },
    tests: { type: [testSchema], required: true },
    status: {
      type: String,
      enum: ["ordered", "collected", "resulted", "cancelled"],
      default: "ordered",
    },
    notes: { type: String, trim: true, default: "" },
    collectedAt: Date,
    resultedAt: Date,
    // Staff responsible for performing the test, and who actually did each step.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resultedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    stages: { type: [stageSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

labOrderSchema.index({ tenantId: 1, number: 1 }, { unique: true });
labOrderSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("LabOrder", labOrderSchema);
