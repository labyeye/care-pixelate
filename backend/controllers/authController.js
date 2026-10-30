const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const { clinicCodeError } = require("../utils/clinicCode");
const { effectivePages, PAGE_KEYS } = require("../utils/permissions");
const { assertWithinLimit } = require("../utils/limits");
const Subscription = require("../models/Subscription");
const { TRIAL } = require("../utils/pricing");
const mongoose = require("mongoose");
const totp = require("../utils/totp");
const { sendWhatsAppOtp, sendPasswordResetEmail, sendSecurityAlertEmail } = require("../utils/notify");

const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

// `tv` = token version (see User.tokenVersion); `ssa` = when the login happened, kept across refreshes so a
// stolen cookie can't be refreshed forever.
const SESSION_MAX_MS = (Number(process.env.SESSION_MAX_HOURS) || 24) * 60 * 60 * 1000;
const signToken = (user, ssa = Math.floor(Date.now() / 1000)) =>
  jwt.sign({ id: user._id, tv: user.tokenVersion || 0, ssa }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "15m",
    algorithm: "HS256",
  });

// Valid bcrypt hash used only to burn the same time as a real comparison when the e-mail is unknown.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.G1c/3d1Hn5X9lq0Yx1y6k8mQ5G1e";

// OTPs are HMAC-keyed with the server secret (a leaked DB can't be reversed offline: 6 digits = 10^6 guesses) and
// compared in constant time.
const otpHash = (otp) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`otp:${otp}`).digest("hex");
const sameHash = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const MAX_OTP_TRIES = 5;
// 3 wrong passwords (or 2FA codes) are allowed; the 4th wrong one locks the account for 30 min.
// A WhatsApp OTP login (loginVerifyOtp) lifts the lock.
const MAX_LOGIN_FAILS = 4;
const LOGIN_LOCK_MS = 30 * 60 * 1000;
const LOCKED_MSG = "Account locked for 30 minutes after too many wrong passwords. Unlock it now with a WhatsApp OTP.";

const setAuthCookies = (res, token) => {
  const csrfToken = crypto.randomBytes(24).toString("hex");
  const isProd = process.env.NODE_ENV === "production";

  // COOKIE_DOMAIN=.pixelatenest.com when the web app and the API sit on different subdomains; without it the
  // csrf cookie belongs to the API host only and the page's JS cannot read it -> "Invalid or missing CSRF token".
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: ACCESS_COOKIE_MAX_AGE,
    domain,
  });
  res.cookie("csrf_token", csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    maxAge: ACCESS_COOKIE_MAX_AGE,
    domain,
  });
};

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Match however the number was typed (10 digits, +91, 91 prefix).
const phoneVariants = (raw) => {
  const n = String(raw || "")
    .replace(/\D/g, "")
    .slice(-10);
  return [n, `+91${n}`, `91${n}`];
};
const waNumber = (raw) => `91${String(raw).replace(/\D/g, "").slice(-10)}`;

// Short-lived token proving the password step passed; exchanged for a
// session once the authenticator code checks out.
// Signed with a derived secret so `protect` can never accept it as an access token.
const pendingSecret = () => `${process.env.JWT_SECRET}:2fa`;
const signPending = (id) =>
  jwt.sign({ id, purpose: "2fa" }, pendingSecret(), { expiresIn: "5m" });

const sendSession = (req, res, user) => {
  require("../utils/devices").noteSignIn(req, user);
  const token = signToken(user);
  setAuthCookies(res, token);
  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      token, // mobile clients have no cookie jar for httpOnly cookies — store this as a Bearer token instead
    },
  });
};

const assertActive = (res, user) => {
  if (user.status === "inactive") {
    res.status(403);
    throw new Error("Account is deactivated. Contact your administrator.");
  }
};

