const asyncHandler = require("express-async-handler");
const validator = require("validator");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const StaffProfile = require("../models/StaffProfile");
const { pick } = require("../utils/pick");

// Roles an owner may hand out. Owners/super admins/patients are never created here.
const ASSIGNABLE = [
  "hospital_admin",
  "doctor",
  "nurse",
  "receptionist",
  "pharmacist",
  "lab_technician",
  "billing_executive",
  "staff",
];

const PROFILE_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "profileImage",
  "gender",
  "dateOfBirth",
  "bloodGroup",
  "maritalStatus",
  "contact",
  "address",
  "emergencyContact",
  "employment",
  "professional",
  "identity",
  "bank",
  "notes",
];
// Never sent in list responses: heavy (photo) or sensitive (bank / ID numbers).
const LIST_HIDE = "-profileImage -bank -identity -notes";

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

const merge = (u, p, photo) => ({
  _id: u._id,
  name: p ? p.name : u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  phone: u.phone,
  createdAt: u.createdAt,
  staffId: p?.staffId,
  designation: p?.employment?.designation,
  department: p?.employment?.department,
  employmentType: p?.employment?.employmentType,
  joiningDate: p?.employment?.joiningDate,
  hasProfile: !!p,
  hasPhoto: !!photo,
  photoV: photo ? photo.getTime() : undefined,
});

const getAll = asyncHandler(async (req, res) => {
  const [users, profiles, withPhoto] = await Promise.all([
    User.find({ tenantId: req.tenantId, role: { $ne: "patient" } })
      .select("name email role status phone createdAt")
      .sort({ createdAt: 1 }),
    StaffProfile.find({ tenantId: req.tenantId }).select(LIST_HIDE),
    StaffProfile.find({
      tenantId: req.tenantId,
      profileImage: { $nin: ["", null] },
    }).select("userId updatedAt"),
  ]);
  const photoAt = new Map(
    withPhoto.map((p) => [String(p.userId), p.updatedAt]),
  );
  const byUser = new Map(profiles.map((p) => [String(p.userId), p]));
  const data = users.map((u) =>
    merge(u, byUser.get(String(u._id)), photoAt.get(String(u._id))),
  );
  res.json({ success: true, count: data.length, data });
});

const getOne = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    role: { $ne: "patient" },
  });
  if (!user) fail(res, 404, "User not found");
  const profile = await StaffProfile.findOne({
    tenantId: req.tenantId,
    userId: user._id,
  });
  res.json({ success: true, data: { ...merge(user, profile), profile } });
});

const create = asyncHandler(async (req, res) => {
  const { role, password } = req.body;
  const body = pick(req.body, PROFILE_FIELDS);
  const email = validator.normalizeEmail(String(req.body.email || "")) || "";
  if (!body.firstName || !body.lastName)
    fail(res, 400, "First and last name are required");
  if (!validator.isEmail(email))
    fail(res, 400, "A valid login email is required");
  if (!ASSIGNABLE.includes(role)) fail(res, 400, "Invalid role");
  if (!body.contact?.phone) fail(res, 400, "Mobile number is required");
  if (
    !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(String(password || ""))
  ) {
    fail(
      res,
      400,
      "Password must be at least 8 characters with uppercase, lowercase and a number",
    );
  }
  const [tenant, count, exists] = await Promise.all([
    Tenant.findById(req.tenantId).select("limits"),
    User.countDocuments({ tenantId: req.tenantId }),
    User.exists({ email }),
  ]);
  if (exists) fail(res, 400, "An account with that email already exists");
  const cap = tenant && tenant.limits && tenant.limits.userLimit;
  if (cap && count >= cap)
    fail(
      res,
      402,
      `Your plan allows ${cap} users. Upgrade in Billing to add more.`,
    );

  const fullName = [body.firstName, body.middleName, body.lastName]
    .filter(Boolean)
    .join(" ")
    .slice(0, 100);
  // Validate the profile before touching counters or creating the login.
  const profile = new StaffProfile({
    ...body,
    tenantId: req.tenantId,
    staffId: "pending",
    userId: req.user._id,
    createdBy: req.user._id,
  });
  await profile.validate();

  const user = await User.create({
    name: fullName,
    email,
    password,
    role,
    phone: String(body.contact.phone).replace(/\D/g, "").slice(-10),
    status: req.body.status === "inactive" ? "inactive" : "active",
    tenantId: req.tenantId,
  });
  try {
    const t = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $inc: { "counters.staff": 1 } },
      { new: true },
    ).select("counters");
    profile.userId = user._id;
    profile.staffId = `ST-${String(t.counters.staff).padStart(4, "0")}`;
    await profile.save();
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // no orphan login
    throw err;
  }
  res.status(201).json({ success: true, data: merge(user, profile) });
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!user) fail(res, 404, "User not found");
  if (!ASSIGNABLE.includes(user.role))
    fail(res, 403, "This account's role cannot be changed here");
  if (req.body.role !== undefined) {
    if (!ASSIGNABLE.includes(req.body.role)) fail(res, 400, "Invalid role");
    user.role = req.body.role;
  }
  if (["active", "inactive"].includes(req.body.status))
    user.status = req.body.status;

  const patch = pick(req.body, PROFILE_FIELDS);
  let profile = null;
  if (Object.keys(patch).length) {
    profile = await StaffProfile.findOne({
      tenantId: req.tenantId,
      userId: user._id,
    });
    if (!profile) fail(res, 404, "This account has no staff profile to edit");
    profile.set(patch);
    await profile.save();
    user.name = profile.name.slice(0, 100);
    if (patch.contact?.phone)
      user.phone = String(patch.contact.phone).replace(/\D/g, "").slice(-10);
  }
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: merge(user, profile) });
});

// DELETE /:id: removes the login and its staff profile. Owners/admins-of-record and yourself are protected;
// deactivating (PUT status) stays the right choice when you only want to revoke access.
const remove = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id))
    fail(res, 400, "You cannot delete your own account");
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!user) fail(res, 404, "User not found");
  if (!ASSIGNABLE.includes(user.role))
    fail(res, 403, "This account cannot be deleted here");
  await Promise.all([
    StaffProfile.deleteOne({ tenantId: req.tenantId, userId: user._id }),
    // a doctor profile that pointed at this login keeps its record, just unlinked
    require("../models/Doctor").updateMany(
      { tenantId: req.tenantId, userId: user._id },
      { $set: { userId: null } },
    ),
    User.deleteOne({ _id: user._id }),
  ]);
  res.json({ success: true, data: {} });
});

// Random temporary password that always satisfies the password policy.
const tempPassword = () => require("../utils/passwordPolicy").generatePassword(12);
const resetPassword = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id))
    fail(res, 400, "Change your own password from Settings");
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!user) fail(res, 404, "User not found");
  if (!ASSIGNABLE.includes(user.role))
    fail(res, 403, "This account's password cannot be reset here");
  if (user.role === "hospital_admin" && req.user.role !== "tenant_owner")
    fail(res, 403, "Only the owner can reset an admin's password");
  const password = req.body.password
    ? String(req.body.password)
    : tempPassword();
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(password)) {
    fail(
      res,
      400,
      "Password must be at least 8 characters with uppercase, lowercase and a number",
    );
  }
  user.password = password; // the pre-save hook bumps tokenVersion, which signs the person out everywhere
  user.resetPasswordTokenHash = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({
    success: true,
    data: { password, email: user.email, name: user.name },
  });
});

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  resetPassword,
  ASSIGNABLE,
};
