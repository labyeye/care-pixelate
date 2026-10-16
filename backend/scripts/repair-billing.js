// One-off repair for payments hit by the old /billing/verify bug: pendingOrder was blanked before it was
// read, so the paid invoice was saved without number-details/amount/plan and the Tenant (plan, expiry,
// limits) was never updated, even though the payment itself succeeded.
//   node scripts/repair-billing.js            dry run: show what would be completed
//   node scripts/repair-billing.js --apply    complete the paid purchase
// Amounts are recomputed from the same server price table the order was created with (pricing.js).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const Tenant = require("../models/Tenant");
const { PLANS, calculatePricing } = require("../utils/pricing");

const APPLY = process.argv.includes("--apply");
const STAFF_PER_DOCTOR = 5; // same constant as routes/billingRoutes.js
const broken = (i) => i.status === "paid" && i.razorpayPaymentId && (typeof i.amount !== "number" || !i.plan);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const subs = await Subscription.find({ "invoices.0": { $exists: true } });
  let hit = 0;
  for (const sub of subs) {
    const bad = sub.invoices.filter(broken);
    if (!bad.length) continue;
    hit++;
    const tenant = await Tenant.findById(sub.tenant);
    const plan = PLANS[sub.plan] ? sub.plan : null;
    const doctors = Math.max(sub.doctors || 1, plan ? PLANS[plan].minDoctors : 1);
    const cycle = sub.billingCycle === "yearly" ? "yearly" : "monthly";
    console.log(`- ${tenant?.name}: ${bad.length} paid invoice(s) missing details; subscription=${sub.status}/${sub.plan}/${cycle}, tenant plan=${tenant?.plan}`);
    if (!plan) {
      console.log("  cannot repair: subscription has no valid plan");
      continue;
    }
    const price = calculatePricing(plan, doctors, cycle);
    console.log(`  would set: plan=${plan}, doctors=${doctors}, ${cycle}, subtotal=${price.subtotal}, gst=${price.gst}, total=${price.total}`);
    console.log(`  tenant -> plan=${plan}, planExpiresAt=${sub.currentPeriodEnd?.toISOString()}, doctorLimit=${doctors}`);
    if (!APPLY) continue;

    let n = 0;
    for (const i of bad) {
      i.invoiceNumber = i.invoiceNumber || `INV-NC-${String(++n).padStart(4, "0")}`;
      i.plan = plan;
      i.doctors = doctors;
      i.billingCycle = cycle;
      i.subtotal = price.subtotal;
      i.gst = price.gst;
      i.amount = price.total;
    }
    sub.doctors = doctors;
    await sub.save();
    if (tenant && sub.currentPeriodEnd) {
      await Tenant.findByIdAndUpdate(tenant._id, {
        plan,
        planExpiresAt: sub.currentPeriodEnd,
        status: "active",
        "limits.doctorLimit": doctors,
        "limits.patientLimit": 0,
        "limits.userLimit": doctors * STAFF_PER_DOCTOR,
      });
    }
    console.log("  repaired.");
  }
  console.log(hit ? (APPLY ? "Done." : "Dry run only. Re-run with --apply to repair.") : "Nothing to repair.");
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