// @desc    Register a new organisation + its owner user
// @route   POST /api/auth/register-tenant
const registerTenant = asyncHandler(async (req, res) => {
  const { orgName, orgType, ownerName, password, phone, city, state, gstin } =
    req.body;
  const doctorCount = Math.min(
    Math.max(parseInt(req.body.doctorCount, 10) || 1, 1),
    1000,
  );

  if (
    !orgName ||
    !orgType ||
    !ownerName ||
    !req.body.email ||
    !password ||
    !phone
  ) {
    res.status(400);
    throw new Error(
      "Organisation, your name, email, phone and password are required",
    );
  }
  if (!Tenant.schema.path("orgType").enumValues.includes(orgType)) {
    res.status(400);
    throw new Error("Invalid organisation type");
  }
  if (req.body.acceptTerms !== true) {
    res.status(400);
    throw new Error("Please accept the Terms and Privacy Policy");
  }

  const email =
    validator.normalizeEmail(String(req.body.email)) ||
    String(req.body.email).toLowerCase().trim();
  if (!validator.isEmail(email)) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }
  const phone10 = String(phone).replace(/\D/g, "").slice(-10);
  if (phone10.length !== 10) {
    res.status(400);
    throw new Error("Enter a valid 10-digit phone number");
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(String(password))) {
    res.status(400);
    throw new Error(
      "Password must be at least 8 characters with uppercase, lowercase and a number",
    );
  }
  const owner = String(ownerName).trim();
  const org = String(orgName).trim();
  if (
    owner.length < 2 ||
    owner.length > 80 ||
    org.length < 2 ||
    org.length > 120
  ) {
    res.status(400);
    throw new Error(
      "Name (2-80) and organisation name (2-120) have invalid lengths",
    );
  }

  if (await User.findOne({ email })) {
    res.status(400);
    throw new Error("An account with that email already exists");
  }

  // Pre-generate the owner id so the slug suffix can't collide, and so we can roll back by id.
  const userId = new mongoose.Types.ObjectId();
  const slug = `${slugify(org) || "org"}-${userId.toString().slice(-6)}`;

  const user = await User.create({
    _id: userId,
    name: owner,
    email,
    password,
    role: "tenant_owner",
    phone: phone10,
  });

  let tenant;
  try {
    tenant = await Tenant.create({
      name: org,
      slug,
      orgType,
      ownerUser: user._id,
      contact: {
        email,
        phone: phone10,
        city: String(city || "").trim(),
        state: String(state || "").trim(),
      },
      gstDetails: {
        gstin: String(gstin || "")
          .trim()
          .toUpperCase(),
      },
      limits: {
        doctorLimit: TRIAL.doctorLimit,
        patientLimit: TRIAL.patientLimit,
      },
      planExpiresAt: new Date(Date.now() + TRIAL.days * 24 * 60 * 60 * 1000),
      profile: { expectedDoctors: doctorCount, termsAcceptedAt: new Date() },
    });
    user.tenantId = tenant._id;
    await user.save({ validateBeforeSave: false });
    await Subscription.create({
      tenant: tenant._id,
      plan: "trial",
      status: "trialing",
      doctors: TRIAL.doctorLimit,
      currentPeriodEnd: tenant.planExpiresAt,
    });
  } catch (err) {
    // No replica-set transactions on the shared Mongo; undo manually so no orphan user/tenant is left.
    await Promise.allSettled([
      User.deleteOne({ _id: userId }),
      tenant && Tenant.deleteOne({ _id: tenant._id }),
    ]);
    throw err;
  }

  const token = signToken(user);
  setAuthCookies(res, token);

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: tenant._id,
      },
      tenant,
      token, // mobile clients have no cookie jar for httpOnly cookies — store this as a Bearer token instead
    },
  });
});

// @desc    Step 1 of onboarding: create the owner account only (no organisation yet)
// @route   POST /api/auth/register
const registerAccount = asyncHandler(async (req, res) => {
  const { name, password, phone } = req.body;
  const fail = (msg) => {
    res.status(400);
    throw new Error(msg);
  };
  if (!name || !req.body.email || !password || !phone)
    fail("Name, email, mobile number and password are required");
  if (req.body.acceptTerms !== true)
    fail("Please accept the Terms and Privacy Policy");

  const email =
    validator.normalizeEmail(String(req.body.email)) ||
    String(req.body.email).toLowerCase().trim();
  if (!validator.isEmail(email)) fail("Please provide a valid email address");
  const phone10 = String(phone).replace(/\D/g, "").slice(-10);
  if (phone10.length !== 10) fail("Enter a valid 10-digit phone number");
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(String(password))) {
    fail(
      "Password must be at least 8 characters with uppercase, lowercase and a number",
    );
  }
  const owner = String(name).trim();
  if (owner.length < 2 || owner.length > 80)
    fail("Name must be 2-80 characters");
  if (await User.findOne({ email }))
    fail("An account with that email already exists");

  const user = await User.create({
    name: owner,
    email,
    password,
    role: "tenant_owner",
    phone: phone10,
  });
  sendSession(req, res.status(201), user);
});

