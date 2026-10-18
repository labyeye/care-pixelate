// Turns a patient's clinical records into invoice lines, so billing never means re-typing what the
// system already knows: completed visits -> consultation fee, lab orders -> one line per test,
// signed prescriptions -> one line per medicine. Prices come from the clinic's price list (learned the
// first time a price is typed); anything already on a live invoice is left out so nothing is billed twice.

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const priceKey = (kind, name) => `${kind}:${norm(name)}`;
const srcKey = (kind, refId, key = "") =>
  `${kind}:${String(refId)}:${norm(key)}`;

const day = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

// prices: Map<priceKey, { price, gstRate }>   billed: Set<srcKey>
// How many units a prescription line needs: an explicit quantity wins, else frequency x days
// ("1-0-1" for 5 days = 10), else 1. Never guesses beyond that.
function quantityFor(item) {
  if (Number(item.quantity) > 0) return Number(item.quantity);
  const perDay = String(item.frequency || "").match(
    /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))+$/,
  )
    ? String(item.frequency)
        .split("-")
        .reduce((a, b) => a + Number(b), 0)
    : 0;
  return perDay > 0 && Number(item.days) > 0
    ? Math.ceil(perDay * Number(item.days))
    : 1;
}

// medicines: inventory docs ({ _id, name, strength, sellingPrice, gstRate, hsnCode, unit }); matched by the
// prescription's medicineId first, then by name (with or without strength).
function medicineIndex(medicines = []) {
  const byId = new Map();
  const byName = new Map();
  for (const m of medicines) {
    byId.set(String(m._id), m);
    byName.set(norm(m.name), m);
    if (m.strength) byName.set(norm(`${m.name} ${m.strength}`), m);
  }
  return (item) =>
    (item.medicineId && byId.get(String(item.medicineId))) ||
    byName.get(norm(item.drug));
}

function buildBillable({
  appointments = [],
  labOrders = [],
  consultations = [],
  prices = new Map(),
  billed = new Set(),
  medicines = [],
}) {
  const findMedicine = medicineIndex(medicines);
  const items = [];
  const lookup = (kind, name) => prices.get(priceKey(kind, name));

  for (const a of appointments) {
    if (billed.has(srcKey("appointment", a._id))) continue;
    items.push({
      id: srcKey("appointment", a._id),
      kind: "appointment",
      group: "Consultations",
      groupLabel: `${day(a.scheduledAt)}${a.doctorName ? ` · ${a.doctorName}` : ""}`,
      description: `Consultation${a.doctorName ? ` - ${a.doctorName}` : ""} (${day(a.scheduledAt)})`,
      qty: 1,
      rate: Number(a.fee) || 0,
      gstRate: 0, // clinical services are GST-exempt
      priced: true,
      source: { kind: "appointment", refId: String(a._id), key: "" },
    });
  }

  for (const o of labOrders) {
    for (const t of o.tests || []) {
      if (billed.has(srcKey("lab", o._id, t.name))) continue;
      const p = lookup("lab", t.name);
      items.push({
        id: srcKey("lab", o._id, t.name),
        kind: "lab",
        group: "Lab tests",
        groupLabel: `${o.number} · ${day(o.createdAt)}`,
        description: `Lab: ${t.name}`,
        qty: 1,
        rate: p ? p.price : 0,
        gstRate: p ? p.gstRate : 0,
        priced: !!p,
        source: { kind: "lab", refId: String(o._id), key: t.name },
      });
    }
  }

  for (const c of consultations) {
    for (const m of (c.prescription && c.prescription.items) || []) {
      if (!m.drug || billed.has(srcKey("medicine", c._id, m.drug))) continue;
      const inv = findMedicine(m); // the clinic's own stock list is the source of truth for price / GST / HSN
      const p = inv ? null : lookup("medicine", m.drug);
      items.push({
        id: srcKey("medicine", c._id, m.drug),
        kind: "medicine",
        group: "Medicines",
        groupLabel: `${day(c.signedAt || c.createdAt)}${c.doctorName ? ` · ${c.doctorName}` : ""}`,
        description: `Medicine: ${inv ? inv.name + (inv.strength && !norm(inv.name).includes(norm(inv.strength)) ? " " + inv.strength : "") : m.drug}${!inv && m.dose ? ` ${m.dose}` : ""}`,
        qty: quantityFor(m),
        rate: inv ? Number(inv.sellingPrice) || 0 : p ? p.price : 0,
        gstRate: inv ? Number(inv.gstRate) || 0 : p ? p.gstRate : 0,
        hsnCode: inv ? inv.hsnCode || "" : "",
        unit: inv ? inv.unit || "" : "",
        medicineId: inv ? String(inv._id) : undefined,
        priced: !!inv || !!p,
        source: { kind: "medicine", refId: String(c._id), key: m.drug },
      });
    }
  }
  return items;
}

