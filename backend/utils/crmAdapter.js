// Nest Doc side of utils/crmAccounts.js.
const Tenant = require("../models/Tenant");
module.exports = require("./crmTenantAdapter")({
  label: "Hospital / clinic",
  Tenant,
  User: require("../models/User"),
  ownerRole: "tenant_owner",
  defaultRole: "staff",
  hideRoles: ["patient"],
  limitFields: [
    { key: "userLimit", label: "User limit", path: "limits.userLimit" },
    { key: "doctorLimit", label: "Doctor limit", path: "limits.doctorLimit" },
    { key: "patientLimit", label: "Patient limit (0 = unlimited)", path: "limits.patientLimit" },
  ],
  defaultLimits: { userLimit: 10, doctorLimit: 2, patientLimit: 0 },
  createExtraFields: [{ key: "orgType", label: "Organisation type", options: Tenant.schema.path("orgType").enumValues }],
  createTenant: (b, { email, phone }) => ({ orgType: b.extra?.orgType || "clinic", contact: { email, phone: phone || "" } }),
  usage: (t, users) => `${users} / ${t.limits?.userLimit ?? "—"} users · ${t.limits?.doctorLimit ?? "—"} doctors`,
});