// @desc    Final onboarding step: create the organisation (14-day trial) for a tenant-less owner
// @route   POST /api/auth/onboard
const onboard = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const fail = (msg, code = 400) => {
    res.status(code);
    throw new Error(msg);
  };
  if (user.tenantId) fail("Your organisation is already set up", 409);

  const { orgName, orgType, city, state, gstin } = req.body;
  const doctorCount = Math.min(
    Math.max(parseInt(req.body.doctorCount, 10) || 1, 1),
    1000,
  );
  const org = String(orgName || "").trim();
  if (org.length < 2 || org.length > 120)
    fail("Organisation name must be 2-120 characters");
  if (!Tenant.schema.path("orgType").enumValues.includes(orgType))
    fail("Invalid organisation type");
  if (!String(city || "").trim() || !String(state || "").trim())
    fail("City and state are required");
  const gst = String(gstin || "")
    .trim()
    .toUpperCase();
  if (gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst))
    fail("Invalid GSTIN format");

  // Solo practitioner: the owner is also the doctor, so the registration details are needed now.
  const solo = orgType === "individual_doctor";
  const regNo = String(req.body.registrationNumber || "").trim();
  const council = String(req.body.registrationCouncil || "").trim();
  if (
    solo &&
    (regNo.length < 2 ||
      regNo.length > 40 ||
      council.length < 2 ||
      council.length > 100)
  ) {
    fail(
      "Medical registration number and council are required for an individual doctor",
    );
  }
  const fee = Number(req.body.consultationFee ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || fee > 100000)
    fail("Consultation fee must be a valid amount");

  // Optional custom clinic code (what patients type in the app); otherwise a derived, collision-free one.
  let slug = `${slugify(org) || "org"}-${user._id.toString().slice(-6)}`;
  const wanted = String(req.body.clinicCode || "")
    .trim()
    .toLowerCase();
  if (wanted) {
    const bad = clinicCodeError(wanted);
    if (bad) fail(bad);
    if (await Tenant.exists({ slug: wanted }))
      fail("That clinic code is already taken", 409);
    slug = wanted;
  }

  let tenant;
  let doctor;
  try {
    tenant = await Tenant.create({
      name: org,
      slug,
      orgType,
      ownerUser: user._id,
      contact: {
        email: user.email,
        phone: user.phone,
        city: String(city).trim(),
        state: String(state).trim(),
      },
      gstDetails: { gstin: gst },
      limits: {
        doctorLimit: TRIAL.doctorLimit,
        patientLimit: TRIAL.patientLimit,
      },
      planExpiresAt: new Date(Date.now() + TRIAL.days * 24 * 60 * 60 * 1000),
      profile: {
        expectedDoctors: solo ? 1 : doctorCount,
        termsAcceptedAt: new Date(),
      },
      ...(solo && { counters: { doctor: 1 } }),
    });
    if (solo) {
      const parts = user.name
        .replace(/^dr\.?\s+/i, "")
        .trim()
        .split(/\s+/);
      doctor = await Doctor.create({
        tenantId: tenant._id,
        doctorId: "DR-0001",
        userId: user._id,
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(" "),
        lastName: parts.length > 1 ? parts[parts.length - 1] : "-",
        contact: { phone: user.phone, email: user.email },
        professionalDetails: {
          registrationNumber: regNo,
          registrationCouncil: council,
        },
        consultation: {
          consultationFee: fee,
          consultationModes: ["in_person"],
        },
        createdBy: user._id,
      });
    }
    user.tenantId = tenant._id;
    await user.save({ validateBeforeSave: false });
    await Subscription.create({
      tenant: tenant._id,
      plan: "trial",
      status: "trialing",
      doctors: TRIAL.doctorLimit,
      currentPeriodEnd: tenant.planExpiresAt,
    });
  } catch (err) {
    user.tenantId = null;
    await Promise.allSettled([
      tenant && Tenant.deleteOne({ _id: tenant._id }),
      doctor && Doctor.deleteOne({ _id: doctor._id }),
    ]);
    throw err;
  }
  res.status(201).json({ success: true, data: { tenant, doctor } });
});

