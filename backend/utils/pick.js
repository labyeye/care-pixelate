// Whitelist body fields so clients can't set tenantId/_id/etc. (mass assignment).
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj && obj[k] !== undefined).map((k) => [k, obj[k]]));

// ?q= search + ?page/?limit, capped so no endpoint returns an unbounded collection.
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pageOpts = (query) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 500);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, skip: (page - 1) * limit };
};

const searchFilter = (q, fields) =>
  q ? { $or: fields.map((f) => ({ [f]: new RegExp(escapeRe(q), "i") })) } : {};

module.exports = { pick, pageOpts, searchFilter };

if (require.main === module) {
  const assert = require("assert");
  assert.deepStrictEqual(pick({ a: 1, tenantId: "x" }, ["a", "b"]), { a: 1 });
  assert.ok(searchFilter("a.b(", ["n"]).$or[0].n.test("xa.b(y"));
  assert.deepStrictEqual(pageOpts({ limit: "9999", page: "3" }), { limit: 500, skip: 1000 });
  console.log("pick ok");
}
