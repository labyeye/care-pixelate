// Seeds realistic sample data into ONE existing tenant (the one owned by the given email).
//   node scripts/seed-sample.js labh@hospital.com            seed (idempotent)
//   node scripts/seed-sample.js labh@hospital.com --check    read-only: show owner/tenant + what exists
//   node scripts/seed-sample.js labh@hospital.com --remove   delete everything this script created
// Everything it creates carries an "SMP" marker (IDs / invoice numbers / @example.com emails),
// so --remove can find it again without touching real records. It never edits the owner or the tenant.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const email = (process.argv[2] || "").toLowerCase().trim();
const MODE = process.argv.includes("--remove") ? "remove" : process.argv.includes("--check") ? "check" : "seed";
if (!email.includes("@")) {
  console.error("Usage: node scripts/seed-sample.js <owner-email> [--check | --remove]");
  process.exit(1);
}

const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const StaffProfile = require("../models/StaffProfile");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Invoice = require("../models/Invoice");
const LabOrder = require("../models/LabOrder");
const { Clinic } = require("../models/Compliance");
const { computeTotals, statusFor } = require("../utils/invoice");

const SAMPLE_PASSWORD = "Sample@1234";
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const IST = "+05:30";

// ---- tiny deterministic helpers (so re-runs build the same data) ----
let seed = 20260101;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ymd = (d) => new Date(d.getTime() + 330 * MIN).toISOString().slice(0, 10);
const at = (daysFromToday, hh, mm = 0) => {
  const base = ymd(new Date(Date.now() + daysFromToday * DAY));
  return new Date(`${base}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${IST}`);
};

const DOCTORS = [
  { first: "Rajesh", last: "Kulkarni", gender: "male", spec: ["General Medicine"], deg: ["MBBS", "MD (Medicine)"], reg: "MMC-2011-48213", exp: 14, fee: 600, follow: 300, video: true, days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: "09:00", to: "14:00" },
  { first: "Anita", last: "Deshmukh", gender: "female", spec: ["Gynaecology & Obstetrics"], deg: ["MBBS", "MS (OBG)"], reg: "MMC-2014-61577", exp: 11, fee: 800, follow: 400, video: true, days: ["mon", "wed", "fri", "sat"], from: "10:00", to: "16:00" },
  { first: "Sanjay", last: "Patil", gender: "male", spec: ["Paediatrics"], deg: ["MBBS", "DCH"], reg: "MMC-2016-70342", exp: 8, fee: 500, follow: 250, video: false, days: ["mon", "tue", "thu", "fri"], from: "16:00", to: "20:00" },
  { first: "Meera", last: "Iyer", gender: "female", spec: ["Dermatology"], deg: ["MBBS", "MD (Dermatology)"], reg: "TNMC-2015-33981", exp: 9, fee: 700, follow: 350, video: true, days: ["tue", "thu", "sat"], from: "11:00", to: "17:00" },
];

const PATIENTS = [
  ["Aarav", "Sharma", "male", "1988-03-14", "9820011101", "Pune", "Maharashtra", ["Penicillin"], ["Hypertension"]],
  ["Priya", "Nair", "female", "1992-07-22", "9820011102", "Pune", "Maharashtra", [], []],
  ["Rohan", "Mehta", "male", "1979-11-05", "9820011103", "Mumbai", "Maharashtra", ["Sulfa drugs"], ["Type 2 Diabetes", "Hypertension"]],
  ["Sneha", "Kulkarni", "female", "1995-01-30", "9820011104", "Pune", "Maharashtra", [], ["Asthma"]],
  ["Vikram", "Singh", "male", "1965-09-09", "9820011105", "Nashik", "Maharashtra", ["Aspirin"], ["Coronary artery disease"]],
  ["Anjali", "Desai", "female", "2016-04-18", "9820011106", "Pune", "Maharashtra", [], []],
  ["Karthik", "Rao", "male", "1990-12-02", "9820011107", "Bengaluru", "Karnataka", [], []],
  ["Fatima", "Sheikh", "female", "1984-06-25", "9820011108", "Pune", "Maharashtra", ["Latex"], ["Hypothyroidism"]],
  ["Manoj", "Gupta", "male", "1972-02-11", "9820011109", "Pune", "Maharashtra", [], ["Type 2 Diabetes"]],
  ["Divya", "Joshi", "female", "2001-08-07", "9820011110", "Satara", "Maharashtra", [], []],
  ["Suresh", "Pawar", "male", "1958-10-28", "9820011111", "Pune", "Maharashtra", ["Ibuprofen"], ["Osteoarthritis", "Hypertension"]],
  ["Neha", "Verma", "female", "1998-05-16", "9820011112", "Pune", "Maharashtra", [], []],
  ["Arjun", "Reddy", "male", "2019-09-21", "9820011113", "Hyderabad", "Telangana", [], []],
  ["Kavita", "Bhosale", "female", "1980-03-03", "9820011114", "Pune", "Maharashtra", [], ["Migraine"]],
  ["Imran", "Khan", "male", "1993-07-19", "9820011115", "Pune", "Maharashtra", [], []],
].map((p, i) => ({
  patientId: `SMP-P${String(i + 1).padStart(3, "0")}`,
  firstName: p[0], lastName: p[1], gender: p[2], dateOfBirth: new Date(p[3]),
  phone: p[4], city: p[5], state: p[6], allergies: p[7], conditions: p[8],
}));