// @desc    Public: confirm a clinic code before the patient signs up
// @route   GET /api/auth/clinic/:slug
const clinicLookup = asyncHandler(async (req, res) => {
  const t = await Tenant.findOne({
    slug: String(req.params.slug).toLowerCase(),
    status: "active",
  }).select("name branding.appName branding.logoUrl");
  if (!t) {
    res.status(404);
    throw new Error("Clinic not found. Check the clinic code.");
  }
  res.json({
    success: true,
    data: {
      name: t.name,
      appName: t.branding.appName,
      logoUrl: t.branding.logoUrl,
    },
  });
});

// @desc    Patient self-signup into an existing clinic (creates login + own patient profile)
// @route   POST /api/auth/register-patient
const registerPatient = asyncHandler(async (req, res) => {
  const { clinicCode, name, password, phone, dob, gender } = req.body;
  const fail = (code, msg) => {
    res.status(code);
    throw new Error(msg);
  };
  if (!clinicCode || !name || !req.body.email || !phone || !password) {
    fail(400, "Clinic code, name, email, phone and password are required");
  }
  if (req.body.acceptTerms !== true)
    fail(400, "Please accept the Terms and Privacy Policy");
  const email =
    validator.normalizeEmail(String(req.body.email)) ||
    String(req.body.email).toLowerCase().trim();
  if (!validator.isEmail(email))
    fail(400, "Please provide a valid email address");
  const phone10 = String(phone).replace(/\D/g, "").slice(-10);
  if (phone10.length !== 10) fail(400, "Enter a valid 10-digit phone number");
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(String(password))) {
    fail(
      400,
      "Password must be at least 8 characters with uppercase, lowercase and a number",
    );
  }
  const person = String(name).trim();
  if (person.length < 2 || person.length > 80)
    fail(400, "Name must be between 2 and 80 characters");
  if (!["male", "female", "other", "undisclosed"].includes(gender))
    fail(400, "Gender is required");
  if (
    !dob ||
    Number.isNaN(new Date(dob).getTime()) ||
    new Date(dob) > new Date()
  )
    fail(400, "A valid date of birth is required");
  const [firstName, ...rest] = person.split(/\s+/);
  if (!rest.length) fail(400, "Enter your first and last name");

  const tenant = await Tenant.findOne({
    slug: String(clinicCode).toLowerCase().trim(),
    status: "active",
  });
  if (!tenant || (tenant.planExpiresAt && tenant.planExpiresAt < new Date())) {
    fail(404, "Clinic not found or not accepting new patients");
  }
  if (await User.findOne({ email }))
    fail(400, "An account with that email already exists");

  req.tenantId = tenant._id;
  await assertWithinLimit(
    req,
    res,
    "patientLimit",
    () => Patient.countDocuments({ tenantId: tenant._id }),
    "patients",
  );

  const userId = new mongoose.Types.ObjectId();
  const user = await User.create({
    _id: userId,
    name: person,
    email,
    password,
    role: "patient",
    phone: phone10,
    tenantId: tenant._id,
  });
  try {
    const t = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $inc: { "counters.patient": 1 } },
      { new: true },
    ).select("counters");
    await Patient.create({
      tenantId: tenant._id,
      userId,
      registeredBy: userId,
      firstName,
      lastName: rest.join(" "),
      contact: { phone: phone10, email },
      dateOfBirth: new Date(dob),
      gender,
      patientId: `NC-${String(t.counters.patient).padStart(5, "0")}`,
    });
  } catch (err) {
    await User.deleteOne({ _id: userId });
    throw err;
  }

  const token = signToken(user);
  setAuthCookies(res, token);
  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: tenant._id,
      },
      tenant: { _id: tenant._id, name: tenant.name, branding: tenant.branding },
      token,
    },
  });
});

