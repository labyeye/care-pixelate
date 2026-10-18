const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { effectivePages, PAGE_KEYS, canOpen } = require("../utils/permissions");
const Tenant = require("../models/Tenant");

// `allowNoTenant` lets a freshly-registered owner (no organisation yet) through
// to the account/onboarding routes only. Every data route uses `protect`
// below, which still refuses tenant-less users, so tenant isolation holds.
const authenticate = (allowNoTenant) =>
  asyncHandler(async (req, res, next) => {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      res.status(401);
      throw new Error("Not authorized");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch {
      res.status(401);
      throw new Error("Not authorized");
    }

    const user = await User.findById(decoded.id).select("-password");
    // A password change/reset bumps tokenVersion, which retires every token issued before it.
    if (!user || decoded.purpose || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
      res.status(401);
      throw new Error("Not authorized");
    }

    if (user.status === "inactive") {
      res.status(403);
      throw new Error("Account is deactivated. Contact your administrator.");
    }

    if (
      user.role !== "super_admin" &&
      !user.tenantId &&
      allowNoTenant &&
      user.role === "tenant_owner"
    ) {
      req.user = user;
      return next();
    }

    if (user.role !== "super_admin") {
      if (!user.tenantId) {
        res.status(403);
        throw new Error("No organisation associated with this account");
      }
      const tenant = await Tenant.findById(user.tenantId).select(
        "status planExpiresAt rolePermissions",
      );
      if (!tenant || tenant.status !== "active") {
        res.status(403);
        throw new Error("Your organisation's account is not active");
      }
      req.planExpired = !!(
        tenant.planExpiresAt && tenant.planExpiresAt < new Date()
      );
      req.rolePages = effectivePages(user.role, tenant.rolePermissions);
    } else {
      req.rolePages = PAGE_KEYS; // platform super admin
    }

    req.user = user;
    next();
  });

const protect = authenticate(false);
const protectAccount = authenticate(true);

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403);
      throw new Error("You do not have permission to perform this action");
    }
    next();
  };
};

// Data routes need a live plan; auth/me and billing deliberately skip this so an
// expired tenant can still sign in and pay.
const requirePlan = (req, res, next) => {
  if (req.planExpired) {
    res.status(402);
    throw new Error("Your plan has expired. Please renew to continue.");
  }
  next();
};

// Clinical staff vs. front-desk vs. owners. Patients have no tenant-wide access.
const STAFF = [
  "super_admin",
  "tenant_owner",
  "hospital_admin",
  "doctor",
  "nurse",
  "receptionist",
  "pharmacist",
  "lab_technician",
  "billing_executive",
  "staff",
];
const FRONT_DESK = [
  "super_admin",
  "tenant_owner",
  "hospital_admin",
  "doctor",
  "nurse",
  "receptionist",
];
const ADMINS = ["super_admin", "tenant_owner", "hospital_admin"];

// Per-organisation page gate (Settings -> Role permissions). Sits on top of authorize(): both must pass.
// readKeys: any of these pages may read; writeKeys (default: same) are needed for POST/PUT/PATCH/DELETE.
const pageAccess =
  (readKeys, writeKeys = readKeys) =>
  (req, res, next) => {
    const keys = ["GET", "HEAD", "OPTIONS"].includes(req.method)
      ? readKeys
      : writeKeys;
    if (![].concat(keys).some((k) => canOpen(req.rolePages, k))) {
      res.status(403);
      throw new Error(
        "Your role does not have access to this section. Ask your administrator.",
      );
    }
    next();
  };

module.exports = {
  protect,
  protectAccount,
  authorize,
  requirePlan,
  pageAccess,
  STAFF,
  FRONT_DESK,
  ADMINS,
};
