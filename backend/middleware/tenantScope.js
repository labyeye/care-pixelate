// Single choke point for tenant isolation: every tenant-scoped controller
// filters its queries by req.tenantId instead of reading req.user.tenantId
// directly, so a super_admin can inspect any tenant via ?tenantId= while
// every other role is hard-pinned to its own tenant with no way to override.
// It also pins doctors to their own records (req.ownDoctorId, see utils/doctorScope.js).
const { resolveOwnDoctor } = require("../utils/doctorScope");

const tenantScope = async (req, res, next) => {
  try {
    req.tenantId =
      req.user.role === "super_admin" ? req.query.tenantId : req.user.tenantId;
    req.ownDoctorId = await resolveOwnDoctor(req);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = tenantScope;