const COMPLAINTS = [
  ["Fever with body ache for 3 days", ["Viral fever"], [{ drug: "Paracetamol", dose: "650 mg", frequency: "1-1-1", days: 3, instructions: "After food" }], "Plenty of fluids, rest"],
  ["Cough and cold since 5 days", ["Acute upper respiratory infection"], [{ drug: "Cetirizine", dose: "10 mg", frequency: "0-0-1", days: 5, instructions: "At night" }, { drug: "Steam inhalation", dose: "", frequency: "2 times daily", days: 3, instructions: "" }], "Avoid cold drinks"],
  ["Routine diabetes follow-up", ["Type 2 Diabetes Mellitus"], [{ drug: "Metformin", dose: "500 mg", frequency: "1-0-1", days: 30, instructions: "After meals" }], "Low-sugar diet, 30 min walk daily"],
  ["Headache and acidity", ["Gastritis"], [{ drug: "Pantoprazole", dose: "40 mg", frequency: "1-0-0", days: 14, instructions: "Before breakfast" }], "Avoid spicy food"],
  ["Skin rash with itching", ["Allergic dermatitis"], [{ drug: "Levocetirizine", dose: "5 mg", frequency: "0-0-1", days: 7, instructions: "" }, { drug: "Calamine lotion", dose: "", frequency: "Twice daily", days: 7, instructions: "Apply on rash" }], "Avoid known allergens"],
  ["Blood pressure review", ["Essential hypertension"], [{ drug: "Amlodipine", dose: "5 mg", frequency: "1-0-0", days: 30, instructions: "Same time daily" }], "Reduce salt, monitor BP weekly"],
];

const LAB_PANELS = [
  { name: "Complete Blood Count", tests: [{ name: "Hemoglobin", unit: "g/dL", lo: 12, hi: 16 }, { name: "WBC count", unit: "x10^3/uL", lo: 4, hi: 11 }, { name: "Platelets", unit: "x10^3/uL", lo: 150, hi: 450 }] },
  { name: "Lipid Profile", tests: [{ name: "Total Cholesterol", unit: "mg/dL", lo: 0, hi: 200 }, { name: "LDL", unit: "mg/dL", lo: 0, hi: 100 }, { name: "HDL", unit: "mg/dL", lo: 40, hi: 100 }] },
  { name: "Blood Sugar", tests: [{ name: "Fasting Glucose", unit: "mg/dL", lo: 70, hi: 100 }, { name: "HbA1c", unit: "%", lo: 4, hi: 5.7 }] },
  { name: "Thyroid Profile", tests: [{ name: "TSH", unit: "uIU/mL", lo: 0.4, hi: 4.0 }] },
];

async function findTenant() {
  const owner = await User.findOne({ email });
  if (!owner) throw new Error(`No user with email ${email}`);
  if (!owner.tenantId) throw new Error("This account has no organisation yet (finish onboarding first)");
  const tenant = await Tenant.findById(owner.tenantId);
  if (!tenant) throw new Error("Organisation record not found");
  return { owner, tenant };
}

const sampleFilter = (tenantId) => ({
  patients: { tenantId, patientId: /^SMP-/ },
  doctors: { tenantId, doctorId: /^SMP-/ },
  staff: { tenantId, staffId: /^SMP-/ },
  clinics: { tenantId, code: /^SMP/ },
  invoices: { tenantId, number: /^SMP-/ },
  labs: { tenantId, number: /^SMP-/ },
});

