// Per-doctor subscription pricing (clinic software norm), GST added on top,
// yearly = 12x monthly (same rule as NestAcademy). Amounts in rupees; x100 for paise.
// ponytail: prices are placeholders pending owner sign-off; edit PLANS only.
const GST_RATE = 18;

const PLANS = {
  starter: {
    name: "Starter",
    perDoctor: 499,
    minDoctors: 1,
    features: [
      "Patients & appointments",
      "E-prescriptions",
      "Medical records",
      "In-app reminders",
    ],
  },
  pro: {
    name: "Pro",
    perDoctor: 899,
    minDoctors: 1,
    features: [
      "Everything in Starter",
      "WhatsApp reminders & Rx",
      "Billing & GST invoices",
      "Analytics",
      "Video consult",
    ],
  },
  clinic: {
    name: "Clinic / Hospital",
    perDoctor: 1499,
    minDoctors: 5,
    features: [
      "Everything in Pro",
      "Multi-branch",
      "Roles & permissions",
      "ABDM",
      "Lab & pharmacy",
    ],
  },
};

const TRIAL = { days: 14, doctorLimit: 1, patientLimit: 50 };

function calculatePricing(planId, doctors, billingCycle = "monthly") {
  const plan = PLANS[planId];
  if (!plan) throw new Error("Unknown plan");
  const n = Math.floor(Number(doctors));
  if (!Number.isFinite(n) || n < plan.minDoctors || n > 1000) {
    throw new Error(`${plan.name} needs at least ${plan.minDoctors} doctor(s)`);
  }
  const monthlySubtotal = n * plan.perDoctor;
  const subtotal =
    billingCycle === "yearly" ? monthlySubtotal * 12 : monthlySubtotal;
  const gst = Math.round((subtotal * GST_RATE) / 100);
  return {
    plan: planId,
    doctors: n,
    billingCycle,
    ratePerDoctor: plan.perDoctor,
    subtotal,
    gst,
    gstRate: GST_RATE,
    total: subtotal + gst,
  };
}

module.exports = { PLANS, TRIAL, GST_RATE, calculatePricing };

if (require.main === module) {
  const assert = require("assert");
  const p = calculatePricing("pro", 3);
  assert.deepStrictEqual([p.subtotal, p.gst, p.total], [2697, 485, 3182]);
  assert.strictEqual(calculatePricing("starter", 2, "yearly").subtotal, 11976);
  assert.throws(() => calculatePricing("clinic", 2));
  assert.throws(() => calculatePricing("nope", 1));
  console.log("pricing ok");
}
