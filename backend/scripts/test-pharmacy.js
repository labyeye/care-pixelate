// Integration tests for the pharmacy / inventory / booking changes. Runs against an IN-MEMORY MongoDB
// replica set (transactions enabled) — it never touches the project's real database.
//   npm i -D mongodb-memory-server   (already a devDependency)     node scripts/test-pharmacy.js
process.env.JWT_SECRET = "test-secret";
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let sentOtp = null;
require("../utils/notify").sendWhatsAppOtp = async (_phone, code) => {
  sentOtp = code;
};

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push([true, name]);
    console.log("  ok   ", name);
  } catch (e) {
    results.push([false, name, e]);
    console.log(
      "  FAIL ",
      name,
      "\n        ",
      e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n         ") : e,
    );
  }
};

// Minimal Express stand-in: runs a controller with the same error mapping as middleware/errorHandler.
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
  let err;
  await new Promise((resolve) => {
    const done = (e) => {
      err = e;
      resolve();
    };
    Promise.resolve(
      fn(
        { params: {}, query: {}, body: {}, ...req },
        {
          ...res,
          status: (c) => {
            res.code = c;
            return res;
          },
          json: (b) => {
            res.body = b;
            resolve();
            return res;
          },
          cookie() {
            return res;
          },
          clearCookie() {
            return res;
          },
        },
        done,
      ),
    ).then(() => resolve(), done);
  });
  if (err) {
    let code = res.code === 200 ? 500 : res.code;
    if (Number.isInteger(err.status)) code = err.status;
    if (err.code === 11000) code = 400;
    if (err.name === "ValidationError") code = 400;
    return { code, err, message: err.message };
  }
  return res;
};

