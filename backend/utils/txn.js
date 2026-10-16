const mongoose = require("mongoose");

// Multi-document transactions need a replica set / mongos. Detect once, run the work in a
// transaction when available and plainly (session = null) when not — callers pass `opt(session)`
// to every query so the same code path works on both.
let supported;
async function supportsTransactions() {
  if (supported !== undefined) return supported;
  try {
    const h = await mongoose.connection.db.admin().command({ hello: 1 });
    supported = !!(h.setName || h.msg === "isdbgrid");
  } catch {
    supported = false;
  }
  return supported;
}

/** Runs fn(session|null). With a session the whole block commits or rolls back together (and
 *  transient write conflicts are retried by the driver). */
async function withTxn(fn) {
  if (!(await supportsTransactions())) return fn(null);
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}

/** Query options carrying the session when there is one. */
const opt = (session, extra = {}) => (session ? { ...extra, session } : extra);

module.exports = { withTxn, opt, supportsTransactions };