module.exports = { buildBillable, priceKey, srcKey, norm, quantityFor };

if (require.main === module) {
  const assert = require("assert");
  const prices = new Map([
    [priceKey("lab", "Hemoglobin"), { price: 150, gstRate: 0 }],
    [priceKey("medicine", "paracetamol"), { price: 20, gstRate: 12 }],
  ]);
  const billed = new Set([srcKey("lab", "L1", "WBC count")]);
  const items = buildBillable({
    appointments: [
      {
        _id: "A1",
        scheduledAt: "2026-10-10T05:00:00Z",
        fee: 600,
        doctorName: "Dr. Kulkarni",
      },
      { _id: "A2", scheduledAt: "2026-10-11T05:00:00Z", fee: 500 },
    ],
    labOrders: [
      {
        _id: "L1",
        number: "LAB-1",
        createdAt: "2026-10-10",
        tests: [{ name: "Hemoglobin" }, { name: "WBC count" }],
      },
    ],
    consultations: [
      {
        _id: "C1",
        signedAt: "2026-10-10",
        doctorName: "Dr. Kulkarni",
        prescription: {
          items: [
            { drug: "Paracetamol", dose: "650 mg" },
            { drug: "Cetirizine" },
          ],
        },
      },
    ],
    prices,
    billed: new Set([...billed, srcKey("appointment", "A2")]),
  });
  assert.deepStrictEqual(
    items.map((i) => i.kind),
    ["appointment", "lab", "medicine", "medicine"],
  );
  assert.strictEqual(items[1].rate, 150); // Hemoglobin from the price list; WBC already billed, so absent
  assert.strictEqual(items[2].gstRate, 12);
  assert.strictEqual(
    items[3].priced,
    false,
    "unknown medicine price is flagged for the user to fill once",
  );
  assert.strictEqual(items[0].rate, 600);
  assert.ok(
    !items.some((i) => i.id.includes("a2")),
    "billed appointment not offered again",
  );
  // medicines: stock list wins (price / GST / HSN / unit), quantity = frequency x days
  assert.strictEqual(quantityFor({ frequency: "1-0-1", days: 5 }), 10);
  assert.strictEqual(quantityFor({ frequency: "SOS", days: 5 }), 1);
  assert.strictEqual(
    quantityFor({ frequency: "1-1-1", days: 3, quantity: 12 }),
    12,
    "explicit quantity beats the formula",
  );
  const inv = buildBillable({
    consultations: [
      {
        _id: "C9",
        signedAt: "2026-10-10",
        prescription: {
          items: [
            { drug: "Paracetamol 500 mg", frequency: "1-0-1", days: 5 },
            { medicineId: "M2", drug: "x", quantity: 3 },
          ],
        },
      },
    ],
    medicines: [
      {
        _id: "M1",
        name: "Paracetamol",
        strength: "500 mg",
        sellingPrice: 2.5,
        gstRate: 12,
        hsnCode: "30049099",
        unit: "tablet",
      },
      {
        _id: "M2",
        name: "Cetrizine",
        sellingPrice: 4,
        gstRate: 5,
        unit: "tablet",
      },
    ],
  });
  assert.deepStrictEqual(
    [
      inv[0].qty,
      inv[0].rate,
      inv[0].gstRate,
      inv[0].hsnCode,
      inv[0].unit,
      inv[0].priced,
    ],
    [10, 2.5, 12, "30049099", "tablet", true],
  );
  assert.deepStrictEqual(
    [inv[1].medicineId, inv[1].qty, inv[1].rate],
    ["M2", 3, 4],
  );
  console.log("billable ok");
}
