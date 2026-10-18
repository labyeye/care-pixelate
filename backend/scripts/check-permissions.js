// Offline check of the role -> page gate and the permissions endpoints (models stubbed).
process.env.JWT_SECRET = "test";
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};
let stored = {};
stub("models/Tenant.js", {
  findById: () => ({ select: async () => ({ rolePermissions: stored }) }),
  findByIdAndUpdate: (id, upd) => ({
    select: async () => {
      stored = upd.$set.rolePermissions;
      return { rolePermissions: stored };
    },
  }),
});
stub("models/User.js", {});

const { pageAccess } = require("../middleware/auth");
const { effectivePages } = require("../utils/permissions");
const {
  getPermissions,
  updatePermissions,
} = require("../controllers/tenantController");

const run = (mw, req) => {
  const res = {
    code: 200,
    status(c) {
      this.code = c;
      return this;
    },
  };
  let passed = false;
  try {
    mw({ method: "GET", ...req }, res, () => (passed = true));
  } catch (e) {
    res.err = e.message;
  }
  return { passed, code: res.code, err: res.err };
};
const call = async (fn, req) => {
  const res = {
    code: 200,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  try {
    await fn({ tenantId: "t", body: {}, ...req }, res, (e) => {
      throw e;
    });
  } catch (e) {
    res.err = e.message;
  }
  return res;
};

(async () => {
  // gate: receptionist default has patients+invoices, not lab-orders / staff
  const rec = effectivePages("receptionist", {});
  assert.ok(run(pageAccess("invoices"), { rolePages: rec }).passed);
  assert.strictEqual(
    run(pageAccess("lab-orders"), { rolePages: rec }).code,
    403,
  );
  // read vs write keys: a role with only "appointments" can read the patient list (to book) but not edit patients
  const onlyAppt = ["dashboard", "appointments"];
  const patientGate = pageAccess(["patients", "appointments"], "patients");
  assert.ok(run(patientGate, { rolePages: onlyAppt, method: "GET" }).passed);
  assert.strictEqual(
    run(patientGate, { rolePages: onlyAppt, method: "POST" }).code,
    403,
  );

  // owner edits: give nurse invoices + a page she can never hold
  let r = await call(updatePermissions, {
    body: {
      permissions: { nurse: ["dashboard", "patients", "invoices", "staff"] },
    },
  });
  assert.strictEqual(r.code, 200, r.err);
  assert.deepStrictEqual(
    r.body.data.current.nurse,
    ["dashboard", "patients"],
    "invoices/staff are not grantable to a nurse, dropped",
  );
  r = await call(updatePermissions, {
    body: { permissions: { receptionist: ["dashboard", "patients"] } },
  });
  assert.deepStrictEqual(
    stored.nurse,
    ["dashboard", "patients"],
    "other roles kept",
  );
  assert.deepStrictEqual(r.body.data.current.receptionist, [
    "dashboard",
    "patients",
  ]);

  r = await call(updatePermissions, {
    body: { permissions: { tenant_owner: [] } },
  });
  assert.strictEqual(r.code, 400);
  r = await call(updatePermissions, {
    body: { permissions: { nurse: ["made-up"] } },
  });
  assert.strictEqual(r.code, 400);

  r = await call(getPermissions, {});
  const staffPage = r.body.data.pages.find((p) => p.key === "staff");
  assert.deepStrictEqual(staffPage.base, ["tenant_owner", "hospital_admin"]);
  assert.ok(
    r.body.data.pages
      .find((p) => p.key === "dashboard")
      .mandatoryFor.includes("nurse"),
  );

  r = await call(updatePermissions, { body: { reset: true } });
  assert.deepStrictEqual(stored, {});
  assert.deepStrictEqual(
    r.body.data.current.nurse,
    effectivePages("nurse", undefined),
  );
  console.log("permissions ok");
})();