async function counts(tenantId) {
  const f = sampleFilter(tenantId);
  const patients = await Patient.find(f.patients).select("_id");
  const pids = patients.map((p) => p._id);
  return {
    patients: patients.length,
    doctors: await Doctor.countDocuments(f.doctors),
    staff: await StaffProfile.countDocuments(f.staff),
    clinics: await Clinic.countDocuments(f.clinics),
    appointments: await Appointment.countDocuments({ tenantId, patientId: { $in: pids } }),
    consultations: await Consultation.countDocuments({ tenantId, patientId: { $in: pids } }),
    invoices: await Invoice.countDocuments(f.invoices),
    labOrders: await LabOrder.countDocuments(f.labs),
  };
}

async function remove(tenantId) {
  const f = sampleFilter(tenantId);
  const pids = (await Patient.find(f.patients).select("_id")).map((p) => p._id);
  const staffUsers = (await StaffProfile.find(f.staff).select("userId")).map((s) => s.userId);
  const out = {
    consultations: (await Consultation.deleteMany({ tenantId, patientId: { $in: pids } })).deletedCount,
    invoices: (await Invoice.deleteMany(f.invoices)).deletedCount,
    labOrders: (await LabOrder.deleteMany(f.labs)).deletedCount,
    appointments: (await Appointment.deleteMany({ tenantId, patientId: { $in: pids } })).deletedCount,
    patients: (await Patient.deleteMany(f.patients)).deletedCount,
    doctors: (await Doctor.deleteMany(f.doctors)).deletedCount,
    staffProfiles: (await StaffProfile.deleteMany(f.staff)).deletedCount,
    staffLogins: (await User.deleteMany({ _id: { $in: staffUsers }, tenantId, email: /@example\.com$/ })).deletedCount,
    clinics: (await Clinic.deleteMany(f.clinics)).deletedCount,
  };
  return out;
}

