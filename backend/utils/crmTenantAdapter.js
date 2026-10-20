// Adapter for tenant-based products (Nest Leads, Nest Gym, Nest Care) for utils/crmAccounts.js.
// Account = Tenant (plan, planExpiresAt, status, limits.*), logins = User { tenantId }, owner = Tenant.ownerUser.
// Each product passes a small config from its own utils/crmAdapter.js. Custom plan name/features are stored on the
// Tenant (customPlanName / customFeatures) and shown on the customer's billing page.
const { helpers: H } = require("./crmAccounts");

module.exports = (cfg) => {
  const { Tenant, User } = cfg;
  const roles = User.schema.path("role").enumValues;
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const limitsOf = (t) => Object.fromEntries(cfg.limitFields.map((f) => [f.key, get(t, f.path)]));
  const shownRoles = (u) => !(cfg.hideRoles || []).includes(u.role);

  const meta = {
    accountLabel: cfg.label,
    accountStatusOptions: Tenant.schema.path("status").enumValues,
    accountStatusHint: "suspended or cancelled blocks access for this organisation",
    subscriptionStatusOptions: null,
    paymentStatusOptions: null,
    planOptions: Tenant.schema.path("plan").enumValues,
    limitFields: cfg.limitFields.map(({ key, label }) => ({ key, label })),
    flagFields: [],
    roleOptions: roles,
    defaultRole: cfg.defaultRole,
    ownerRole: cfg.ownerRole,
    createLimitDefaults: cfg.defaultLimits,
    createExtraFields: cfg.createExtraFields || [],
    accountExtraFields: [],
  };

  const userView = (u, ownerId) => ({ id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, phone: u.phone, lastLogin: u.lastLogin, isOwner: String(u._id) === String(ownerId) });
  const subView = (t) => ({
    plan: t.plan, status: t.status, validTill: t.planExpiresAt, isTrial: t.plan === "trial",
    customPlanName: t.customPlanName, customFeatures: t.customFeatures || [], limits: limitsOf(t), flags: {},
  });
  const accountView = (t, owner) => ({ id: t._id, name: t.name, email: owner?.email, phone: owner?.phone, status: t.status });
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return {
    meta,

    async list(search) {
      let q = {};
      if (search) {
        const re = new RegExp(esc(search), "i");
        const owners = await User.find({ email: re }).select("tenantId").limit(200).lean();
        q = { $or: [{ name: re }, { _id: { $in: owners.map((o) => o.tenantId).filter(Boolean) } }] };
      }
      const tenants = await Tenant.find(q).select("name plan planExpiresAt status limits usage ownerUser createdAt").sort({ createdAt: -1 }).limit(500).populate("ownerUser", "email phone lastLogin").lean();
      const counts = await User.aggregate([{ $match: { tenantId: { $in: tenants.map((t) => t._id) } } }, { $group: { _id: "$tenantId", n: { $sum: 1 } } }]);
      const n = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
      return tenants.map((t) => ({
        id: t._id, name: t.name, email: t.ownerUser?.email, phone: t.ownerUser?.phone, status: t.status, plan: t.plan,
        validTill: t.planExpiresAt, usage: cfg.usage(t, n[String(t._id)] || 0), lastLogin: t.ownerUser?.lastLogin, createdAt: t.createdAt,
      }));
    },

    async get(id) {
      const t = await Tenant.findById(id).lean();
      if (!t) throw H.fail("Account not found", 404);
      const [owner, users] = await Promise.all([
        User.findById(t.ownerUser).select("email phone").lean(),
        User.find({ tenantId: t._id, role: { $nin: cfg.hideRoles || [] } }).select("name email role status phone lastLogin").sort({ createdAt: 1 }).limit(300).lean(),
      ]);
      return { account: accountView(t, owner), subscription: subView(t), users: users.filter(shownRoles).map((u) => userView(u, t.ownerUser)), usage: cfg.usageDetail ? cfg.usageDetail(t) : {} };
    },

    async create(b) {
      const email = String(b.email || "").trim().toLowerCase();
      const name = String(b.name || "").trim();
      const adminName = String(b.adminName || "").trim();
      if (!name || !adminName) throw H.fail("Organisation name and admin name are required");
      if (!/^\S+@\S+\.\S+$/.test(email)) throw H.fail("A valid email is required");
      const plan = b.plan || "trial";
      if (!meta.planOptions.includes(plan)) throw H.fail("Invalid plan");
      const password = H.checkPassword(String(b.password || ""));
      if (await User.findOne({ email })) throw H.fail("An account with this email already exists");
      const limits = {};
      for (const f of cfg.limitFields) limits[f.path.replace(/^limits\./, "")] = Math.max(0, Number(b.limits?.[f.key] ?? cfg.defaultLimits[f.key]) || 0);
      const mongoose = require("mongoose");
      const userId = new mongoose.Types.ObjectId();
      let user;
      try {
        user = await User.create({ _id: userId, name: adminName, email, password, role: cfg.ownerRole, phone: String(b.phone || "").trim() || undefined });
        const t = await Tenant.create({
          name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org"}-${userId.toString().slice(-6)}`,
          ownerUser: userId, plan, status: "active", planExpiresAt: H.addMonths(b.months), limits, ...(cfg.createTenant ? cfg.createTenant(b, { email, phone: b.phone }) : {}),
        });
        user.tenantId = t._id;
        await user.save({ validateBeforeSave: false });
        return { id: t._id, email, password, validTill: t.planExpiresAt };
      } catch (e) {
        if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
        throw e;
      }
    },

    async updateAccount(id, b) {
      const t = await Tenant.findById(id);
      if (!t) throw H.fail("Account not found", 404);
      if (b.name !== undefined) t.name = String(b.name).trim();
      if (b.status !== undefined) { if (!meta.accountStatusOptions.includes(b.status)) throw H.fail("Invalid status"); t.status = b.status; }
      await t.save({ validateModifiedOnly: true });
      if (b.phone !== undefined) await User.updateOne({ _id: t.ownerUser }, { phone: String(b.phone).trim() });
      const owner = await User.findById(t.ownerUser).select("email phone").lean();
      return { account: accountView(t, owner) };
    },

    async setSubscription(id, b) {
      const t = await Tenant.findById(id);
      if (!t) throw H.fail("Account not found", 404);
      if (b.plan !== undefined) { if (!meta.planOptions.includes(b.plan)) throw H.fail("Invalid plan"); t.plan = b.plan; }
      if (b.validTill) t.planExpiresAt = H.toDate(b.validTill, "valid-till date");
      for (const f of cfg.limitFields) if (b.limits?.[f.key] !== undefined) t.set(f.path, Math.max(0, Number(b.limits[f.key]) || 0));
      if (b.customPlanName !== undefined) t.customPlanName = String(b.customPlanName).trim().slice(0, 60);
      const features = H.cleanFeatures(b.customFeatures);
      if (features !== undefined) t.customFeatures = features;
      await t.save({ validateModifiedOnly: true });
      return { subscription: subView(t.toObject()) };
    },

    async createUser(id, b) {
      const email = String(b.email || "").trim().toLowerCase();
      if (!String(b.name || "").trim() || !/^\S+@\S+\.\S+$/.test(email)) throw H.fail("Name and a valid email are required");
      const role = b.role || cfg.defaultRole;
      if (!roles.includes(role)) throw H.fail("Invalid role");
      if (!(await Tenant.exists({ _id: id }))) throw H.fail("Account not found", 404);
      const password = H.checkPassword(String(b.password || ""));
      const u = await User.create({ name: b.name.trim(), email, password, role, phone: b.phone || undefined, tenantId: id });
      return { user: userView(u), password };
    },

    async updateUser(uid, b) {
      const u = await User.findById(uid);
      if (!u) throw H.fail("User not found", 404);
      if (b.name !== undefined) u.name = String(b.name).trim();
      if (b.email !== undefined) u.email = String(b.email).trim().toLowerCase();
      if (b.phone !== undefined) u.phone = b.phone;
      if (b.role !== undefined) { if (!roles.includes(b.role)) throw H.fail("Invalid role"); u.role = b.role; }
      if (b.status !== undefined) { if (!["active", "inactive"].includes(b.status)) throw H.fail("Invalid status"); u.status = b.status; }
      let password;
      if (b.password) u.password = password = H.checkPassword(String(b.password));
      await u.save({ validateModifiedOnly: true });
      return { user: userView(u), password };
    },

    async deleteUser(uid) {
      const u = await User.findById(uid);
      if (!u) throw H.fail("User not found", 404);
      if (await Tenant.exists({ ownerUser: u._id })) throw H.fail("This is the account owner. Suspend the account instead.");
      await u.deleteOne();
    },
  };
};
