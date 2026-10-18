// Invoice maths in whole rupees-and-paise (rounded to 2 dp). Clinical services are GST-exempt
// in India, so item gstRate defaults to 0; pharmacy/goods lines can carry 5/12/18.
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function computeTotals(items, discount = 0) {
  let subtotal = 0;
  let gst = 0;
  const lines = items.map((i) => {
    const qty = Number(i.qty ?? 1);
    const rate = Number(i.rate);
    const gstRate = Number(i.gstRate ?? 0);
    if (!i.description || !String(i.description).trim())
      throw new Error("Every line needs a description");
    if (!(qty > 0) || !(rate >= 0) || !(gstRate >= 0 && gstRate <= 28))
      throw new Error("Invalid quantity, rate or GST rate");
    const discountPercent = Number(i.discountPercent ?? 0);
    if (!(discountPercent >= 0 && discountPercent <= 100))
      throw new Error("Line discount must be between 0 and 100%");
    const amount = r2(qty * rate * (1 - discountPercent / 100)); // taxable value of the line
    subtotal += amount;
    gst += r2((amount * gstRate) / 100);
    const line = {
      description: String(i.description).trim().slice(0, 200),
      qty,
      rate,
      gstRate,
      amount,
      discountPercent,
      hsnCode: String(i.hsnCode || "")
        .trim()
        .slice(0, 12),
      unit: String(i.unit || "")
        .trim()
        .slice(0, 20),
    };
    if (/^[0-9a-f]{24}$/i.test(String(i.medicineId || "")))
      line.medicineId = String(i.medicineId);
    const src = i.source;
    if (
      src &&
      ["appointment", "lab", "medicine"].includes(src.kind) &&
      /^[0-9a-f]{24}$/i.test(String(src.refId))
    ) {
      line.source = {
        kind: src.kind,
        refId: String(src.refId),
        key: String(src.key || "").slice(0, 160),
      };
    }
    return line;
  });
  if (!lines.length) throw new Error("Add at least one line item");
  const disc = Number(discount) || 0;
  if (disc < 0 || disc > subtotal)
    throw new Error("Discount must be between 0 and the subtotal");
  subtotal = r2(subtotal);
  gst = r2(gst);
  return {
    lines,
    subtotal,
    gst,
    discount: r2(disc),
    total: r2(subtotal - disc + gst),
  };
}

// Derives status from what has been paid; "void" is set explicitly and sticks.
function statusFor(total, paid, current) {
  if (current === "void") return "void";
  if (paid <= 0) return "unpaid";
  return paid + 0.001 >= total ? "paid" : "partial";
}

module.exports = { computeTotals, statusFor, r2 };

if (require.main === module) {
  const assert = require("assert");
  const t = computeTotals(
    [
      { description: "Consult", qty: 1, rate: 500 },
      { description: "Syrup", qty: 2, rate: 100.5, gstRate: 12 },
    ],
    50,
  );
  assert.deepStrictEqual(
    [t.subtotal, t.gst, t.discount, t.total],
    [701, 24.12, 50, 675.12],
  );
  assert.throws(() => computeTotals([]));
  assert.throws(() => computeTotals([{ description: "x", rate: 10 }], 11));
  assert.throws(() => computeTotals([{ description: " ", rate: 10 }]));
  assert.strictEqual(statusFor(100, 0), "unpaid");
  assert.strictEqual(statusFor(100, 40), "partial");
  assert.strictEqual(statusFor(100, 100), "paid");
  assert.strictEqual(statusFor(100, 100, "void"), "void");
  // per-line discount reduces the taxable value, GST is charged on what is left
  const d = computeTotals([
    {
      description: "Strip",
      qty: 2,
      rate: 100,
      gstRate: 12,
      discountPercent: 10,
      hsnCode: "30049099",
      unit: "strip",
    },
  ]);
  assert.deepStrictEqual(
    [d.lines[0].amount, d.gst, d.total],
    [180, 21.6, 201.6],
  );
  assert.strictEqual(d.lines[0].hsnCode, "30049099");
  assert.throws(() =>
    computeTotals([{ description: "x", rate: 10, discountPercent: 120 }]),
  );
  console.log("invoice ok");
}