// @desc    Login (returns requires2FA + pendingToken when TOTP is enabled)
// @route   POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
  if (user && user.lockUntil && user.lockUntil > new Date()) {
    res.status(429);
    throw new Error(LOCKED_MSG);
  }
  // Compare against a dummy hash for unknown e-mails so the response time doesn't reveal whether one exists.
  const passwordOk = user
    ? await user.matchPassword(password)
    : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!passwordOk) {
    if (user) {
      const locked = (user.failedLogins || 0) + 1 >= MAX_LOGIN_FAILS;
      await User.updateOne(
        { _id: user._id },
        locked
          ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOGIN_LOCK_MS) } }
          : { $inc: { failedLogins: 1 } },
      );
      if (locked) {
        res.status(429);
        throw new Error(LOCKED_MSG);
      }
    }
    res.status(401);
    throw new Error("Invalid email or password");
  }

  assertActive(res, user);
  if (user.failedLogins || user.lockUntil) {
    await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockUntil: 1 } });
  }

  if (user.totpEnabled) {
    return res.json({
      success: true,
      data: { requires2FA: true, pendingToken: signPending(user._id) },
    });
  }

  sendSession(req, res, user);
});

// @desc    Finish login for a 2FA-enabled account
// @route   POST /api/auth/2fa/verify
const verify2FA = asyncHandler(async (req, res) => {
  const { pendingToken, token } = req.body;
  let decoded;
  try {
    decoded = jwt.verify(pendingToken, pendingSecret());
  } catch {
    decoded = null;
  }
  if (!decoded || decoded.purpose !== "2fa") {
    res.status(401);
    throw new Error("Session expired. Please sign in again.");
  }
  const user = await User.findById(decoded.id).select("+totpSecret");
  if (user && user.lockUntil && user.lockUntil > new Date()) {
    res.status(429);
    throw new Error(LOCKED_MSG);
  }
  if (!user || !user.totpEnabled || !totp.verifyToken(token, user.totpSecret)) {
    // Wrong codes count towards the same lock as wrong passwords (a 6-digit code is guessable otherwise).
    if (user) {
      const locked = (user.failedLogins || 0) + 1 >= MAX_LOGIN_FAILS;
      await User.updateOne(
        { _id: user._id },
        locked
          ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOGIN_LOCK_MS) } }
          : { $inc: { failedLogins: 1 } },
      );
      if (locked) {
        res.status(429);
        throw new Error(LOCKED_MSG);
      }
    }
    res.status(401);
    throw new Error("Invalid authenticator code");
  }
  assertActive(res, user);
  sendSession(req, res, user);
});

// @desc    Get current authenticated user + tenant
// @route   GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = req.user;
  let tenant = null;
  if (user.tenantId) {
    tenant = await Tenant.findById(user.tenantId);
  }
  const pages =
    user.role === "super_admin"
      ? PAGE_KEYS
      : effectivePages(user.role, tenant && tenant.rolePermissions);
  res.json({ success: true, data: { user, tenant, pages } });
});

// @desc    Refresh the access token cookie
// @route   POST /api/auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies && req.cookies.access_token;
  if (!token) {
    res.status(401);
    throw new Error("Not authorized");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      clockTolerance: 60 * 60,
      algorithms: ["HS256"],
    });
  } catch {
    res.status(401);
    throw new Error("Not authorized");
  }

  const user = await User.findById(decoded.id);
  if (
    !user ||
    user.status === "inactive" ||
    decoded.purpose ||
    (decoded.tv || 0) !== (user.tokenVersion || 0) ||
    // The sliding refresh has a ceiling: after SESSION_MAX_HOURS the person signs in again.
    Date.now() - (Number(decoded.ssa) || 0) * 1000 > SESSION_MAX_MS
  ) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const newToken = signToken(user, decoded.ssa);
  setAuthCookies(res, newToken);

  res.json({ success: true, data: { refreshed: true } });
});

// @desc    Logout — clear auth cookies
// @route   POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  res.clearCookie("access_token", { domain: process.env.COOKIE_DOMAIN || undefined });
  res.clearCookie("csrf_token", { domain: process.env.COOKIE_DOMAIN || undefined });
  res.json({ success: true, data: {} });
});