(async () => {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(rs.getUri(), { dbName: "nestcare_test" });

  const models = require("fs").readdirSync(
    require("path").join(__dirname, "..", "models"),
  );
  for (const f of models) require(`../models/${f}`);
  const M = (n) => mongoose.model(n);
  for (const m of Object.values(mongoose.models)) {
    try {
      await m.syncIndexes(); // build the real unique indexes
    } catch (e) {
      console.log(
        `  INDEX BUILD FAILED for ${m.modelName}: ${String(e.message).slice(0, 140)}`,
      );
      results.push([false, `indexes build for ${m.modelName}`, e]);
    }
  }

  const { supportsTransactions } = require("../utils/txn");
  console.log(
    "Transactions available in test DB:",
    await supportsTransactions(),
  );

  const purchase = require("../controllers/purchaseController");
  const pharmacy = require("../controllers/pharmacyController");
  const inventory = require("../controllers/inventoryController");
  const medicineCtl = require("../controllers/medicineController");
  const vendorCtl = require("../controllers/vendorController");
  const appointmentCtl = require("../controllers/appointmentController");
  const consultationCtl = require("../controllers/consultationController");
  const doctorCtl = require("../controllers/doctorController");
  const departmentCtl = require("../controllers/departmentController");
  const inv = require("../utils/inventory");
  const StockTransaction = M("StockTransaction");

  // ---------- fixtures: two tenants so isolation can be proven
  const mk = async () => {
    const owner = new mongoose.Types.ObjectId();
    const t = await M("Tenant").create({
      name: "T",
      slug: `t-${owner}`,
      orgType: "pharmacy",
      ownerUser: owner,
      limits: { doctorLimit: 0, patientLimit: 0, userLimit: 0 },
    });
    const user = { _id: owner, role: "tenant_owner", name: "Owner" };
    const base = { tenantId: t._id, user };
    const vendor = await M("Vendor").create({
      tenantId: t._id,
      vendorId: "V1",
      businessName: "Acme Pharma",
      phone: "9999999999",
      createdBy: owner,
    });
    const med = await M("Medicine").create({
      tenantId: t._id,
      medicineId: "MED-1",
      name: "Amoxicillin",
      dosageForm: "capsule",
      strength: "500mg",
      mrp: 100,
      sellingPrice: 90,
      gstRate: 12,
      prescriptionRequired: false,
      createdBy: owner,
    });
    const rxMed = await M("Medicine").create({
      tenantId: t._id,
      medicineId: "MED-2",
      name: "Azithromycin",
      dosageForm: "tablet",
      strength: "250mg",
      mrp: 50,
      sellingPrice: 45,
      gstRate: 5,
      prescriptionRequired: true,
      createdBy: owner,
    });
    return { t, user, base, vendor, med, rxMed };
  };
  const A = await mk();
  const B = await mk();
  const future = (days) =>
    new Date(Date.now() + days * 86_400_000).toISOString();
  const lot = (med, batchNumber, qty, days, extra = {}) => ({
    medicineId: String(med._id),
    batchNumber,
    quantity: qty,
    expiryDate: future(days),
    purchasePrice: 40,
    mrp: 100,
    gstRate: 12,
    ...extra,
  });
  let invoiceSeq = 0;
  const receiveInvoice = async (ctx, items, vendorId = ctx.vendor._id) => {
    const c = await call(purchase.create, {
      ...ctx.base,
      body: {
        vendorId: String(vendorId),
        invoiceNumber: `SUP-${++invoiceSeq}`,
        invoiceDate: new Date().toISOString(),
        items,
      },
    });
    assert.strictEqual(c.code, 201, c.message);
    const r = await call(purchase.receive, {
      ...ctx.base,
      params: { id: String(c.body.data._id) },
    });
    assert.strictEqual(r.code, 200, r.message);
    return r.body.data;
  };
  const onHand = async (med) =>
    (await M("Medicine").findById(med._id)).stockQty;
  const batchQty = async (id) =>
    (await M("MedicineBatch").findById(id)).quantityAvailable;
  let saleSeq = 0;
  const sell = (ctx, items, extra = {}) =>
    call(pharmacy.createSale, {
      ...ctx.base,
      body: {
        idempotencyKey: `key-${++saleSeq}-${Date.now()}`,
        items,
        ...extra,
      },
    });

  console.log("\nPurchase invoices");
  await test("totals are computed on the server and validated", async () => {
    const c = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(A.vendor._id),
        invoiceNumber: "CALC-1",
        invoiceDate: new Date().toISOString(),
        total: 1,
        items: [lot(A.med, "C1", 10, 300, { discountPercent: 10 })],
      },
    });
    assert.strictEqual(c.code, 201, c.message);
    const d = c.body.data; // 10 * 40 = 400, -10% = 360 taxable, +12% GST = 43.2 -> 403.2 -> rounded 403
    assert.strictEqual(d.taxableAmount, 360);
    assert.strictEqual(d.total, 403);
    assert.strictEqual(d.status, "draft");
    assert.strictEqual(
      await onHand(A.med),
      0,
      "creating an invoice must not add stock",
    );
  });
  await test("rejects expired batches, negative qty and duplicate vendor invoice numbers", async () => {
    let r = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(A.vendor._id),
        invoiceNumber: "BAD-1",
        invoiceDate: new Date().toISOString(),
        items: [lot(A.med, "X", 5, -3)],
      },
    });
    assert.strictEqual(r.code, 400);
    r = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(A.vendor._id),
        invoiceNumber: "BAD-2",
        invoiceDate: new Date().toISOString(),
        items: [lot(A.med, "X", -5, 100)],
      },
    });
    assert.strictEqual(r.code, 400);
    r = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(A.vendor._id),
        invoiceNumber: "CALC-1",
        invoiceDate: new Date().toISOString(),
        items: [lot(A.med, "Y", 5, 100)],
      },
    });
    assert.strictEqual(r.code, 409, "same vendor invoice number twice");
  });
  await test("cross-tenant vendor / medicine references are refused", async () => {
    let r = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(B.vendor._id),
        invoiceNumber: "XT-1",
        invoiceDate: new Date().toISOString(),
        items: [lot(A.med, "Z", 5, 100)],
      },
    });
    assert.strictEqual(r.code, 400, "other tenant's vendor");
    r = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(A.vendor._id),
        invoiceNumber: "XT-2",
        invoiceDate: new Date().toISOString(),
        items: [lot(B.med, "Z", 5, 100)],
      },
    });
    assert.strictEqual(r.code, 400, "other tenant's medicine");
  });
  await test("receiving adds stock once; a repeat or racing receive is rejected", async () => {
    const c = await call(purchase.create, {
      ...A.base,
      body: {
        vendorId: String(A.vendor._id),
        invoiceNumber: "RCV-1",
        invoiceDate: new Date().toISOString(),
        items: [lot(A.med, "R1", 20, 200)],
      },
    });
    const id = String(c.body.data._id);
    const [x, y] = await Promise.all([
      call(purchase.receive, { ...A.base, params: { id } }),
      call(purchase.receive, { ...A.base, params: { id } }),
    ]);
    assert.deepStrictEqual(
      [x.code, y.code].sort(),
      [200, 409],
      "exactly one receive wins",
    );
    assert.strictEqual(await onHand(A.med), 20);
    const again = await call(purchase.receive, { ...A.base, params: { id } });
    assert.strictEqual(again.code, 409);
    assert.strictEqual(await onHand(A.med), 20, "no double stock");
    const upd = await call(purchase.update, {
      ...A.base,
      params: { id },
      body: { notes: "edit" },
    });
    assert.strictEqual(upd.code, 409, "received invoices are immutable");
  });
  await test("a vendor with purchases cannot be deleted", async () => {
    const r = await call(vendorCtl.remove, {
      ...A.base,
      params: { id: String(A.vendor._id) },
    });
    assert.strictEqual(r.code, 409);
  });

  console.log("\nBatches, FEFO and the ledger");
  await test("dispensing takes the earliest-expiry batch first and records the lots used", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-F",
      name: "FEFO Drug",
      dosageForm: "tablet",
      mrp: 20,
      sellingPrice: 18,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    await receiveInvoice(A, [lot(m, "LATE", 10, 400), lot(m, "SOON", 6, 40)]);
    const r = await sell(A, [{ medicineId: String(m._id), quantity: 8 }]);
    assert.strictEqual(r.code, 201, r.message);
    const al = r.body.data.items[0].allocations;
    assert.deepStrictEqual(
      al.map((a) => [a.batchNumber, a.quantity]),
      [
        ["SOON", 6],
        ["LATE", 2],
      ],
    );
    assert.strictEqual(await onHand(m), 8);
  });
  await test("expired batches are never dispensed and insufficient stock changes nothing", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-E",
      name: "Expiring",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    await M("MedicineBatch").create({
      tenantId: A.t._id,
      medicineId: m._id,
      batchNumber: "OLD",
      expiryDate: new Date(Date.now() - 5 * 86_400_000),
      quantityReceived: 50,
      quantityAvailable: 50,
      createdBy: A.user._id,
    });
    let r = await sell(A, [{ medicineId: String(m._id), quantity: 1 }]);
    assert.strictEqual(r.code, 409, "only expired stock exists");
    await receiveInvoice(A, [lot(m, "OK1", 5, 100)]);
    const before = await M("MedicineBatch")
      .find({ medicineId: m._id })
      .sort({ batchNumber: 1 });
    r = await sell(A, [{ medicineId: String(m._id), quantity: 9 }]);
    assert.strictEqual(r.code, 409);
    const after = await M("MedicineBatch")
      .find({ medicineId: m._id })
      .sort({ batchNumber: 1 });
    assert.deepStrictEqual(
      after.map((b) => b.quantityAvailable),
      before.map((b) => b.quantityAvailable),
      "failed sale rolled back",
    );
    assert.strictEqual(
      await M("PharmacySale").countDocuments({
        tenantId: A.t._id,
        "items.medicineId": m._id,
      }),
      0,
      "no sale row left behind",
    );
    // this fixture batch was inserted straight into the collection (no ledger rows) — drop it so the
    // reconciliation test below only sees stock that went through the service.
    await M("MedicineBatch").deleteOne({
      tenantId: A.t._id,
      batchNumber: "OLD",
    });
  });
  await test("concurrent dispensing never oversells (stock never goes negative)", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-C",
      name: "Race Drug",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    await receiveInvoice(A, [lot(m, "RC1", 10, 100)]);
    const rs2 = await Promise.all(
      Array.from({ length: 5 }, () =>
        sell(A, [{ medicineId: String(m._id), quantity: 3 }]),
      ),
    );
    const ok = rs2.filter((r) => r.code === 201).length;
    assert.strictEqual(ok, 3, `10 units / 3 each = 3 sales, got ${ok}`);
    assert.strictEqual(await onHand(m), 1);
    const b = await M("MedicineBatch").findOne({ medicineId: m._id });
    assert.ok(b.quantityAvailable >= 0);
  });
  await test("retrying the same request (idempotency key) sells once", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-I",
      name: "Idem Drug",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    await receiveInvoice(A, [lot(m, "ID1", 20, 100)]);
    const body = {
      idempotencyKey: "retry-key-0001",
      items: [{ medicineId: String(m._id), quantity: 4 }],
    };
    const rs3 = await Promise.all([
      call(pharmacy.createSale, { ...A.base, body }),
      call(pharmacy.createSale, { ...A.base, body }),
      call(pharmacy.createSale, { ...A.base, body }),
    ]);
    assert.ok(
      rs3.every((r) => r.code === 200 || r.code === 201),
      JSON.stringify(rs3.map((r) => [r.code, r.message])),
    );
    assert.strictEqual(
      new Set(rs3.map((r) => String(r.body.data._id))).size,
      1,
      "all replies point at one sale",
    );
    assert.strictEqual(await onHand(m), 16, "stock deducted exactly once");
    assert.strictEqual(
      await M("PharmacySale").countDocuments({
        tenantId: A.t._id,
        idempotencyKey: "retry-key-0001",
      }),
      1,
    );
  });
  await test("the ledger reconciles with batch quantities and is append-only", async () => {
    const r = await call(inventory.reconciliation, { ...A.base });
    assert.strictEqual(
      r.body.data.mismatches.length,
      0,
      JSON.stringify(r.body.data.mismatches),
    );
    const row = await StockTransaction.findOne({ tenantId: A.t._id });
    assert.ok(row);
    await assert.rejects(
      () =>
        StockTransaction.updateOne(
          { _id: row._id },
          { $set: { quantityChange: 999 } },
        ),
      /append-only/,
    );
    await assert.rejects(
      () => StockTransaction.deleteMany({ tenantId: A.t._id }),
      /append-only/,
    );
    row.reason = "tamper";
    await assert.rejects(() => row.save(), /append-only/);
  });

  console.log("\nPrescriptions and dispensing rules");
  await test("prescription-only medicine needs a signed prescription that lists it", async () => {
    await receiveInvoice(A, [
      lot(A.rxMed, "RX1", 30, 200, { gstRate: 5, mrp: 50 }),
    ]);
    const patient = await M("Patient").create({
      tenantId: A.t._id,
      patientId: "P1",
      firstName: "A",
      lastName: "B",
      dateOfBirth: new Date("1990-01-01"),
      gender: "male",
      contact: { phone: "9" },
      registeredBy: A.user._id,
    });
    const doctor = await M("Doctor").create({
      tenantId: A.t._id,
      doctorId: "D1",
      firstName: "D",
      lastName: "R",
      contact: { phone: "9", email: "d@x.com" },
      professionalDetails: {
        registrationNumber: "R",
        registrationCouncil: "C",
      },
      createdBy: A.user._id,
    });
    let r = await sell(A, [{ medicineId: String(A.rxMed._id), quantity: 2 }], {
      patientId: String(patient._id),
    });
    assert.strictEqual(r.code, 409, "no prescription attached");
    const appt = await M("Appointment").create({
      tenantId: A.t._id,
      patientId: patient._id,
      doctorId: doctor._id,
      scheduledAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 87_000_000),
    });
    const c = await call(consultationCtl.create, {
      ...A.base,
      body: {
        appointmentId: String(appt._id),
        prescription: {
          items: [
            {
              medicineId: String(A.rxMed._id),
              drug: "",
              quantity: 5,
              days: 5,
              frequency: "1-0-1",
              route: "oral",
            },
          ],
        },
      },
    });
    assert.strictEqual(c.code, 201, c.message);
    const item = c.body.data.prescription.items[0];
    assert.strictEqual(
      item.drug,
      "Azithromycin",
      "name snapshot filled from the catalog",
    );
    assert.strictEqual(item.strength, "250mg");
    r = await sell(A, [{ medicineId: String(A.rxMed._id), quantity: 2 }], {
      patientId: String(patient._id),
      consultationId: String(c.body.data._id),
    });
    assert.strictEqual(r.code, 409, "draft prescription is not enough");
    const s1 = await call(consultationCtl.sign, {
      ...A.base,
      params: { id: String(c.body.data._id) },
    });
    assert.strictEqual(s1.code, 200, s1.message);
    // signing must never move stock
    assert.strictEqual(
      await M("StockTransaction").countDocuments({
        tenantId: A.t._id,
        referenceType: "consultation",
      }),
      0,
    );
    r = await sell(A, [{ medicineId: String(A.rxMed._id), quantity: 3 }], {
      patientId: String(patient._id),
      consultationId: String(c.body.data._id),
    });
    assert.strictEqual(r.code, 201, r.message);
    r = await sell(A, [{ medicineId: String(A.rxMed._id), quantity: 3 }], {
      patientId: String(patient._id),
      consultationId: String(c.body.data._id),
    });
    assert.strictEqual(r.code, 409, "only 5 prescribed: 3 + 3 exceeds it");
    // patient sales are billed on an invoice that points back at the sale
    const sale = await M("PharmacySale").findOne({
      tenantId: A.t._id,
      patientId: patient._id,
    });
    const invoice = await M("Invoice").findById(sale.invoiceId);
    assert.strictEqual(invoice.items[0].source.kind, "pharmacy_sale");
    assert.strictEqual(String(invoice.items[0].source.refId), String(sale._id));
    assert.strictEqual(invoice.total, sale.total);
  });
  await test("signing is atomic and recorded; a signed consultation can't be edited; foreign medicines rejected", async () => {
    const patient = await M("Patient").findOne({ tenantId: A.t._id });
    const doctor = await M("Doctor").findOne({ tenantId: A.t._id });
    const appt = await M("Appointment").create({
      tenantId: A.t._id,
      patientId: patient._id,
      doctorId: doctor._id,
      scheduledAt: new Date(Date.now() + 2 * 86_400_000),
      endsAt: new Date(Date.now() + 2 * 86_400_000 + 900000),
    });
    let c = await call(consultationCtl.create, {
      ...A.base,
      body: {
        appointmentId: String(appt._id),
        prescription: {
          items: [{ medicineId: String(B.med._id), drug: "Other tenant drug" }],
        },
      },
    });
    assert.strictEqual(c.code, 400, "medicine from another tenant");
    c = await call(consultationCtl.create, {
      ...A.base,
      body: {
        appointmentId: String(appt._id),
        prescription: {
          items: [{ drug: "Legacy free-text drug", dose: "1 tab" }],
        },
      },
    });
    assert.strictEqual(
      c.code,
      201,
      "legacy items without medicineId stay valid",
    );
    const dup = await call(consultationCtl.create, {
      ...A.base,
      body: { appointmentId: String(appt._id) },
    });
    assert.strictEqual(dup.code, 409, "one consultation per appointment");
    const id = String(c.body.data._id);
    const both = await Promise.all([
      call(consultationCtl.sign, { ...A.base, params: { id } }),
      call(consultationCtl.sign, { ...A.base, params: { id } }),
    ]);
    assert.ok(both.every((r) => r.code === 200));
    const doc = await M("Consultation").findById(id);
    assert.strictEqual(doc.status, "signed");
    assert.strictEqual(String(doc.signedBy), String(A.user._id));
    const edit = await call(consultationCtl.update, {
      ...A.base,
      params: { id },
      body: { notes: "late edit" },
    });
    assert.strictEqual(edit.code, 409);
  });

  console.log("\nReturns, adjustments and legacy stock");
  await test("returns restock the same batch, can't exceed what was sold, and can't be doubled", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-R",
      name: "Return Drug",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    await receiveInvoice(A, [lot(m, "RT1", 10, 100)]);
    const s = (await sell(A, [{ medicineId: String(m._id), quantity: 6 }])).body
      .data;
    const line = String(s.items[0]._id);
    const ask = (qty) =>
      call(pharmacy.returnSale, {
        ...A.base,
        params: { id: String(s._id) },
        body: {
          items: [{ lineId: line, quantity: qty }],
          reason: "customer returned",
        },
      });
    let r = await ask(7);
    assert.strictEqual(r.code, 409, "more than sold");
    const par = await Promise.all([ask(4), ask(4)]);
    assert.deepStrictEqual(
      par.map((x) => x.code).sort(),
      [200, 409],
      "two simultaneous returns: one passes",
    );
    assert.strictEqual(await onHand(m), 8, "10 - 6 sold + 4 returned");
    r = await ask(3);
    assert.strictEqual(r.code, 409, "only 2 left to return");
    r = await ask(2);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(
      (await M("PharmacySale").findById(s._id)).status,
      "returned",
    );
    assert.strictEqual(await onHand(m), 10);
  });
  await test("cancelling an unpaid patient sale restocks and voids its invoice", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-K",
      name: "Cancel Drug",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    await receiveInvoice(A, [lot(m, "CN1", 10, 100)]);
    const patient = await M("Patient").findOne({ tenantId: A.t._id });
    const s = (
      await sell(A, [{ medicineId: String(m._id), quantity: 5 }], {
        patientId: String(patient._id),
      })
    ).body.data;
    const r = await call(pharmacy.returnSale, {
      ...A.base,
      params: { id: String(s._id) },
      body: { cancel: true, reason: "ordered by mistake" },
    });
    assert.strictEqual(r.code, 200, r.message);
    assert.strictEqual(await onHand(m), 10);
    assert.strictEqual(
      (await M("Invoice").findById(s.invoiceId)).status,
      "void",
    );
  });
  await test("manual adjustments: reason required, no negative stock, increases are admin-only", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-A",
      name: "Adjust Drug",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      createdBy: A.user._id,
    });
    const rcv = await receiveInvoice(A, [lot(m, "AD1", 10, 100)]);
    const batchId = String(rcv.items[0].medicineBatchId);
    const pharmacist = {
      _id: new mongoose.Types.ObjectId(),
      role: "pharmacist",
      name: "Pharm",
    };
    const as = (user, body) =>
      call(inventory.adjust, {
        tenantId: A.t._id,
        user,
        params: { id: batchId },
        body,
      });
    assert.strictEqual(
      (await as(A.user, { delta: -2, type: "damaged" })).code,
      400,
      "reason required",
    );
    assert.strictEqual(
      (await as(A.user, { delta: -50, type: "damaged", reason: "broken" }))
        .code,
      409,
      "cannot go negative",
    );
    assert.strictEqual(
      (
        await as(pharmacist, {
          delta: 5,
          type: "adjustment",
          reason: "found extra",
        })
      ).code,
      403,
      "pharmacist can't increase",
    );
    assert.strictEqual(
      (
        await as(pharmacist, {
          delta: -3,
          type: "damaged",
          reason: "broken in transit",
        })
      ).code,
      200,
    );
    assert.strictEqual(
      (
        await as(A.user, {
          delta: 2,
          type: "adjustment",
          reason: "count correction",
        })
      ).code,
      200,
    );
    assert.strictEqual(await batchQty(batchId), 9);
    assert.strictEqual(
      (await call(inventory.reconciliation, { ...A.base })).body.data.mismatches
        .length,
      0,
    );
  });
  await test("legacy un-batched stock is preserved, not dispensable until reconciled into a real batch", async () => {
    const m = await M("Medicine").create({
      tenantId: A.t._id,
      medicineId: "MED-L",
      name: "Legacy Drug",
      dosageForm: "tablet",
      mrp: 10,
      sellingPrice: 10,
      gstRate: 0,
      prescriptionRequired: false,
      stockQty: 30,
      legacyStockQty: 30,
      createdBy: A.user._id,
    });
    let r = await sell(A, [{ medicineId: String(m._id), quantity: 1 }]);
    assert.strictEqual(
      r.code,
      409,
      "legacy stock has no batch/expiry, so it can't be dispensed",
    );
    const rec = await call(inventory.reconcile, {
      ...A.base,
      params: { id: String(m._id) },
      body: { batchNumber: "lg-1", expiryDate: future(300), quantity: 20 },
    });
    assert.strictEqual(rec.code, 200, rec.message);
    const med = await M("Medicine").findById(m._id);
    assert.strictEqual(med.legacyStockQty, 10);
    assert.strictEqual(med.stockQty, 30, "total unchanged by reconciliation");
    r = await sell(A, [{ medicineId: String(m._id), quantity: 5 }]);
    assert.strictEqual(r.code, 201, r.message);
    // the old Medicines-page endpoint still works and goes through the ledger
    const out = await call(medicineCtl.adjustStock, {
      ...A.base,
      params: { id: String(m._id) },
      body: { type: "out", qty: 12, note: "wastage" },
    });
    assert.strictEqual(out.code, 200, out.message);
    assert.strictEqual((await M("Medicine").findById(m._id)).stockQty, 13);
    assert.strictEqual(
      (await call(inventory.reconciliation, { ...A.base })).body.data.mismatches
        .length,
      0,
    );
    const del = await call(medicineCtl.remove, {
      ...A.base,
      params: { id: String(m._id) },
    });
    assert.strictEqual(
      del.code,
      409,
      "a medicine with stock history can't be deleted",
    );
  });
  await test("a medicine created before batch tracking keeps its stock when first touched", async () => {
    const _id = new mongoose.Types.ObjectId();
    // raw insert = an old document: has stockQty, has no legacyStockQty field at all
    await mongoose.connection
      .collection("medicines")
      .insertOne({
        _id,
        tenantId: A.t._id,
        medicineId: "MED-OLD",
        name: "Pre-batch Drug",
        dosageForm: "tablet",
        mrp: 10,
        sellingPrice: 10,
        gstRate: 0,
        prescriptionRequired: false,
        trackInventory: true,
        isActive: true,
        stockQty: 20,
        reorderLevel: 5,
        createdBy: A.user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    const inR = await call(medicineCtl.adjustStock, {
      ...A.base,
      params: { id: String(_id) },
      body: { type: "in", qty: 5 },
    });
    assert.strictEqual(inR.code, 200, inR.message);
    const m = await M("Medicine").findById(_id);
    assert.strictEqual(m.stockQty, 25, "20 carried over + 5");
    assert.strictEqual(m.legacyStockQty, 25);
    // a purchase receipt on another untouched old medicine must not erase its count either
    const id2 = new mongoose.Types.ObjectId();
    await mongoose.connection
      .collection("medicines")
      .insertOne({
        _id: id2,
        tenantId: A.t._id,
        medicineId: "MED-OLD2",
        name: "Pre-batch Two",
        dosageForm: "tablet",
        mrp: 10,
        sellingPrice: 10,
        gstRate: 0,
        prescriptionRequired: false,
        trackInventory: true,
        isActive: true,
        stockQty: 12,
        reorderLevel: 5,
        createdBy: A.user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    await receiveInvoice(A, [lot({ _id: id2 }, "OLD2-B1", 8, 200)]);
    assert.strictEqual(
      (await M("Medicine").findById(id2)).stockQty,
      20,
      "12 legacy + 8 received",
    );
  });
  await test("tenant isolation: another tenant's medicine / batch / sale are invisible", async () => {
    const r = await sell(B, [{ medicineId: String(A.med._id), quantity: 1 }]);
    assert.strictEqual(r.code, 400);
    const adj = await call(inventory.adjust, {
      ...B.base,
      params: {
        id: String(
          (await M("MedicineBatch").findOne({ tenantId: A.t._id }))._id,
        ),
      },
      body: { delta: -1, type: "damaged", reason: "x" },
    });
    assert.strictEqual(adj.code, 409);
    const sale = await M("PharmacySale").findOne({ tenantId: A.t._id });
    const get = await call(pharmacy.getOne, {
      ...B.base,
      params: { id: String(sale._id) },
    });
    assert.strictEqual(get.code, 404);
  });

  console.log("\nIntake vitals (nurse / receptionist -> doctor)");
  await test("staff record vitals; the doctor opens the consultation pre-filled; signed visits are protected", async () => {
    const patient = await M("Patient").findOne({ tenantId: A.t._id });
    const doctor = await M("Doctor").findOne({ tenantId: A.t._id });
    const appt = await M("Appointment").create({
      tenantId: A.t._id,
      patientId: patient._id,
      doctorId: doctor._id,
      scheduledAt: new Date(Date.now() + 5 * 86_400_000),
      endsAt: new Date(Date.now() + 5 * 86_400_000 + 900000),
    });
    const nurse = {
      _id: new mongoose.Types.ObjectId(),
      role: "nurse",
      name: "Ritu Menon",
    };
    const receptionist = {
      _id: new mongoose.Types.ObjectId(),
      role: "receptionist",
      name: "Pooja Shinde",
    };
    const put = (user, body, id = appt._id) =>
      call(consultationCtl.saveTriage, {
        tenantId: A.t._id,
        user,
        params: { id: String(id) },
        body,
      });

    let r = await put(nurse, { vitals: { bp: "250/80", pulse: 999 } });
    assert.strictEqual(r.code, 400, "out-of-range values are refused");
    r = await put(nurse, { vitals: {} });
    assert.strictEqual(r.code, 400, "at least one vital is required");
    r = await put(nurse, {
      vitals: {
        bp: "120/80",
        pulse: 78,
        tempC: 37.2,
        spo2: 98,
        weightKg: 64,
        heightCm: 168,
      },
      complaints: "Fever since 2 days",
    });
    assert.strictEqual(r.code, 200, r.message);
    assert.deepStrictEqual(r.body.data.recordedBy, {
      name: "Ritu Menon",
      role: "nurse",
    });

    // the doctor's normal consultation lookup now returns a pre-filled draft
    let c = (
      await call(consultationCtl.getAll, {
        ...A.base,
        query: { appointmentId: String(appt._id) },
      })
    ).body.data[0];
    assert.strictEqual(c.status, "draft");
    assert.strictEqual(c.vitals.bp, "120/80");
    assert.strictEqual(c.vitals.pulse, 78);
    assert.strictEqual(c.complaints, "Fever since 2 days");

    // a receptionist corrects one value; other vitals stay
    r = await put(receptionist, {
      vitals: { pulse: 82 },
      complaints: "ignored: field already has text",
    });
    assert.strictEqual(r.code, 200, r.message);
    c = await M("Consultation").findOne({ appointmentId: appt._id });
    assert.strictEqual(c.vitals.pulse, 82);
    assert.strictEqual(c.vitals.bp, "120/80");
    assert.strictEqual(
      c.complaints,
      "Fever since 2 days",
      "intake complaint never overwrites existing text",
    );
    assert.strictEqual(c.vitalsRecordedByName, "Pooja Shinde");

    // the doctor adds clinical content; a later vitals edit must not wipe it
    const upd = await call(consultationCtl.update, {
      ...A.base,
      params: { id: String(c._id) },
      body: { diagnosis: ["Viral fever"], notes: "rest" },
    });
    assert.strictEqual(upd.code, 200, upd.message);
    await put(nurse, { vitals: { tempC: 38.1 } });
    c = await M("Consultation").findOne({ appointmentId: appt._id });
    assert.deepStrictEqual(
      [c.diagnosis[0], c.notes, c.vitals.tempC],
      ["Viral fever", "rest", 38.1],
    );
    assert.strictEqual(
      await M("Consultation").countDocuments({ appointmentId: appt._id }),
      1,
      "still one consultation per appointment",
    );

    // read side + isolation
    const got = await call(consultationCtl.getTriage, {
      ...A.base,
      params: { id: String(appt._id) },
    });
    assert.strictEqual(got.body.data.vitals.bp, "120/80");
    const foreign = await call(consultationCtl.saveTriage, {
      ...B.base,
      params: { id: String(appt._id) },
      body: { vitals: { pulse: 70 } },
    });
    assert.strictEqual(foreign.code, 404, "another tenant cannot touch it");

    // signed: no more changes
    await call(consultationCtl.sign, {
      ...A.base,
      params: { id: String(c._id) },
    });
    r = await put(nurse, { vitals: { pulse: 60 } });
    assert.strictEqual(r.code, 409, "signed consultation is immutable");
    assert.strictEqual(
      (await M("Consultation").findById(c._id)).vitals.pulse,
      82,
    );

    // cancelled visits take no vitals
    const done = await M("Appointment").create({
      tenantId: A.t._id,
      patientId: patient._id,
      doctorId: doctor._id,
      scheduledAt: new Date(Date.now() + 6 * 86_400_000),
      endsAt: new Date(Date.now() + 6 * 86_400_000 + 900000),
      status: "cancelled",
    });
    assert.strictEqual(
      (await put(nurse, { vitals: { pulse: 70 } }, done._id)).code,
      409,
    );
  });

  console.log("\nPhone login with a shared number (father + daughter)");
  await test("one OTP, then choose which patient to sign in as", async () => {
    const authCtl = require("../controllers/authController");
    const jwt = require("jsonwebtoken");
    const mkPatient = async (
      first,
      last,
      dob,
      phone,
      status = "active",
      gender = "male",
    ) => {
      const u = await M("User").create({
        name: `${first} ${last}`,
        email: `${first}.${last}.${phone}@fam.test`.toLowerCase(),
        password: "Kx7#mQv29!",
        role: "patient",
        phone,
        tenantId: A.t._id,
        status,
      });
      await M("Patient").create({
        tenantId: A.t._id,
        userId: u._id,
        registeredBy: u._id,
        patientId: `FAM-${first}`,
        firstName: first,
        lastName: last,
        dateOfBirth: new Date(dob),
        gender,
        contact: { phone },
      });
      return u;
    };
    const father = await mkPatient(
      "Ramesh",
      "Patil",
      "1975-03-01",
      "9811111111",
    );
    const daughter = await mkPatient(
      "Anaya",
      "Patil",
      "2012-06-10",
      "9811111111",
      "active",
      "female",
    );
    await mkPatient("Old", "Patil", "1950-01-01", "9811111111", "inactive");
    const loner = await mkPatient("Solo", "Sharma", "1990-01-01", "9822222222");

    const post = (fn, body) => call(fn, { body, ip: "1.1.1.1" });
    const askOtp = async (phone) => {
      sentOtp = null;
      const r = await post(authCtl.loginRequestOtp, { phone });
      assert.strictEqual(r.code, 200);
      return sentOtp;
    };

    // unknown number: same generic answer, nothing sent
    assert.strictEqual(await askOtp("9800000000"), null);

    const otp = await askOtp("98111 11111");
    assert.ok(
      /^\d{6}$/.test(otp),
      "an OTP was sent once for the shared number",
    );
    assert.strictEqual(
      (
        await post(authCtl.loginVerifyOtp, {
          phone: "9811111111",
          otp: "000000",
        })
      ).code,
      401,
      "wrong code",
    );

    const v = await post(authCtl.loginVerifyOtp, { phone: "9811111111", otp });
    assert.strictEqual(v.code, 200, v.message);
    const d = v.body.data;
    assert.strictEqual(d.requiresSelection, true);
    assert.deepStrictEqual(
      d.choices.map((c) => c.name).sort(),
      ["Anaya Patil", "Ramesh Patil"],
      "inactive account is not offered",
    );
    const ana = d.choices.find((c) => c.name === "Anaya Patil");
    assert.strictEqual(ana.gender, "female");
    assert.ok(
      ana.age >= 13 && ana.age <= 14,
      `age shown to tell them apart (${ana.age})`,
    );
    assert.ok(/^a\*+@fam\.test$/.test(ana.email), "email is masked");
    assert.strictEqual(
      d.choices.some((c) => "password" in c || "phone" in c),
      false,
      "no sensitive fields in the picker",
    );

    // the code is single use
    assert.strictEqual(
      (await post(authCtl.loginVerifyOtp, { phone: "9811111111", otp })).code,
      401,
      "OTP can't be replayed",
    );

    // choose
    const picked = await post(authCtl.loginSelect, {
      selectionToken: d.selectionToken,
      userId: String(daughter._id),
    });
    assert.strictEqual(picked.code, 200, picked.message);
    assert.strictEqual(
      String(picked.body.data.user.id),
      String(daughter._id),
      "signed in as the daughter",
    );
    assert.strictEqual(
      (await M("User").findById(daughter._id)).phoneVerified,
      true,
    );

    // can't pick an account that wasn't part of this sign-in, or use a forged / expired token
    const outsider = await post(authCtl.loginSelect, {
      selectionToken: d.selectionToken,
      userId: String(loner._id),
    });
    assert.strictEqual(outsider.code, 403);
    const forged = jwt.sign(
      { ids: [String(loner._id)], purpose: "select" },
      "wrong-secret",
      { expiresIn: "5m" },
    );
    assert.strictEqual(
      (
        await post(authCtl.loginSelect, {
          selectionToken: forged,
          userId: String(loner._id),
        })
      ).code,
      401,
    );
    const wrongPurpose = jwt.sign(
      { ids: [String(father._id)], purpose: "2fa" },
      `${process.env.JWT_SECRET}:select`,
      { expiresIn: "5m" },
    );
    assert.strictEqual(
      (
        await post(authCtl.loginSelect, {
          selectionToken: wrongPurpose,
          userId: String(father._id),
        })
      ).code,
      401,
    );
    const expired = jwt.sign(
      { ids: [String(father._id)], purpose: "select" },
      `${process.env.JWT_SECRET}:select`,
      { expiresIn: -10 },
    );
    assert.strictEqual(
      (
        await post(authCtl.loginSelect, {
          selectionToken: expired,
          userId: String(father._id),
        })
      ).code,
      401,
    );

    // a number that belongs to one account logs straight in (no picker)
    const otp2 = await askOtp("9822222222");
    const one = await post(authCtl.loginVerifyOtp, {
      phone: "9822222222",
      otp: otp2,
    });
    assert.strictEqual(one.code, 200, one.message);
    assert.strictEqual(String(one.body.data.user.id), String(loner._id));
    assert.strictEqual(one.body.data.requiresSelection, undefined);
  });

  console.log("\nAppointments and masters");
  await test("overlapping appointments are refused even with different start times, under a race", async () => {
    const patient = await M("Patient").findOne({ tenantId: A.t._id });
    const doctor = await M("Doctor").findOne({ tenantId: A.t._id });
    const day = new Date(Date.now() + 7 * 86_400_000);
    day.setHours(11, 0, 0, 0);
    const plus = (min) => new Date(day.getTime() + min * 60_000).toISOString();
    const mkReq = (min) => ({
      ...A.base,
      body: {
        patientId: String(patient._id),
        doctorId: String(doctor._id),
        scheduledAt: plus(min),
      },
    });
    const rs4 = await Promise.all([
      call(appointmentCtl.create, mkReq(0)),
      call(appointmentCtl.create, mkReq(5)),
      call(appointmentCtl.create, mkReq(10)),
    ]);
    assert.strictEqual(
      rs4.filter((r) => r.code === 201).length,
      1,
      JSON.stringify(rs4.map((r) => [r.code, r.message])),
    );
    const winner = rs4.find((r) => r.code === 201).body.data;
    const next = await call(appointmentCtl.create, mkReq(15)); // 15-min default: the first ends at +15
    assert.strictEqual(next.code, 201, "back-to-back is allowed");
    const cancel = await call(appointmentCtl.update, {
      ...A.base,
      params: { id: String(winner._id) },
      body: { status: "cancelled" },
    });
    assert.strictEqual(cancel.code, 200);
    const reuse = await call(appointmentCtl.create, mkReq(5));
    assert.strictEqual(
      reuse.code,
      409,
      "overlaps the 15-minute booking that follows",
    );
    const reuse2 = await call(appointmentCtl.create, mkReq(0));
    assert.strictEqual(reuse2.code, 201, "the cancelled slot is free again");
  });
  await test("departments are tenant-scoped and a doctor can only join its own tenant's", async () => {
    const mkDept = (ctx, name) =>
      call(departmentCtl.create, { ...ctx.base, body: { name } });
    const dA = await mkDept(A, "Cardiology");
    assert.strictEqual(dA.code, 201, dA.message);
    assert.strictEqual(
      (await mkDept(A, "cardiology")).code,
      409,
      "case-insensitive duplicate",
    );
    const dB = await mkDept(B, "Cardiology");
    assert.strictEqual(dB.code, 201, "same name in another tenant is fine");
    const body = {
      firstName: "N",
      lastName: "D",
      contact: { phone: "9", email: "n@x.com" },
      professionalDetails: {
        registrationNumber: "R9",
        registrationCouncil: "C",
      },
    };
    let r = await call(doctorCtl.create, {
      ...A.base,
      body: { ...body, departmentIds: [String(dB.body.data._id)] },
    });
    assert.strictEqual(r.code, 400, "other tenant's department");
    r = await call(doctorCtl.create, {
      ...A.base,
      body: {
        ...body,
        availability: [
          { day: "mon", startTime: "10:00", endTime: "12:00" },
          { day: "mon", startTime: "11:00", endTime: "13:00" },
        ],
      },
    });
    assert.strictEqual(r.code, 400, "overlapping working hours");
    r = await call(doctorCtl.create, {
      ...A.base,
      body: { ...body, departmentIds: [String(dA.body.data._id)] },
    });
    assert.strictEqual(r.code, 201, r.message);
  });

  await mongoose.disconnect();
  await rs.stop();
  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("TEST RUNNER CRASHED:", e);
  process.exit(2);
});
