// End-to-end smoke test through the REAL Express app (auth cookies, CSRF, permissions, audit, routes),
// backed by an in-memory MongoDB replica set — your real database is never touched.
//   node scripts/smoke-http.js
const assert = require("assert");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

(async () => {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = rs.getUri("nestcare_smoke");
  process.env.JWT_SECRET = "smoke-secret";
  process.env.NODE_ENV = "test";
  process.env.PORT = "5099";
  require("../server"); // dotenv won't override variables that are already set
  await new Promise((r) => setTimeout(r, 2500)); // connect + index builds

  const base = "http://localhost:5099/api";
  const jar = {};
  const call = async (method, path, body) => {
    const headers = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (Object.keys(jar).length)
      headers.Cookie = Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    if (jar.csrf_token && method !== "GET")
      headers["X-CSRF-Token"] = jar.csrf_token;
    const r = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie?.() || []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  };
  const ok = (r, code, msg) =>
    assert.strictEqual(
      r.status,
      code,
      `${msg}: ${r.status} ${r.body.message || ""}`,
    );
  const step = (m) => console.log("  ok   ", m);
  const future = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

  let r = await call("POST", "/auth/register", {
    name: "Pharma Owner",
    email: "owner@smoke.test",
    phone: "9876543210",
    password: "Passw0rdA",
    acceptTerms: true,
  });
  ok(r, 201, "register");
  r = await call("POST", "/auth/onboard", {
    orgName: "Smoke Pharmacy",
    orgType: "pharmacy",
    city: "Pune",
    state: "MH",
    doctorCount: 1,
  });
  ok(r, 201, "onboard");
  step("account + organisation created");

  r = await call("POST", "/vendors", {
    businessName: "Acme Distributors",
    phone: "9111111111",
    vendorType: "distributor",
  });
  ok(r, 201, "vendor");
  const vendorId = r.body.data._id;
  r = await call("POST", "/medicines", {
    name: "Paracetamol",
    dosageForm: "tablet",
    strength: "500mg",
    mrp: 30,
    sellingPrice: 28,
    gstRate: 12,
    prescriptionRequired: false,
    unit: "strip",
  });
  ok(r, 201, "medicine");
  const med = r.body.data;
  step("vendor + medicine");

  r = await call("POST", "/purchases", {
    vendorId,
    invoiceNumber: "ACME-1001",
    invoiceDate: new Date().toISOString(),
    items: [
      {
        medicineId: med._id,
        batchNumber: "pc-01",
        expiryDate: future(365),
        quantity: 100,
        freeQuantity: 10,
        purchasePrice: 18,
        mrp: 30,
        gstRate: 12,
      },
    ],
  });
  ok(r, 201, "purchase draft");
  const pid = r.body.data._id;
  assert.ok(/^PUR-/.test(r.body.data.number));
  r = await call("GET", `/medicines/${med._id}`);
  assert.strictEqual(
    r.body.data.stockQty,
    0,
    "draft purchase must not add stock",
  );
  r = await call("POST", `/purchases/${pid}/receive`);
  ok(r, 200, "receive");
  r = await call("POST", `/purchases/${pid}/receive`);
  ok(r, 409, "second receive");
  r = await call("GET", `/medicines/${med._id}`);
  assert.strictEqual(r.body.data.stockQty, 110);
  step("purchase received once → 110 units (100 + 10 free)");

  r = await call("POST", "/pharmacy/sales", {
    idempotencyKey: "smoke-sale-0001",
    customerName: "Walk-in",
    items: [{ medicineId: med._id, quantity: 4 }],
    payments: [{ amount: 100, mode: "cash" }],
  });
  ok(r, 201, "sale");
  const sale = r.body.data;
  assert.strictEqual(sale.items[0].allocations[0].batchNumber, "PC-01");
  r = await call("POST", "/pharmacy/sales", {
    idempotencyKey: "smoke-sale-0001",
    customerName: "Walk-in",
    items: [{ medicineId: med._id, quantity: 4 }],
  });
  ok(r, 200, "replayed sale");
  assert.strictEqual(r.body.replayed, true);
  r = await call("GET", `/medicines/${med._id}`);
  assert.strictEqual(r.body.data.stockQty, 106, "retry did not deduct twice");
  step("sale dispensed from PC-01; retry replayed; stock 106");

  r = await call("GET", "/inventory/reconciliation");
  ok(r, 200, "reconciliation");
  assert.strictEqual(r.body.data.mismatches.length, 0);
  r = await call("GET", `/inventory/ledger?medicineId=${med._id}`);
  ok(r, 200, "ledger");
  assert.ok(r.body.total >= 2);
  r = await call("POST", `/pharmacy/sales/${sale._id}/return`, {
    items: [{ lineId: sale.items[0]._id, quantity: 4 }],
    reason: "unused",
    cancel: false,
  });
  ok(r, 200, "return");
  r = await call("GET", `/medicines/${med._id}`);
  assert.strictEqual(r.body.data.stockQty, 110);
  step("ledger reconciles; return restocked → 110");

  r = await call("POST", "/departments", { name: "General Medicine" });
  ok(r, 201, "department");
  r = await call("POST", "/lab-tests", {
    name: "Complete Blood Count",
    code: "cbc",
    category: "Haematology",
    specimenType: "Blood",
    defaultPrice: 350,
    referenceRange: { low: 4, high: 11 },
  });
  ok(r, 201, "lab test");
  step("department + lab test catalogue");

  r = await call("GET", "/inventory/batches?state=available");
  ok(r, 200, "batches");
  assert.strictEqual(r.body.data.length, 1);
  await new Promise((res) => setTimeout(res, 300)); // audit rows are written after the response
  const audited = await require("mongoose")
    .model("AuditLog")
    .countDocuments({
      resource: { $in: ["purchase", "pharmacy", "inventory"] },
    });
  assert.ok(
    audited >= 5,
    `expected audit rows for pharmacy actions, got ${audited}`,
  );
  step(`audit log recorded ${audited} pharmacy/inventory actions`);

  console.log("\nsmoke ok");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE FAILED:", e.message);
  process.exit(1);
});