// @desc    Email a password-reset link (generic response — no enumeration)
// @route   POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || !validator.isEmail(String(email))) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }
  const user = await User.findOne({
    email: String(email).toLowerCase().trim(),
  });
  if (user) {
    const raw = crypto.randomBytes(32).toString("hex");
    user.resetPasswordTokenHash = sha256(raw);
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    const base = process.env.CLIENT_URL || "http://localhost:8080";
    try {
      await sendPasswordResetEmail({
        to: user.email,
        userName: user.name,
        resetUrl: `${base}/reset-password/${raw}`,
      });
    } catch (err) {
      console.error("Password reset email failed:", err.message);
    }
  }
  res.json({
    success: true,
    data: {},
    message: "If an account exists for that email, a reset link has been sent.",
  });
});

// @route   POST /api/auth/reset-password/:token
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(String(password || ""))) {
    res.status(400);
    throw new Error("Password must be at least 8 characters with uppercase, lowercase and a number");
  }
  const user = await User.findOne({
    resetPasswordTokenHash: sha256(req.params.token),
    resetPasswordExpires: { $gt: new Date() },
  }).select("+resetPasswordTokenHash +resetPasswordExpires");
  if (!user) {
    res.status(400);
    throw new Error("This reset link is invalid or has expired");
  }
  user.password = password;
  user.resetPasswordTokenHash = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.clearCookie("access_token", { domain: process.env.COOKIE_DOMAIN || undefined });
  res.clearCookie("csrf_token", { domain: process.env.COOKIE_DOMAIN || undefined });
  res.json({
    success: true,
    data: {},
    message: "Password reset. Please sign in.",
  });
});

// --- Passwordless login via WhatsApp OTP (phone must be verified) ---

// @route   POST /api/auth/login/otp/send
const loginRequestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    res.status(400);
    throw new Error("Phone number is required");
  }
  // Several people can share one number (father + daughter, spouses…): every matching active account is
  // eligible. Patient accounts may use OTP login without a prior verification — receiving the code on the
  // phone IS the proof, and a successful login below marks the number verified. Staff still need a verified phone.
  const users = await User.find({
    phone: { $in: phoneVariants(phone) },
    status: { $ne: "inactive" },
    $or: [{ phoneVerified: true }, { role: "patient" }],
  })
    .select("_id phone")
    .limit(10);
  if (users.length) {
    const otp = generateOtp();
    // One code for the number; whoever it reaches picks the account after verifying it.
    await User.updateMany(
      { _id: { $in: users.map((u) => u._id) } },
      {
        $set: {
          loginOtpHash: otpHash(otp),
          loginOtpExpires: new Date(Date.now() + TEN_MIN),
          loginOtpTries: 0,
        },
      },
    );
    try {
      await sendWhatsAppOtp(waNumber(users[0].phone), otp);
    } catch (err) {
      console.error("Login OTP send failed:", err.message);
    }
  }
  res.json({
    success: true,
    data: {},
    message: "If that number is registered, an OTP has been sent.",
  });
});

// Short-lived proof that the caller passed the OTP for these accounts; lets them choose among them.
const selectSecret = () => `${process.env.JWT_SECRET}:select`;
const signSelect = (ids) =>
  jwt.sign({ ids: ids.map(String), purpose: "select" }, selectSecret(), {
    expiresIn: "5m",
  });

const maskEmail = (e) => {
  const [n = "", d = ""] = String(e || "").split("@");
  return n
    ? `${n[0]}${"*".repeat(Math.max(1, Math.min(n.length - 1, 5)))}@${d}`
    : "";
};
const ageOf = (dob) =>
  dob
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000),
      )
    : null;

