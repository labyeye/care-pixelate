const asyncHandler = require("express-async-handler");
const Tenant = require("../models/Tenant");
const { clinicCodeError } = require("../utils/clinicCode");
const P = require("../utils/permissions");
const { sanitizeSettings } = require("../utils/tenantSettings");
const { sanitizeInvoiceTemplate } = require("../utils/invoiceTemplate");

// @desc    Get the current tenant
// @route   GET /api/tenants/me
const getCurrentTenant = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(400);
    throw new Error("No tenant specified");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }

  res.json({ success: true, data: tenant });
});

// @desc    Update the current tenant's branding/contact details
// @route   PUT /api/tenants/me
const updateTenant = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    res.status(400);
    throw new Error("No tenant specified");
  }

  const { activeModules } = req.body;
  const { invoiceTemplate, consultationTemplate } = req.body;
  // name / branding / contact / GST / PAN / bank / invoice settings: validated field by field
  let update;
  try {
    update = sanitizeSettings(req.body);
  } catch (err) {
    res.status(400);
    throw err;
  }
  if (typeof req.body.slug === "string") {
    const code = req.body.slug.trim().toLowerCase();
    const bad = clinicCodeError(code);
    if (bad) {
      res.status(400);
      throw new Error(bad);
    }
    if (await Tenant.exists({ slug: code, _id: { $ne: tenantId } })) {
      res.status(409);
      throw new Error("That clinic code is already taken");
    }
    update.slug = code;
  }
  for (const [field, value] of [
    ["invoiceTemplate", invoiceTemplate],
    ["consultationTemplate", consultationTemplate],
  ]) {
    if (value === undefined) continue;
    try {
      update[field] = value === null ? null : sanitizeInvoiceTemplate(value);
    } catch (err) {
      res.status(400);
      throw err;
    }
  }
  const MODULES = [
    "patients",
    "doctors",
    "appointments",
    "billing",
    "lab",
    "video",
    "ai_scribe",
  ];
  if (Array.isArray(activeModules))
    update.activeModules = [
      ...new Set(activeModules.filter((m) => MODULES.includes(m))),
    ];

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { $set: update },
    {
      new: true,
      runValidators: true,
    },
  );
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }

  res.json({ success: true, data: tenant });
});

const matrix = (tenant) => {
  const current = {};
  for (const role of P.EDITABLE_ROLES)
    current[role] = P.effectivePages(role, tenant.rolePermissions);
  return {
    pages: P.PAGE_KEYS.map((key) => ({
      key,
      ...P.PAGES[key],
      mandatoryFor: P.EDITABLE_ROLES.filter((r) =>
        P.mandatoryFor(r).includes(key),
      ),
    })),
    roles: P.EDITABLE_ROLES,
    current,
    defaults: Object.fromEntries(
      P.EDITABLE_ROLES.map((r) => [r, P.effectivePages(r, undefined)]),
    ),
  };
};

// @route GET /api/tenants/permissions
const getPermissions = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.tenantId).select("rolePermissions");
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }
  res.json({ success: true, data: matrix(tenant) });
});

// @route PUT /api/tenants/permissions   body: { permissions: { role: [pageKey] } }  (or { reset: true })
const updatePermissions = asyncHandler(async (req, res) => {
  let next;
  if (req.body.reset === true) {
    next = {};
  } else {
    try {
      next = P.sanitizeOverrides(req.body.permissions);
    } catch (err) {
      res.status(400);
      throw err;
    }
  }
  const tenant = await Tenant.findById(req.tenantId).select("rolePermissions");
  if (!tenant) {
    res.status(404);
    throw new Error("Tenant not found");
  }
  const merged =
    req.body.reset === true
      ? {}
      : { ...(tenant.rolePermissions || {}), ...next };
  const saved = await Tenant.findByIdAndUpdate(
    req.tenantId,
    { $set: { rolePermissions: merged } },
    { new: true },
  ).select("rolePermissions");
  res.json({ success: true, data: matrix(saved) });
});

module.exports = {
  getCurrentTenant,
  updateTenant,
  getPermissions,
  updatePermissions,
};
