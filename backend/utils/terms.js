// Terms & Privacy acceptance. Same file in every product backend; only EXEMPT differs (end-customer logins
// such as members/patients/parents are covered by the business that owns the account, and often have no web UI).
// Bump VERSION whenever the legal text changes: every login is then asked to accept again.
const VERSION = "2026-10-25";
const EXEMPT = ["patient"];
const SKIP_URL = /^\/api\/(auth|legal|telemetry|crm)(\/|\?|$)/;

const required = (user) => !EXEMPT.includes(user.role);
const accepted = (user) => user.termsVersion === VERSION;
// True when this request must be refused until the user accepts.
const blocks = (req) => required(req.user) && !accepted(req.user) && !SKIP_URL.test(req.originalUrl);
const refuse = (res) =>
  res.status(403).json({
    success: false,
    code: "TERMS_REQUIRED",
    message: "Please accept the updated Terms & Privacy Policy in the web app to continue.",
  });

// CRM dashboard: per-account acceptance counts, { accountId: { need, done } }, over the logins that must accept.
const stats = async (User, field, ids) => {
  const rows = await User.aggregate([
    { $match: { [field]: { $in: ids }, role: { $nin: EXEMPT } } },
    { $group: { _id: "$" + field, need: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ["$termsVersion", VERSION] }, 1, 0] } } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), { need: r.need, done: r.done }]));
};
const label = (st) => (!st || !st.need ? "n/a" : st.done === st.need ? "accepted" : st.done ? "partial" : "pending");
const userState = (u) => (required(u) ? (accepted(u) ? "accepted" : "pending") : "n/a");

module.exports = { VERSION, EXEMPT, required, accepted, blocks, refuse, stats, label, userState };