// What the picker shows: enough to tell a father from a daughter, nothing clinical.
async function buildChoices(users) {
  const tenants = new Map(
    (
      await Tenant.find({
        _id: { $in: users.map((u) => u.tenantId).filter(Boolean) },
      }).select("name branding.appName")
    ).map((t) => [String(t._id), t]),
  );
  return Promise.all(
    users.map(async (u) => {
      const t = u.tenantId ? tenants.get(String(u.tenantId)) : null;
      const base = {
        userId: u._id,
        name: u.name,
        role: u.role,
        email: maskEmail(u.email),
        clinic: t ? t.branding?.appName || t.name : "",
      };
      if (u.role !== "patient") return base;
      const p = await Patient.findOne({ userId: u._id, tenantId: u.tenantId })
        .sort({ createdAt: 1 })
        .select("patientId firstName lastName dateOfBirth gender");
      return {
        ...base,
        name: p ? p.name : u.name,
        patientId: p?.patientId,
        age: p ? ageOf(p.dateOfBirth) : null,
        gender: p?.gender,
      };
    }),
  );
}

// @route   POST /api/auth/login/otp/verify
// One matching account -> logged in. Several (shared phone) -> { requiresSelection, selectionToken, choices }.
const loginVerifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    res.status(400);
    throw new Error("Phone and OTP are required");
  }
  const candidates = await User.find({
    phone: { $in: phoneVariants(phone) },
    loginOtpExpires: { $gt: new Date() },
    loginOtpHash: { $exists: true },
  }).select("+loginOtpHash +loginOtpTries");
  const given = otpHash(String(otp));
  const matched = candidates.filter((u) => sameHash(u.loginOtpHash, given));
  if (!matched.length) {
    // Count the miss against every account the code was issued to; the 5th miss burns the code.
    if (candidates.length) {
      await User.updateMany({ _id: { $in: candidates.map((u) => u._id) } }, { $inc: { loginOtpTries: 1 } });
      const burnt = candidates.filter((u) => (u.loginOtpTries || 0) + 1 >= MAX_OTP_TRIES).map((u) => u._id);
      if (burnt.length) {
        await User.updateMany({ _id: { $in: burnt } }, { $unset: { loginOtpHash: 1, loginOtpExpires: 1 } });
      }
    }
    res.status(401);
    throw new Error("Invalid or expired OTP");
  }
  // The code is single-use for every account it was issued to; patients just proved they hold the phone.
  await User.updateMany(
    { _id: { $in: matched.map((u) => u._id) } },
    { $set: { failedLogins: 0 }, $unset: { loginOtpHash: 1, loginOtpExpires: 1, lockUntil: 1 } },
  );
  await User.updateMany(
    {
      _id: {
        $in: matched.filter((u) => u.role === "patient").map((u) => u._id),
      },
    },
    { $set: { phoneVerified: true } },
  );

  const active = matched.filter((u) => u.status !== "inactive");
  if (!active.length) {
    res.status(403);
    throw new Error("Account is deactivated. Contact your administrator.");
  }
  // The WhatsApp OTP is itself the second factor; TOTP isn't asked again.
  if (active.length === 1) return sendSession(req, res, active[0]);
  res.json({
    success: true,
    data: {
      requiresSelection: true,
      selectionToken: signSelect(active.map((u) => u._id)),
      choices: await buildChoices(active),
    },
  });
});

// @route   POST /api/auth/login/select { selectionToken, userId } — finish a shared-phone login.
const loginSelect = asyncHandler(async (req, res) => {
  let decoded;
  try {
    decoded = jwt.verify(String(req.body.selectionToken || ""), selectSecret());
  } catch {
    decoded = null;
  }
  if (!decoded || decoded.purpose !== "select") {
    res.status(401);
    throw new Error("Your sign-in expired. Please request a new OTP.");
  }
  if (!decoded.ids.includes(String(req.body.userId))) {
    res.status(403);
    throw new Error("That account is not linked to this sign-in");
  }
  const user = await User.findById(req.body.userId);
  if (!user) {
    res.status(404);
    throw new Error("Account not found");
  }
  assertActive(res, user);
  sendSession(req, res, user);
});

// --- Account security (authenticated) ---

// @route   POST /api/auth/phone/send-otp
const sendPhoneOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone || String(phone).replace(/\D/g, "").length < 10) {
    res.status(400);
    throw new Error("Enter a valid phone number");
  }
  const otp = generateOtp();
  await User.findByIdAndUpdate(req.user._id, {
    phone: String(phone).replace(/\D/g, "").slice(-10),
    phoneVerified: false,
    phoneOtpHash: otpHash(otp),
    phoneOtpExpires: new Date(Date.now() + TEN_MIN),
    phoneOtpTries: 0,
  });
  try {
    await sendWhatsAppOtp(waNumber(phone), otp);
  } catch (err) {
    res.status(502);
    throw new Error(`Could not send OTP: ${err.message}`);
  }
  res.json({ success: true, data: {}, message: "OTP sent to your WhatsApp" });
});

