const mongoose = require("mongoose");

const oid = (ref, required = false) => ({ type: mongoose.Schema.Types.ObjectId, ref, required });

// Append-only access trail (no update/delete routes exist). Bodies are never stored: they hold PHI.
const AuditLog = mongoose.model(
  "AuditLog",
  new mongoose.Schema(
    {
      tenantId: oid("Tenant", true),
      userId: oid("User"),
      role: String,
      method: String,
      action: { type: String, enum: ["view", "create", "update", "delete", "action"], required: true },
      resource: { type: String, required: true },
      resourceId: String,
      path: String,
      status: Number,
      ip: String,
      at: { type: Date, default: Date.now },
    },
    { versionKey: false },
  )
    .index({ tenantId: 1, at: -1 })
    .index({ tenantId: 1, resource: 1, resourceId: 1, at: -1 }),
);

// A clinic location / branch under one tenant. Doctor.clinicIds already references "Clinic".
const Clinic = mongoose.model(
  "Clinic",
  new mongoose.Schema(
    {
      tenantId: oid("Tenant", true),
      name: { type: String, required: true, trim: true, maxlength: 120 },
      code: { type: String, required: true, trim: true, uppercase: true, maxlength: 12 },
      address: {
        street: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        pincode: { type: String, default: "" },
      },
      phone: { type: String, trim: true, default: "" },
      status: { type: String, enum: ["active", "inactive"], default: "active" },
    },
    { timestamps: true },
  ).index({ tenantId: 1, code: 1 }, { unique: true }),
);

// ABHA (ABDM health ID) captured against a patient. "unverified" until a real ABDM gateway
// verification runs; this model never claims verification by itself.
const AbhaLink = mongoose.model(
  "AbhaLink",
  new mongoose.Schema(
    {
      tenantId: oid("Tenant", true),
      patientId: oid("Patient", true),
      abhaNumber: { type: String, required: true }, // 14 digits, stored without hyphens
      abhaAddress: { type: String, trim: true, lowercase: true, default: "" },
      status: { type: String, enum: ["unverified", "verified"], default: "unverified" },
      linkedBy: oid("User"),
    },
    { timestamps: true },
  ).index({ tenantId: 1, patientId: 1 }, { unique: true }),
);

// DPDP: every consent grant/withdrawal is an immutable row; the latest row per purpose wins.
const ConsentLog = mongoose.model(
  "ConsentLog",
  new mongoose.Schema(
    {
      tenantId: oid("Tenant", true),
      userId: oid("User", true),
      purpose: { type: String, enum: ["whatsapp", "data_sharing", "ai_scribe", "marketing", "deletion_request"], required: true },
      granted: { type: Boolean, required: true },
      ip: String,
      at: { type: Date, default: Date.now },
    },
    { versionKey: false },
  ).index({ tenantId: 1, userId: 1, purpose: 1, at: -1 }),
);

module.exports = { AuditLog, Clinic, AbhaLink, ConsentLog };