async function seedAll(owner, tenant) {
  const tenantId = tenant._id;
  const created = {};
  const bump = (k) => (created[k] = (created[k] || 0) + 1);

  // ---- locations ----
  const clinicDefs = [
    { name: "Main Hospital", code: "SMPMAIN", city: "Pune" },
    { name: "Kothrud Branch", code: "SMPKOTH", city: "Pune" },
  ];
  const clinics = [];
  for (const c of clinicDefs) {
    let doc = await Clinic.findOne({ tenantId, code: c.code });
    if (!doc) {
      doc = await Clinic.create({ tenantId, name: c.name, code: c.code, phone: "02025501234", address: { street: "FC Road", city: c.city, state: "Maharashtra", pincode: "411004" } });
      bump("clinics");
    }
    clinics.push(doc);
  }

  // ---- doctors ----
  const doctors = [];
  for (let i = 0; i < DOCTORS.length; i++) {
    const d = DOCTORS[i];
    const doctorId = `SMP-D${String(i + 1).padStart(2, "0")}`;
    let doc = await Doctor.findOne({ tenantId, doctorId });
    if (!doc) {
      doc = await Doctor.create({
        tenantId, doctorId, firstName: d.first, lastName: d.last, gender: d.gender,
        contact: { phone: `98900000${i + 1}0`, email: `${d.first}.${d.last}@example.com`.toLowerCase() },
        professionalDetails: {
          registrationNumber: d.reg, registrationCouncil: d.reg.startsWith("TN") ? "Tamil Nadu Medical Council" : "Maharashtra Medical Council",
          qualifications: d.deg.map((degree) => ({ degree, institution: "", year: null })),
          specializations: d.spec, experienceYears: d.exp, languages: ["English", "Hindi", "Marathi"],
          bio: `${d.spec[0]} specialist with ${d.exp} years of experience.`,
        },
        consultation: {
          consultationFee: d.fee, followUpFee: d.follow, appointmentDurationMinutes: 15,
          consultationModes: d.video ? ["in_person", "video"] : ["in_person"], acceptingAppointments: true,
        },
        availability: d.days.map((day) => ({ day, startTime: d.from, endTime: d.to })),
        clinicIds: [clinics[i % clinics.length]._id],
        verificationStatus: "verified", verifiedAt: new Date(), verifiedBy: owner._id,
        accountStatus: "active", createdBy: owner._id,
      });
      bump("doctors");
    }
    doctors.push(doc);
  }

  // ---- staff (login + profile) ----
  const staffDefs = [
    { first: "Pooja", last: "Shinde", role: "receptionist", designation: "Front Desk Executive", department: "Reception" },
    { first: "Ritu", last: "Menon", role: "nurse", designation: "Staff Nurse", department: "Nursing" },
    { first: "Amit", last: "Jadhav", role: "lab_technician", designation: "Lab Technician", department: "Pathology" },
  ];
  for (let i = 0; i < staffDefs.length; i++) {
    const s = staffDefs[i];
    const staffId = `SMP-S${String(i + 1).padStart(2, "0")}`;
    if (await StaffProfile.exists({ tenantId, staffId })) continue;
    const loginEmail = `${s.first}.${s.last}@example.com`.toLowerCase();
    let user = await User.findOne({ email: loginEmail });
    if (!user) {
      user = await User.create({ name: `${s.first} ${s.last}`, email: loginEmail, password: SAMPLE_PASSWORD, role: s.role, tenantId, phone: `98910000${i + 1}0` });
    }
    await StaffProfile.create({
      tenantId, userId: user._id, staffId, firstName: s.first, lastName: s.last,
      contact: { phone: `98910000${i + 1}0`, email: "" },
      employment: { designation: s.designation, department: s.department, employmentType: "full_time", joiningDate: at(-200, 9), shift: "general", workDays: ["mon", "tue", "wed", "thu", "fri", "sat"], workStart: "09:00", workEnd: "18:00" },
      createdBy: owner._id,
    });
    bump("staff");
  }

  // ---- patients ----
  const patients = [];
  for (const p of PATIENTS) {
    let doc = await Patient.findOne({ tenantId, patientId: p.patientId });
    if (!doc) {
      doc = await Patient.create({
        tenantId, patientId: p.patientId, firstName: p.firstName, lastName: p.lastName, gender: p.gender, dateOfBirth: p.dateOfBirth,
        bloodGroup: pick(["A+", "B+", "O+", "AB+", "O-", "unknown"]),
        contact: { phone: p.phone, email: `${p.firstName}.${p.lastName}@example.com`.toLowerCase() },
        address: { street: "", city: p.city, state: p.state, pincode: "411001", country: "India" },
        emergencyContact: { name: "Family contact", relationship: "spouse", phone: "9822200000" },
        medicalSummary: { allergies: p.allergies, chronicConditions: p.conditions },
        registeredBy: owner._id,
      });
      bump("patients");
    }
    patients.push(doc);
  }

  // ---- appointments + consultations + invoices (skipped if this run's appointments already exist) ----
  const haveAppts = await Appointment.countDocuments({ tenantId, patientId: { $in: patients.map((p) => p._id) } });
  if (!haveAppts) {
    const slotUsed = new Set();
    const plan = [];
    // 3 weeks back (mostly completed), today, and the coming week (scheduled)
    for (let dayOff = -21; dayOff <= 7; dayOff++) {
      const perDay = dayOff === 0 ? 4 : 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < perDay; k++) plan.push(dayOff);
    }
    let invCounter = 0;
    let labCounter = 0;
    for (const dayOff of plan) {
      const doc = pick(doctors);
      const pat = pick(patients);
      const d0 = doc.availability[0];
      const startH = parseInt(d0.startTime.slice(0, 2), 10);
      const when = at(dayOff, startH + Math.floor(rnd() * 4), pick([0, 15, 30, 45]));
      const key = `${doc._id}|${when.getTime()}`;
      if (slotUsed.has(key)) continue;
      slotUsed.add(key);

      const past = when.getTime() < Date.now();
      let status = "scheduled";
      if (past) status = rnd() < 0.78 ? "completed" : rnd() < 0.6 ? "cancelled" : "no_show";
      const video = doc.consultation.consultationModes.includes("video") && rnd() < 0.2;

      const appt = await Appointment.create({
        tenantId, patientId: pat._id, doctorId: doc._id, clinicId: doc.clinicIds[0],
        scheduledAt: when, endsAt: new Date(when.getTime() + 15 * MIN),
        type: video ? "video" : "in_clinic", status,
        reason: pick(COMPLAINTS)[0], fee: doc.consultation.consultationFee,
        paymentStatus: status === "completed" ? "paid" : "unpaid",
        ...(status === "completed" ? { completedAt: new Date(when.getTime() + 20 * MIN), checkedInAt: new Date(when.getTime() - 5 * MIN) } : {}),
        ...(status === "cancelled" ? { cancelReason: "Patient requested reschedule" } : {}),
        source: pick(["reception", "app", "web"]),
        ...(video ? { videoRoom: `NestCare-sample-${doc._id}-${when.getTime()}` } : {}),
      });
      bump("appointments");

      if (status !== "completed") continue;

      const c = pick(COMPLAINTS);
      await Consultation.create({
        tenantId, appointmentId: appt._id, patientId: pat._id, doctorId: doc._id,
        vitals: { bp: pick(["120/80", "130/85", "110/70", "140/90"]), pulse: 68 + Math.floor(rnd() * 25), tempC: 36.6 + Math.round(rnd() * 20) / 10, spo2: 96 + Math.floor(rnd() * 4), weightKg: 50 + Math.floor(rnd() * 40) },
        complaints: c[0], diagnosis: c[1], notes: "Examined; advised as below.",
        prescription: { items: c[2], advice: c[3] }, followUpOn: new Date(when.getTime() + 7 * DAY),
        status: "signed", signedAt: new Date(when.getTime() + 18 * MIN),
      });
      bump("consultations");

      // invoice: most paid, some partial, a few unpaid (older ones are more likely settled)
      invCounter++;
      const items = [{ description: `Consultation - Dr. ${doc.firstName} ${doc.lastName}`, qty: 1, rate: doc.consultation.consultationFee, gstRate: 0 }];
      if (rnd() < 0.3) items.push({ description: "Dressing / procedure charges", qty: 1, rate: 200, gstRate: 0 });
      const t = computeTotals(items, 0);
      const roll = rnd();
      const paid = roll < 0.65 ? t.total : roll < 0.85 ? Math.round(t.total / 2) : 0;
      await Invoice.create({
        tenantId, number: `SMP-INV-${String(invCounter).padStart(4, "0")}`, patientId: pat._id, appointmentId: appt._id,
        items: t.lines, subtotal: t.subtotal, gst: t.gst, discount: 0, total: t.total, paid,
        payments: paid ? [{ amount: paid, mode: pick(["cash", "upi", "card"]), reference: "", receivedBy: owner._id, receivedAt: new Date(when.getTime() + 25 * MIN) }] : [],
        status: statusFor(t.total, paid), createdBy: owner._id,
      });
      bump("invoices");

      // ~25% get a lab order, in different stages
      if (rnd() < 0.25) {
        labCounter++;
        const panel = pick(LAB_PANELS);
        const stage = pick(["resulted", "resulted", "collected", "ordered"]);
        const tests = panel.tests.map((tt) => {
          const base = { name: tt.name, unit: tt.unit, refLow: tt.lo, refHigh: tt.hi, result: "", flag: "" };
          if (stage !== "resulted") return base;
          const v = tt.lo + (tt.hi - tt.lo) * (rnd() * 1.5 - 0.1); // sometimes outside the range
          const val = Math.round(v * 10) / 10;
          return { ...base, result: String(val), flag: val < tt.lo ? "low" : val > tt.hi ? "high" : "normal" };
        });
        await LabOrder.create({
          tenantId, number: `SMP-LAB-${String(labCounter).padStart(4, "0")}`, patientId: pat._id, doctorId: doc._id,
          tests, status: stage, notes: panel.name,
          ...(stage !== "ordered" ? { collectedAt: new Date(when.getTime() + 30 * MIN) } : {}),
          ...(stage === "resulted" ? { resultedAt: new Date(when.getTime() + 4 * 60 * MIN) } : {}),
          createdBy: owner._id,
        });
        bump("labOrders");
      }
    }
  }
  return created;
}

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in backend/.env");
  await mongoose.connect(process.env.MONGO_URI);
  const { owner, tenant } = await findTenant();
  console.log(`Owner : ${owner.name} <${owner.email}> (${owner.role})`);
  console.log(`Tenant: ${tenant.name}  slug=${tenant.slug}  plan=${tenant.plan}  orgType=${tenant.orgType}`);

  if (MODE === "check") {
    console.log("Sample data currently present:", await counts(tenant._id));
  } else if (MODE === "remove") {
    console.log("Removed:", await remove(tenant._id));
  } else {
    const created = await seedAll(owner, tenant);
    console.log("Created this run:", created);
    console.log("Totals now      :", await counts(tenant._id));
    console.log(`Sample staff logins use password: ${SAMPLE_PASSWORD}`);
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
