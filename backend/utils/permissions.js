// Which staff role can open which page. The owner edits this per organisation (Settings -> Role permissions).
//
// Two layers, both must pass:
//   1. the route's own authorize(...roles) gate (fixed in code: it protects dangerous actions such as
//      creating admins, so an organisation can never grant its way past it), and
//   2. this per-organisation page list (what the owner configured).
// `base` below lists the roles layer 1 can ever allow for that page, so the editor only offers grantable cells.

const ADMINS = ["tenant_owner", "hospital_admin"];
const CLINICAL_STAFF = ["doctor", "nurse", "receptionist", "pharmacist", "lab_technician", "billing_executive", "staff"];
const ALL_STAFF = [...ADMINS, ...CLINICAL_STAFF];

// key -> { label, base: roles that may ever hold it, group }
const PAGES = {
  dashboard: { label: "Dashboard", group: "Workspace", base: ALL_STAFF },
  patients: { label: "Patients", group: "Clinic", base: ALL_STAFF },
  doctors: { label: "Doctors", group: "Clinic", base: ALL_STAFF },
  appointments: { label: "Appointments", group: "Clinic", base: ALL_STAFF },
  calendar: { label: "Calendar", group: "Clinic", base: ALL_STAFF },
  consultations: { label: "Consultations", group: "Clinic", base: [...ADMINS, "doctor", "nurse"] },
  "lab-orders": { label: "Lab orders", group: "Clinic", base: [...ADMINS, "doctor", "nurse", "receptionist", "lab_technician"] },
  medicines: { label: "Medicines & inventory", group: "Clinic", base: [...ADMINS, "doctor", "nurse", "pharmacist"] },
  invoices: { label: "Invoices", group: "Finance", base: [...ADMINS, "receptionist", "billing_executive"] },
  reports: { label: "Reports", group: "Insights", base: [...ADMINS, "doctor", "billing_executive", "pharmacist"] },
  analytics: { label: "Analytics", group: "Insights", base: [...ADMINS, "doctor"] },
  locations: { label: "Locations", group: "Admin", base: ALL_STAFF },
  staff: { label: "Staff", group: "Admin", base: ADMINS },
  "password-reset": { label: "Password reset", group: "Admin", base: ADMINS },
  "audit-log": { label: "Audit log", group: "Admin", base: ADMINS },
  billing: { label: "Billing & plan", group: "Admin", base: ADMINS },
  settings: { label: "Settings", group: "Admin", base: ADMINS },
};
const PAGE_KEYS = Object.keys(PAGES);

// Roles whose access is fixed (owner always sees everything so an organisation can't lock itself out).
const LOCKED_ROLES = ["tenant_owner", "super_admin"];
const EDITABLE_ROLES = ["hospital_admin", ...CLINICAL_STAFF];

// Pages a role can never lose: everyone needs a landing page; admins need Settings to undo a mistake.
const MANDATORY = { _all: ["dashboard"], hospital_admin: ["dashboard", "settings"] };

const DEFAULTS = {
  hospital_admin: PAGE_KEYS,
  doctor: ["dashboard", "patients", "appointments", "calendar", "consultations", "lab-orders", "reports", "analytics"],
  nurse: ["dashboard", "patients", "appointments", "calendar", "consultations", "lab-orders"],
  receptionist: ["dashboard", "patients", "doctors", "appointments", "calendar", "invoices"],
  pharmacist: ["dashboard", "patients", "medicines", "reports"],
  lab_technician: ["dashboard", "patients", "lab-orders"],
  billing_executive: ["dashboard", "patients", "invoices", "reports"],
  staff: ["dashboard", "appointments"],
};

const mandatoryFor = (role) => [...new Set([...(MANDATORY._all || []), ...(MANDATORY[role] || [])])];
const grantable = (role) => PAGE_KEYS.filter((k) => PAGES[k].base.includes(role));

// overrides: Tenant.rolePermissions ({ role: [pageKey] }) or undefined.
function effectivePages(role, overrides) {
  if (LOCKED_ROLES.includes(role)) return PAGE_KEYS;
  if (role === "patient") return [];
  const configured = overrides && Array.isArray(overrides[role]) ? overrides[role] : DEFAULTS[role] || ["dashboard"];
  const allowed = new Set(grantable(role));
  return [...new Set([...mandatoryFor(role), ...configured])].filter((k) => PAGES[k] && allowed.has(k));
}

// Validates an owner-submitted { role: [pages] } map; returns the clean map or throws a readable Error.
function sanitizeOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Permissions must be an object of role -> pages");
  const out = {};
  for (const [role, pages] of Object.entries(input)) {
    if (!EDITABLE_ROLES.includes(role)) throw new Error(`The ${role} role cannot be edited`);
    if (!Array.isArray(pages)) throw new Error(`Pages for ${role} must be a list`);
    const unknown = pages.filter((p) => !PAGES[p]);
    if (unknown.length) throw new Error(`Unknown page: ${unknown[0]}`);
    out[role] = effectivePages(role, { [role]: pages });
  }
  return out;
}

// The pages a request may touch, derived once per request in `protect`.
const canOpen = (pages, key) => Array.isArray(pages) && pages.includes(key);

module.exports = { PAGES, PAGE_KEYS, DEFAULTS, EDITABLE_ROLES, LOCKED_ROLES, effectivePages, sanitizeOverrides, grantable, mandatoryFor, canOpen };

if (require.main === module) {
  const assert = require("assert");
  assert.deepStrictEqual(effectivePages("tenant_owner", { tenant_owner: [] }), PAGE_KEYS, "owner can never be restricted");
  assert.ok(effectivePages("receptionist").includes("invoices"));
  assert.ok(!effectivePages("receptionist").includes("staff"), "base gate: receptionist can never hold staff");
  // owner tries to hand 'staff' + 'audit-log' to a nurse: dropped, because the route gate would refuse anyway
  assert.deepStrictEqual(effectivePages("nurse", { nurse: ["dashboard", "staff", "audit-log", "patients"] }), ["dashboard", "patients"]);
  // empty list still keeps the dashboard
  assert.deepStrictEqual(effectivePages("staff", { staff: [] }), ["dashboard"]);
  // hospital admin can't remove Settings
  assert.ok(effectivePages("hospital_admin", { hospital_admin: ["dashboard"] }).includes("settings"));
  assert.deepStrictEqual(effectivePages("patient"), []);
  assert.throws(() => sanitizeOverrides({ tenant_owner: ["patients"] }), /cannot be edited/);
  assert.throws(() => sanitizeOverrides({ nurse: ["nope"] }), /Unknown page/);
  assert.throws(() => sanitizeOverrides([]), /object/);
  assert.deepStrictEqual(sanitizeOverrides({ nurse: ["patients", "staff"] }), { nurse: ["dashboard", "patients"] });
  // unknown role in stored data falls back to the minimal landing page
  assert.deepStrictEqual(effectivePages("mystery"), []);
  console.log("permissions ok");
}
