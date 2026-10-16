// Fills EVERY field of the sample data for one tenant and seeds the models seed-sample.js doesn't touch.
//   node scripts/seed-sample.js  labh@hospital.com            (base rows: patients, doctors, staff, appointments ...)
//   node scripts/seed-full.js    labh@hospital.com            enrich + extras (idempotent)
//   node scripts/seed-full.js    labh@hospital.com --check    read-only counts
//   node scripts/seed-full.js    labh@hospital.com --remove   delete the extras this script created
//
// Enrichment only $sets fields on rows carrying the SMP marker, so re-runs converge to the same data and
// `seed-sample.js --remove` still removes everything. The tenant record is only touched where a field is
// still blank. Subscription is deliberately left alone: it mirrors real billing state / invoice numbering.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const email = (process.argv[2] || "").toLowerCase().trim();
const MODE = process.argv.includes("--remove") ? "remove" : process.argv.includes("--check") ? "check" : "seed";
if (!email.includes("@")) {
  console.error("Usage: node scripts/seed-full.js <owner-email> [--check | --remove]");
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
const { Clinic, AuditLog, AbhaLink, ConsentLog } = require("../models/Compliance");
const { Vital, MedicineReminder, MedicalRecord } = require("../models/PatientData");
const { computeTotals, statusFor } = require("../utils/invoice");

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const IST = "+05:30";
const ymd = (d) => new Date(d.getTime() + 330 * MIN).toISOString().slice(0, 10);
const at = (daysFromToday, hh, mm = 0) =>
  new Date(`${ymd(new Date(Date.now() + daysFromToday * DAY))}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${IST}`);
const cycle = (arr, i) => arr[i % arr.length];

// ---------------------------------------------------------------- reference data
const PATIENT_PROFILE = [
  // middle, marital, street, altPhone, [emName, emRel, emPhone], guardian[name, rel, phone] | null,
  // pastMedical, pastSurgical, family, meds[[name,dose,freq]], notes
  ["Ramesh", "married", "Flat 12, Shivaji Nagar", "9822011101", ["Neha Sharma", "Spouse", "9822011191"], null, ["Typhoid (2012)"], [], ["Hypertension", "Diabetes"], [["Amlodipine", "5 mg", "Once daily (OD)"]], "Prefers morning appointments."],
  ["", "single", "B-4, Baner Road", "9822011102", ["Suresh Nair", "Father", "9822011192"], null, [], ["Appendectomy (2015)"], ["Thyroid disorder"], [], ""],
  ["Anil", "married", "7th Floor, Lotus Heights, Andheri", "9820011193", ["Sunita Mehta", "Spouse", "9820011194"], null, ["Dengue (2019)", "Jaundice (2008)"], ["Cataract surgery (2023)"], ["Diabetes", "Heart disease"], [["Metformin", "500 mg", "Twice daily (BD)"], ["Telmisartan", "40 mg", "Once daily (OD)"]], "Diabetic diet counselling done."],
  ["", "married", "Kothrud, Near Karve Statue", "9822011104", ["Pranav Kulkarni", "Spouse", "9822011195"], null, ["Pneumonia (2017)"], [], ["Asthma"], [["Salbutamol", "2 puffs", "As needed (SOS)"], ["Montelukast", "10 mg", "At bedtime (HS)"]], "Carries rescue inhaler."],
  ["Prakash", "married", "Gangapur Road", "9822011105", ["Leela Singh", "Spouse", "9822011196"], null, ["Heart attack (2020)"], ["Angioplasty / stent (2020)"], ["Heart disease", "Stroke"], [["Aspirin", "75 mg", "Once daily (OD)"], ["Atorvastatin", "20 mg", "At bedtime (HS)"]], "Cardiology follow-up every 3 months."],
  ["", "single", "Sadashiv Peth", "9822011106", ["Meena Desai", "Mother", "9822011197"], ["Meena Desai", "Mother", "9822011197"], ["Chickenpox (2021)"], [], [], [], "Vaccination up to date."],
  ["", "single", "HSR Layout, Sector 2", "9822011107", ["Lakshmi Rao", "Mother", "9822011198"], null, [], [], ["Hypertension"], [], ""],
  ["Begum", "married", "Camp Area", "9822011108", ["Salim Sheikh", "Spouse", "9822011199"], null, [], ["Thyroidectomy (2018)"], ["Thyroid disorder"], [["Levothyroxine", "50 mcg", "Once daily (OD)"]], "Latex allergy — use non-latex gloves."],
  ["Kumar", "married", "Aundh", "9822011109", ["Rekha Gupta", "Spouse", "9822011200"], null, ["Kidney stones (2016)"], [], ["Diabetes"], [["Metformin", "500 mg", "Twice daily (BD)"], ["Glimepiride", "1 mg", "Once daily (OD)"]], "HbA1c review due."],
  ["", "single", "Karad Road", "9822011110", ["Anil Joshi", "Father", "9822011201"], null, [], [], [], [], ""],
  ["Dattatray", "widowed", "Sinhagad Road", "9822011111", ["Mahesh Pawar", "Son", "9822011202"], null, ["Fracture — left wrist (2014)"], ["Knee replacement (2021)"], ["Hypertension", "Arthritis"], [["Paracetamol", "650 mg", "As needed (SOS)"], ["Calcium", "500 mg", "Once daily (OD)"]], "Needs wheelchair assistance."],
  ["", "single", "Viman Nagar", "9822011112", ["Rakesh Verma", "Father", "9822011203"], null, [], [], ["Diabetes"], [], ""],
  ["", "single", "Banjara Hills", "9822011113", ["Sridhar Reddy", "Father", "9822011204"], ["Sridhar Reddy", "Father", "9822011204"], [], [], [], [], "Under paediatric growth monitoring."],
  ["", "married", "Hadapsar", "9822011114", ["Nilesh Bhosale", "Spouse", "9822011205"], null, ["Typhoid (2010)"], ["Caesarean section (2012)"], ["Migraine"], [["Paracetamol", "500 mg", "As needed (SOS)"]], ""],
  ["", "married", "Kondhwa", "9822011115", ["Zainab Khan", "Spouse", "9822011206"], null, [], [], [], [], ""],
];
const BLOOD = ["A+", "B+", "O+", "AB+", "O-", "A-", "B-", "O+", "A+", "B+", "O+", "AB-", "A+", "O+", "B+"];

const DOCTOR_PROFILE = [
  { middle: "Vasant", dob: "1982-02-19", street: "Plot 14, Law College Road", qual: [["MBBS", "B.J. Medical College, Pune", 2005], ["MD (Medicine)", "Grant Medical College, Mumbai", 2009]], leave: [4, 5], followUpDays: 7 },
  { middle: "Suresh", dob: "1985-08-03", street: "Karve Road, Erandwane", qual: [["MBBS", "Seth GS Medical College, Mumbai", 2008], ["MS (OBG)", "KEM Hospital, Mumbai", 2012]], leave: [10], followUpDays: 14 },
  { middle: "", dob: "1988-11-27", street: "Baner Gaon", qual: [["MBBS", "Government Medical College, Nagpur", 2011], ["DCH", "BJ Medical College, Pune", 2014]], leave: [], followUpDays: 10 },
  { middle: "Lakshmi", dob: "1987-05-09", street: "Koregaon Park Lane 5", qual: [["MBBS", "Madras Medical College", 2010], ["MD (Dermatology)", "JIPMER Puducherry", 2014]], leave: [6, 7], followUpDays: 15 },
];

const STAFF_PROFILE = [
  { gender: "female", dob: "1994-04-12", blood: "B+", marital: "single", street: "Warje Malwadi", alt: "9822333301", em: ["Sunil Shinde", "Father", "9822333311"], exp: 5, quals: [["B.Com", "Savitribai Phule Pune University", 2015]], license: ["", "", null], skills: ["Front-desk handling", "MS Office", "HMS software"], langs: ["English", "Hindi", "Marathi"], idType: "aadhaar", idNo: "123456789012", bank: ["Pooja Shinde", "123456789012345", "HDFC0001234", "HDFC Bank", "pooja.shinde@okhdfc"], shift: "morning", note: "Handles walk-in registrations." },
  { gender: "female", dob: "1991-09-30", blood: "O+", marital: "married", street: "Pimple Saudagar", alt: "9822333302", em: ["Arun Menon", "Spouse", "9822333312"], exp: 9, quals: [["GNM", "Sassoon Nursing School", 2012], ["B.Sc Nursing", "Maharashtra University of Health Sciences", 2016]], license: ["MNC-48213", "Maharashtra Nursing Council", 18], skills: ["Patient care", "IV cannulation", "Wound dressing", "Vitals monitoring", "First aid / BLS"], langs: ["English", "Malayalam", "Hindi"], idType: "pan", idNo: "ABCPM1234K", bank: ["Ritu Menon", "987654321098", "SBIN0004321", "State Bank of India", "ritu.menon@oksbi"], shift: "general", note: "BLS certified." },
  { gender: "male", dob: "1990-01-15", blood: "A+", marital: "married", street: "Hadapsar Industrial Estate", alt: "9822333303", em: ["Sneha Jadhav", "Spouse", "9822333313"], exp: 7, quals: [["DMLT", "Government Polytechnic Pune", 2013]], license: ["MLT-20931", "Maharashtra Paramedical Council", 20], skills: ["Sample collection", "Phlebotomy", "Sterilization"], langs: ["English", "Hindi", "Marathi"], idType: "driving_license", idNo: "MH12 20150012345", bank: ["Amit Jadhav", "456789012345", "ICIC0000456", "ICICI Bank", ""], shift: "evening", note: "Runs the evening collection round." },
];

const VITAL_SERIES = [
  { type: "bp", unit: "mmHg", make: (i) => [118 + (i % 3) * 6, 76 + (i % 4) * 3], note: "Morning, seated" },
  { type: "sugar", unit: "mg/dL", make: (i) => [96 + (i % 5) * 9], note: "Fasting" },
  { type: "weight", unit: "kg", make: (i) => [72 - i * 0.2], note: "" },
  { type: "pulse", unit: "bpm", make: (i) => [70 + (i % 6) * 2], note: "At rest" },
  { type: "spo2", unit: "%", make: (i) => [97 + (i % 3)], note: "" },
  { type: "temp", unit: "°C", make: (i) => [36.6 + (i % 4) * 0.2], note: "Oral" },
];

// 1x1 PNG (valid image bytes) — enough for the file-record list/download paths.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const pdfBytes = (title) =>
  Buffer.from(`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n% ${title}\n%%EOF`);

// ---------------------------------------------------------------- helpers
async function ctx() {
  const owner = await User.findOne({ email });
  if (!owner) throw new Error(`No user with email ${email}`);
  if (!owner.tenantId) throw new Error("This account has no organisation yet");
  const tenant = await Tenant.findById(owner.tenantId);
  const byId = (a, b) => String(a.patientId || a.doctorId || a.staffId).localeCompare(String(b.patientId || b.doctorId || b.staffId));
  const patients = (await Patient.find({ tenantId: tenant._id, patientId: /^SMP-/ })).sort(byId);
  const doctors = (await Doctor.find({ tenantId: tenant._id, doctorId: /^SMP-/ })).sort(byId);
  const staff = (await StaffProfile.find({ tenantId: tenant._id, staffId: /^SMP-/ })).sort(byId);
  return { owner, tenant, patients, doctors, staff };
}

async function counts(tenantId, patients) {
  const pids = patients.map((p) => p._id);
  return {
    vitals: await Vital.countDocuments({ tenantId, note: /^\[SMP\]/ }),
    medicineReminders: await MedicineReminder.countDocuments({ tenantId, patientId: { $in: pids } }),
    medicalRecords: await MedicalRecord.countDocuments({ tenantId, title: /^\[SMP\]/ }),
    abhaLinks: await AbhaLink.countDocuments({ tenantId, patientId: { $in: pids } }),
    consentLogs: await ConsentLog.countDocuments({ tenantId, ip: "seed-sample" }),
    auditLogs: await AuditLog.countDocuments({ tenantId, path: /^\/seed-sample\// }),
    extraAppointments: await Appointment.countDocuments({ tenantId, notes: /^\[SMPX\]/ }),
    extraInvoices: await Invoice.countDocuments({ tenantId, number: /^SMP-INVX-/ }),
    extraLabOrders: await LabOrder.countDocuments({ tenantId, number: /^SMP-LABX-/ }),
    draftConsultations: await Consultation.countDocuments({ tenantId, patientId: { $in: pids }, status: "draft" }),
  };
}

async function remove(tenantId, patients) {
  const pids = patients.map((p) => p._id);
  const extraAppts = (await Appointment.find({ tenantId, notes: /^\[SMPX\]/ }).select("_id")).map((a) => a._id);
  return {
    vitals: (await Vital.deleteMany({ tenantId, note: /^\[SMP\]/ })).deletedCount,
    medicineReminders: (await MedicineReminder.deleteMany({ tenantId, patientId: { $in: pids } })).deletedCount,
    medicalRecords: (await MedicalRecord.deleteMany({ tenantId, title: /^\[SMP\]/ })).deletedCount,
    abhaLinks: (await AbhaLink.deleteMany({ tenantId, patientId: { $in: pids } })).deletedCount,
    consentLogs: (await ConsentLog.deleteMany({ tenantId, ip: "seed-sample" })).deletedCount,
    auditLogs: (await AuditLog.deleteMany({ tenantId, path: /^\/seed-sample\// })).deletedCount,
    draftConsultations: (await Consultation.deleteMany({ tenantId, patientId: { $in: pids }, status: "draft" })).deletedCount,
    extraInvoices: (await Invoice.deleteMany({ tenantId, number: /^SMP-INVX-/ })).deletedCount,
    extraLabOrders: (await LabOrder.deleteMany({ tenantId, number: /^SMP-LABX-/ })).deletedCount,
    extraConsultations: (await Consultation.deleteMany({ tenantId, appointmentId: { $in: extraAppts } })).deletedCount,
    extraAppointments: (await Appointment.deleteMany({ tenantId, _id: { $in: extraAppts } })).deletedCount,
  };
}

// ---------------------------------------------------------------- enrichment (fills every field)
async function enrich({ owner, tenant, patients, doctors, staff }) {
  const tenantId = tenant._id;
  const out = {};
  const n = (k) => (out[k] = (out[k] || 0) + 1);

  // Tenant: fill blanks only.
  const set = {};
  const blank = (v) => v === undefined || v === null || v === "";
  if (blank(tenant.contact?.address)) set["contact.address"] = "FC Road, Shivajinagar";
  if (blank(tenant.contact?.pincode)) set["contact.pincode"] = "411005";
  if (blank(tenant.contact?.city)) set["contact.city"] = "Pune";
  if (blank(tenant.contact?.state)) set["contact.state"] = "Maharashtra";
  if (blank(tenant.gstDetails?.legalName)) set["gstDetails.legalName"] = tenant.name;
  if (blank(tenant.gstDetails?.gstin)) set["gstDetails.gstin"] = "27AAECL1234F1Z5";
  if (blank(tenant.branding?.appName)) set["branding.appName"] = tenant.name;
  if (Object.keys(set).length) {
    await Tenant.updateOne({ _id: tenantId }, { $set: set });
    out.tenantFieldsFilled = Object.keys(set).length;
  }

  // Clinics: every field + one inactive branch.
  const clinics = await Clinic.find({ tenantId, code: /^SMP/ }).sort({ code: 1 });
  for (const [i, c] of clinics.entries()) {
    c.phone = c.phone || "02025501234";
    c.address = { street: i ? "Paud Road, Kothrud" : "FC Road, Shivajinagar", city: "Pune", state: "Maharashtra", pincode: i ? "411038" : "411005" };
    c.status = "active";
    await c.save();
    n("clinics");
  }
  const third = await Clinic.findOne({ tenantId, code: "SMPOLD" });
  if (!third) {
    await Clinic.create({ tenantId, name: "Old City Dispensary (closed)", code: "SMPOLD", phone: "02024441122", status: "inactive", address: { street: "Budhwar Peth", city: "Pune", state: "Maharashtra", pincode: "411002" } });
    n("clinics");
  }

  // Patients.
  for (const [i, p] of patients.entries()) {
    const x = PATIENT_PROFILE[i];
    if (!x) continue;
    const isMinor = (Date.now() - p.dateOfBirth.getTime()) / (365.25 * DAY) < 18;
    p.middleName = x[0];
    p.maritalStatus = isMinor ? "single" : x[1];
    p.bloodGroup = BLOOD[i];
    p.contact = { phone: p.contact.phone, alternatePhone: x[3], email: p.contact.email };
    p.address = { street: x[2], city: p.address.city, state: p.address.state, pincode: p.address.pincode || "411001", country: "India" };
    p.emergencyContact = { name: x[4][0], relationship: x[4][1], phone: x[4][2] };
    p.guardian = x[5] ? { name: x[5][0], relationship: x[5][1], phone: x[5][2] } : { name: "", relationship: "", phone: "" };
    p.medicalSummary = {
      allergies: p.medicalSummary?.allergies || [],
      chronicConditions: p.medicalSummary?.chronicConditions || [],
      pastMedicalHistory: x[6],
      pastSurgicalHistory: x[7],
      familyMedicalHistory: x[8],
      currentMedications: x[9].map(([name, dosage, frequency]) => ({ name, dosage, frequency })),
      notes: x[10],
    };
    p.patientStatus = i === 6 ? "inactive" : "active"; // one inactive row for list/filters
    p.registeredBy = p.registeredBy || owner._id;
    await p.save();
    n("patients");
  }

  // Doctors.
  for (const [i, d] of doctors.entries()) {
    const x = DOCTOR_PROFILE[i];
    if (!x) continue;
    d.middleName = x.middle;
    d.dateOfBirth = new Date(x.dob);
    d.address = { street: x.street, city: "Pune", state: "Maharashtra", pincode: "411004", country: "India" };
    d.professionalDetails.qualifications = x.qual.map(([degree, institution, year]) => ({ degree, institution, year }));
    d.professionalDetails.languages = ["English", "Hindi", "Marathi"];
    d.consultation.currency = "INR";
    d.followUpDays = x.followUpDays;
    d.leaveDates = x.leave.map((o) => ymd(new Date(Date.now() + o * DAY)));
    d.verificationStatus = "verified";
    d.verifiedAt = d.verifiedAt || new Date();
    d.verifiedBy = d.verifiedBy || owner._id;
    d.accountStatus = "active";
    await d.save();
    n("doctors");
  }

  // Staff profiles.
  for (const [i, s] of staff.entries()) {
    const x = STAFF_PROFILE[i];
    if (!x) continue;
    s.middleName = "";
    s.gender = x.gender;
    s.dateOfBirth = new Date(x.dob);
    s.bloodGroup = x.blood;
    s.maritalStatus = x.marital;
    s.contact = { phone: s.contact.phone, alternatePhone: x.alt, email: s.contact.email || `${s.firstName}.${s.lastName}@example.com`.toLowerCase() };
    s.address = { street: x.street, city: "Pune", state: "Maharashtra", pincode: "411057", country: "India" };
    s.emergencyContact = { name: x.em[0], relationship: x.em[1], phone: x.em[2] };
    s.employment = {
      ...(s.employment?.toObject ? s.employment.toObject() : s.employment),
      employmentType: "full_time",
      shift: x.shift,
      workDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
      workStart: x.shift === "evening" ? "13:00" : "09:00",
      workEnd: x.shift === "evening" ? "21:00" : "18:00",
      reportingTo: owner._id,
      experienceYears: x.exp,
    };
    s.professional = {
      qualifications: x.quals.map(([degree, institution, year]) => ({ degree, institution, year })),
      licenseNumber: x.license[0],
      licenseAuthority: x.license[1],
      licenseExpiry: x.license[2] ? new Date(Date.now() + x.license[2] * 30 * DAY) : null,
      skills: x.skills,
      languages: x.langs,
    };
    s.identity = { idType: x.idType, idNumber: x.idNo };
    s.bank = { accountHolder: x.bank[0], accountNumber: x.bank[1], ifsc: x.bank[2], bankName: x.bank[3], upiId: x.bank[4] };
    s.notes = x.note;
    await s.save();
    n("staffProfiles");
  }
  return out;
}

// ---------------------------------------------------------------- extras (other models + edge-case rows)
async function extras({ owner, tenant, patients, doctors, staff }) {
  const tenantId = tenant._id;
  const out = {};
  const bump = (k, c = 1) => (out[k] = (out[k] || 0) + c);
  const pids = patients.map((p) => p._id);
  const clinics = await Clinic.find({ tenantId, code: /^SMP/, status: "active" });

  // ---- appointment fields the base seed leaves empty: notes, waived payments, walk-ins with token numbers
  const appts = await Appointment.find({ tenantId, patientId: { $in: pids }, notes: { $in: ["", null] } }).sort({ scheduledAt: 1 });
  for (const [i, a] of appts.entries()) {
    const sets = { notes: a.status === "cancelled" ? "Cancelled — slot released." : a.status === "no_show" ? "Patient did not arrive; called twice." : a.status === "completed" ? "Seen as per schedule." : "Booked via front desk." };
    if (!a.clinicId && clinics.length) sets.clinicId = clinics[i % clinics.length]._id;
    if (a.status === "completed" && i % 9 === 0) sets.paymentStatus = "waived";
    if (!a.endsAt) sets.endsAt = new Date(a.scheduledAt.getTime() + 15 * MIN);
    await Appointment.updateOne({ _id: a._id }, { $set: sets });
  }
  bump("appointmentsFilled", appts.length);

  if (!(await Appointment.countDocuments({ tenantId, notes: /^\[SMPX\]/ }))) {
    let token = 0;
    for (const [i, hm] of [[10, 5], [10, 40], [11, 10], [11, 50], [12, 20]].entries()) {
      const doc = doctors[i % doctors.length];
      const pat = patients[(i * 3) % patients.length];
      const when = at(0, hm[0], hm[1]);
      try {
        await Appointment.create({
          tenantId, patientId: pat._id, doctorId: doc._id, clinicId: clinics[0]?._id,
          scheduledAt: when, endsAt: new Date(when.getTime() + 15 * MIN), type: "walk_in", tokenNo: ++token,
          status: i < 2 ? "completed" : "scheduled", reason: cycle(["Fever", "Follow-up visit", "Dressing change", "BP check", "Vaccination"], i),
          fee: doc.consultation.consultationFee, paymentStatus: i < 2 ? "paid" : "unpaid", source: "reception",
          checkedInAt: new Date(when.getTime() - 3 * MIN), ...(i < 2 ? { completedAt: new Date(when.getTime() + 12 * MIN) } : {}),
          notes: `[SMPX] Walk-in token ${token}`,
        });
        bump("extraAppointments");
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    }
  }

  // ---- consultations: heightCm / notes on signed ones, drafts for upcoming visits
  const signed = await Consultation.find({ tenantId, patientId: { $in: pids }, status: "signed" });
  for (const [i, c] of signed.entries()) {
    const sets = {};
    if (c.vitals?.heightCm == null) sets["vitals.heightCm"] = 150 + (i * 7) % 35;
    if (!c.notes || c.notes === "Examined; advised as below.") sets.notes = "Examined; vitals stable. Counselled on diet, medication adherence and warning signs. Review if symptoms persist.";
    if (Object.keys(sets).length) await Consultation.updateOne({ _id: c._id }, { $set: sets });
  }
  bump("consultationsFilled", signed.length);

  const upcoming = await Appointment.find({ tenantId, patientId: { $in: pids }, status: "scheduled", scheduledAt: { $gte: new Date() } }).sort({ scheduledAt: 1 }).limit(4);
  for (const a of upcoming) {
    if (await Consultation.exists({ tenantId, appointmentId: a._id })) continue;
    await Consultation.create({
      tenantId, appointmentId: a._id, patientId: a.patientId, doctorId: a.doctorId,
      vitals: { bp: "124/82", pulse: 76, tempC: 36.8, spo2: 98, weightKg: 68, heightCm: 168 },
      complaints: "Review visit — intake notes taken at the front desk.", diagnosis: ["Under evaluation"],
      notes: "Draft started by nurse; awaiting doctor's examination.",
      prescription: { items: [{ drug: "Paracetamol", dose: "500 mg", frequency: "1-0-1", days: 3, instructions: "If fever" }], advice: "Hydration and rest." },
      followUpOn: new Date(a.scheduledAt.getTime() + 7 * DAY), status: "draft",
    });
    bump("draftConsultations");
  }

  // ---- invoices: GST lines, discount, void, partial with mixed payment modes, unpaid
  if (!(await Invoice.countDocuments({ tenantId, number: /^SMP-INVX-/ }))) {
    const doc = doctors[0];
    const defs = [
      { n: 1, patient: 0, items: [{ description: "Paracetamol 650 mg x 10", qty: 2, rate: 32, gstRate: 12 }, { description: "ORS sachets", qty: 5, rate: 22, gstRate: 5 }, { description: "Digital thermometer", qty: 1, rate: 240, gstRate: 18 }], discount: 30, pay: [{ mode: "upi", ref: "UPI-403918227761" }], note: "Pharmacy counter sale." },
      { n: 2, patient: 2, items: [{ description: `Consultation - Dr. ${doc.firstName} ${doc.lastName}`, qty: 1, rate: 600, gstRate: 0 }, { description: "ECG", qty: 1, rate: 350, gstRate: 0 }, { description: "Nebulisation", qty: 1, rate: 150, gstRate: 0 }], discount: 100, pay: [{ mode: "insurance", ref: "TPA-CLM-88213", part: 0.6 }, { mode: "cash", ref: "", part: 0.2 }], note: "Part settled by insurance; patient balance pending." },
      { n: 3, patient: 4, items: [{ description: "Dressing — minor wound", qty: 1, rate: 300, gstRate: 0 }], discount: 0, void: "Billed to the wrong patient — re-issued.", note: "" },
      { n: 4, patient: 7, items: [{ description: "Thyroid profile (collection charge)", qty: 1, rate: 120, gstRate: 0 }, { description: "Vitamin D3 60k x 4", qty: 1, rate: 180, gstRate: 12 }], discount: 0, pay: [], note: "Payment promised on next visit." },
      { n: 5, patient: 9, items: [{ description: "Vaccination — Typhoid", qty: 1, rate: 850, gstRate: 5 }], discount: 50, pay: [{ mode: "card", ref: "CARD-XXXX-4412" }], note: "Corporate camp." },
      { n: 6, patient: 11, items: [{ description: "Health check-up package", qty: 1, rate: 2499, gstRate: 0 }], discount: 250, pay: [{ mode: "bank", ref: "NEFT-SBIN0004321-77120" }], note: "Paid by bank transfer." },
    ];
    for (const d of defs) {
      const t = computeTotals(d.items, d.discount);
      const pat = patients[d.patient];
      const when = at(-d.n, 11, 30);
      let payments = [];
      let paid = 0;
      if (!d.void) {
        if (d.pay.length === 1) {
          paid = t.total;
          payments = [{ amount: paid, mode: d.pay[0].mode, reference: d.pay[0].ref, receivedBy: owner._id, receivedAt: when }];
        } else if (d.pay.length > 1) {
          payments = d.pay.map((p) => ({ amount: Math.round(t.total * p.part * 100) / 100, mode: p.mode, reference: p.ref, receivedBy: owner._id, receivedAt: when }));
          paid = payments.reduce((s, p) => s + p.amount, 0);
        }
      }
      await Invoice.create({
        tenantId, number: `SMP-INVX-${String(d.n).padStart(3, "0")}`, patientId: pat._id,
        items: t.lines, subtotal: t.subtotal, gst: t.gst, discount: t.discount, total: t.total,
        paid, payments, status: d.void ? "void" : statusFor(t.total, paid), notes: d.note,
        ...(d.void ? { voidReason: d.void } : {}), createdBy: owner._id,
      });
      bump("extraInvoices");
    }
  }
  // enrich base invoices: notes + payment references
  const inv = await Invoice.find({ tenantId, number: /^SMP-INV-/ });
  for (const [i, v] of inv.entries()) {
    const sets = {};
    if (!v.notes) sets.notes = cycle(["Consultation charges.", "Follow-up visit.", "Paid at reception.", "Includes procedure charges."], i);
    if (v.payments?.length && v.payments.some((p) => !p.reference && p.mode !== "cash")) {
      sets.payments = v.payments.map((p) => ({ ...p.toObject(), reference: p.reference || (p.mode === "cash" ? "" : `${p.mode.toUpperCase()}-${700000 + i * 137}`) }));
    }
    if (Object.keys(sets).length) await Invoice.updateOne({ _id: v._id }, { $set: sets });
  }

  // ---- lab orders: link to consultations, add cancelled / ordered-with-notes rows
  const labs = await LabOrder.find({ tenantId, number: /^SMP-LAB-/, consultationId: { $in: [null, undefined] } });
  for (const l of labs) {
    const c = await Consultation.findOne({ tenantId, patientId: l.patientId, doctorId: l.doctorId }).sort({ createdAt: 1 });
    if (c) await LabOrder.updateOne({ _id: l._id }, { $set: { consultationId: c._id } });
  }
  if (!(await LabOrder.countDocuments({ tenantId, number: /^SMP-LABX-/ }))) {
    const defs = [
      { n: 1, status: "cancelled", panel: "Lipid Profile", note: "Cancelled — patient not fasting.", tests: [["Total Cholesterol", "mg/dL", 0, 200], ["LDL", "mg/dL", 0, 100], ["HDL", "mg/dL", 40, 100]] },
      { n: 2, status: "ordered", panel: "Liver Function Test", note: "Fasting sample preferred.", tests: [["SGOT (AST)", "U/L", 5, 40], ["SGPT (ALT)", "U/L", 5, 41], ["Bilirubin (Total)", "mg/dL", 0.1, 1.2]] },
      { n: 3, status: "resulted", panel: "Kidney Function Test", note: "Creatinine mildly raised — advised hydration and repeat.", tests: [["Creatinine", "mg/dL", 0.6, 1.2, "1.5", "high"], ["Urea", "mg/dL", 15, 40, "32", "normal"], ["Uric Acid", "mg/dL", 3.5, 7.2, "3.1", "low"]] },
    ];
    for (const d of defs) {
      const doc = doctors[d.n % doctors.length];
      const pat = patients[(d.n * 4) % patients.length];
      const when = at(-d.n * 2, 10, 15);
      const c = await Consultation.findOne({ tenantId, patientId: pat._id }).sort({ createdAt: -1 });
      await LabOrder.create({
        tenantId, number: `SMP-LABX-${String(d.n).padStart(3, "0")}`, patientId: pat._id, doctorId: doc._id,
        ...(c ? { consultationId: c._id } : {}),
        tests: d.tests.map(([name, unit, lo, hi, result = "", flag = ""]) => ({ name, unit, refLow: lo, refHigh: hi, result, flag })),
        status: d.status, notes: `${d.panel}: ${d.note}`,
        ...(d.status === "resulted" ? { collectedAt: new Date(when.getTime() + 20 * MIN), resultedAt: new Date(when.getTime() + 5 * 60 * MIN) } : {}),
        createdBy: owner._id,
      });
      bump("extraLabOrders");
    }
  }

  // ---- patient-logged vitals, reminders, uploaded records
  if (!(await Vital.countDocuments({ tenantId, note: /^\[SMP\]/ }))) {
    const rows = [];
    for (const [pi, pat] of patients.slice(0, 6).entries()) {
      for (const [si, s] of VITAL_SERIES.entries()) {
        for (let k = 0; k < 4; k++) {
          const [value, value2] = s.make(pi + k);
          rows.push({
            tenantId, patientId: pat._id, type: s.type, value: Math.round(value * 10) / 10,
            ...(value2 !== undefined ? { value2 } : {}), unit: s.unit,
            note: `[SMP] ${s.note || "Self-reported"}`.trim(), measuredAt: new Date(Date.now() - (k * 3 + si) * DAY),
          });
        }
      }
    }
    await Vital.insertMany(rows);
    bump("vitals", rows.length);
  }

  if (!(await MedicineReminder.countDocuments({ tenantId, patientId: { $in: pids } }))) {
    const rows = [];
    for (const [i, pat] of patients.entries()) {
      for (const [name, dose, freq] of PATIENT_PROFILE[i]?.[9] || []) {
        const times = freq.includes("Twice") ? ["08:00", "20:00"] : freq.includes("bedtime") ? ["22:00"] : freq.includes("Thrice") ? ["08:00", "14:00", "21:00"] : ["09:00"];
        rows.push({
          tenantId, patientId: pat._id, drug: name, dose, times,
          startDate: new Date(Date.now() - 30 * DAY), endDate: new Date(Date.now() + (i % 3 === 0 ? -2 : 60) * DAY), active: i % 3 !== 0,
        });
      }
    }
    if (rows.length) await MedicineReminder.insertMany(rows);
    bump("medicineReminders", rows.length);
  }

  if (!(await MedicalRecord.countDocuments({ tenantId, title: /^\[SMP\]/ }))) {
    const defs = [
      ["Prescription — viral fever", "prescription", "application/pdf"],
      ["CBC report", "lab_report", "application/pdf"],
      ["Pharmacy bill", "bill", "image/png"],
      ["Chest X-ray", "scan", "image/png"],
      ["Discharge summary", "discharge", "application/pdf"],
      ["Insurance card (scan)", "other", "image/png"],
    ];
    for (const [i, [title, type, mime]] of defs.entries()) {
      const data = mime === "application/pdf" ? pdfBytes(title) : PNG_1PX;
      await MedicalRecord.create({
        tenantId, patientId: patients[i % patients.length]._id, uploadedBy: owner._id, title: `[SMP] ${title}`, type,
        recordDate: new Date(Date.now() - (i + 1) * 9 * DAY), mimeType: mime, size: data.length, data,
      });
      bump("medicalRecords");
    }
  }

  // ---- compliance: ABHA links, consent history, audit trail
  for (const [i, pat] of patients.slice(0, 8).entries()) {
    if (await AbhaLink.exists({ tenantId, patientId: pat._id })) continue;
    const num = `91-${String(1000 + i * 37).padStart(4, "0")}-${String(5000 + i * 91).padStart(4, "0")}-${String(2000 + i * 13).padStart(4, "0")}`;
    await AbhaLink.create({
      tenantId, patientId: pat._id, abhaNumber: num, abhaAddress: `${pat.firstName.toLowerCase()}.${pat.lastName.toLowerCase()}@abdm`,
      status: i % 3 === 2 ? "unverified" : "verified", linkedBy: owner._id,
    });
    bump("abhaLinks");
  }

  if (!(await ConsentLog.countDocuments({ tenantId, ip: "seed-sample" }))) {
    const users = [owner._id, ...staff.map((s) => s.userId)];
    const purposes = ["whatsapp", "data_sharing", "ai_scribe", "marketing", "deletion_request"];
    let k = 0;
    for (const uid of users) {
      for (const [pi, purpose] of purposes.entries()) {
        if (purpose === "deletion_request" && k % 2) continue;
        await ConsentLog.create({ tenantId, userId: uid, purpose, granted: purpose !== "marketing" && purpose !== "deletion_request", ip: "seed-sample", at: new Date(Date.now() - (k * 5 + pi) * DAY) });
        bump("consentLogs");
      }
      k++;
    }
  }

  if (!(await AuditLog.countDocuments({ tenantId, path: /^\/seed-sample\// }))) {
    const resources = ["patients", "appointments", "consultations", "invoices", "lab-orders", "doctors", "staff"];
    const verbs = [["view", "GET", 200], ["create", "POST", 201], ["update", "PUT", 200], ["delete", "DELETE", 200], ["action", "POST", 200]];
    const people = [{ id: owner._id, role: "tenant_owner" }, ...staff.map((s, i) => ({ id: s.userId, role: ["receptionist", "nurse", "lab_technician"][i] }))];
    const rows = [];
    for (let i = 0; i < 40; i++) {
      const [action, method, status] = verbs[i % verbs.length];
      const who = people[i % people.length];
      const res = resources[i % resources.length];
      rows.push({
        tenantId, userId: who.id, role: who.role, method, action, resource: res,
        resourceId: patients[i % patients.length]._id.toString(), path: `/seed-sample/${res}/${patients[i % patients.length]._id}`,
        status, ip: `10.0.0.${10 + (i % 20)}`, at: new Date(Date.now() - i * 3 * 60 * MIN),
      });
    }
    await AuditLog.insertMany(rows);
    bump("auditLogs", rows.length);
  }
  return out;
}

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in backend/.env");
  await mongoose.connect(process.env.MONGO_URI);
  const c = await ctx();
  console.log(`Owner : ${c.owner.name} <${c.owner.email}>   Tenant: ${c.tenant.name}`);
  if (!c.patients.length) throw new Error("No SMP sample rows found — run `node scripts/seed-sample.js <email>` first");

  if (MODE === "check") {
    console.log("Extras present:", await counts(c.tenant._id, c.patients));
  } else if (MODE === "remove") {
    console.log("Removed extras:", await remove(c.tenant._id, c.patients));
    console.log("(enriched fields stay on SMP rows; `seed-sample.js --remove` deletes those rows)");
  } else {
    console.log("Enriched:", await enrich(c));
    console.log("Extras  :", await extras(c));
    console.log("Totals  :", await counts(c.tenant._id, c.patients));
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("FAILED:", e.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