// @route   POST /api/auth/phone/verify-otp
const verifyPhoneOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "+phoneOtpHash +phoneOtpExpires +phoneOtpTries",
  );
  const { otp } = req.body;
  if (
    !otp ||
    !user.phoneOtpHash ||
    user.phoneOtpExpires < new Date() ||
    !sameHash(user.phoneOtpHash, otpHash(String(otp)))
  ) {
    if (user.phoneOtpHash) {
      user.phoneOtpTries = (user.phoneOtpTries || 0) + 1;
      if (user.phoneOtpTries >= MAX_OTP_TRIES) {
        user.phoneOtpHash = undefined;
        user.phoneOtpExpires = undefined;
      }
      await user.save({ validateBeforeSave: false });
    }
    res.status(400);
    throw new Error("Invalid or expired OTP");
  }
  user.phoneVerified = true;
  user.phoneOtpHash = undefined;
  user.phoneOtpExpires = undefined;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: {}, message: "Phone verified" });
});

// @route   POST /api/auth/2fa/totp/setup
const totpSetup = asyncHandler(async (req, res) => {
  // Re-running setup used to overwrite the secret and switch 2FA off without any code — a stolen session could
  // strip it. An enabled authenticator must be disabled (which needs a current code) before a new one is set up.
  if (req.user.totpEnabled) {
    res.status(409);
    throw new Error("Authenticator is already enabled. Disable it first to set up a new one.");
  }
  const secret = totp.generateSecret();
  await User.findByIdAndUpdate(req.user._id, {
    totpSecret: secret,
    totpEnabled: false,
  });
  res.json({
    success: true,
    data: { secret, ...(await totp.qrFor(req.user.email, secret)) },
  });
});

// @route   POST /api/auth/2fa/totp/verify
const totpVerifySetup = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+totpSecret");
  if (!user.totpSecret || !totp.verifyToken(req.body.token, user.totpSecret)) {
    res.status(400);
    throw new Error("Invalid authenticator code");
  }
  user.totpEnabled = true;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: {}, message: "Authenticator app enabled" });
});

// @route   POST /api/auth/2fa/totp/disable — needs a current code
const totpDisable = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+totpSecret");
  if (!user.totpEnabled || !totp.verifyToken(req.body.token, user.totpSecret)) {
    res.status(400);
    throw new Error("Invalid authenticator code");
  }
  user.totpEnabled = false;
  user.totpSecret = undefined;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: {}, message: "Authenticator app disabled" });
});

// @route   PUT /api/auth/change-password { currentPassword, newPassword }
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await User.findById(req.user._id).select("+password +passwordHistory");
  if (!currentPassword || !newPassword || !(await user.matchPassword(String(currentPassword)))) {
    res.status(400);
    throw new Error("Current password is incorrect");
  }
  user.password = String(newPassword); // policy + history are enforced by the model; the save bumps tokenVersion
  await user.save();
  sendSecurityAlertEmail({ to: user.email, name: user.name, what: "Your NestDoc password was just changed." }).catch(() => {});
  sendSession(req, res, user); // this device stays signed in, every other one is signed out
});

// @route   POST /api/auth/logout-all: signs every device out (this one too)
const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  res.clearCookie("access_token", { domain: process.env.COOKIE_DOMAIN || undefined });
  res.clearCookie("csrf_token", { domain: process.env.COOKIE_DOMAIN || undefined });
  res.json({ success: true, data: {} });
});

module.exports = {
  changePassword,
  logoutAll,
  registerTenant,
  registerAccount,
  onboard,
  registerPatient,
  clinicLookup,
  login,
  verify2FA,
  getMe,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  loginRequestOtp,
  loginVerifyOtp,
  loginSelect,
  sendPhoneOtp,
  verifyPhoneOtp,
  totpSetup,
  totpVerifySetup,
  totpDisable,
};
