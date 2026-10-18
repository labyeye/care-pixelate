// Flat data for the printed consultation / prescription, shared by the Consultation Designer preview and the real print.
import type { Consultation, Doctor, Patient, RxItem, Tenant } from "@/types";
import { companyFromTenant, type SheetCompany } from "./invoiceSheetData";

export interface ConsultSheetData {
  title: string;
  date: Date;
  followUp?: Date;
  patient: {
    name: string;
    idLine: string;
    phone?: string;
    address?: string;
    allergies: string[];
  };
  doctor: { name: string; spec?: string; reg?: string };
  vitals: {
    bp?: string;
    pulse?: number;
    tempC?: number;
    spo2?: number;
    weightKg?: number;
    heightCm?: number;
  };
  complaints: string;
  diagnosis: string[];
  notes: string;
  items: RxItem[];
  advice: string;
  company: SheetCompany;
}

const obj = <T>(v: unknown): T | undefined =>
  v && typeof v === "object" ? (v as T) : undefined;
const ageOf = (dob?: string) => {
  if (!dob) return "";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000);
  return y >= 0 && y < 150 ? `${y} yrs` : "";
};
const dr = (n?: string) => (n ? `Dr. ${n.replace(/^Dr\.?\s+/i, "")}` : "—");

export function sheetFromConsultation(
  c: Consultation,
  tenant: Tenant | null,
): ConsultSheetData {
  const p = obj<Patient>(c.patientId);
  const d = obj<Doctor>(c.doctorId);
  const company = companyFromTenant(tenant);
  return {
    title: "PRESCRIPTION",
    date: new Date(c.signedAt || c.createdAt || Date.now()),
    followUp: c.followUpOn ? new Date(c.followUpOn) : undefined,
    patient: {
      name: p?.name || "—",
      idLine: [
        p?.patientId && `Patient ID: ${p.patientId}`,
        ageOf(p?.dateOfBirth),
        p?.gender,
      ]
        .filter(Boolean)
        .join("  |  "),
      phone: p?.contact?.phone,
      address: [
        p?.address?.street,
        p?.address?.city,
        p?.address?.state,
        p?.address?.pincode,
      ]
        .filter(Boolean)
        .join(", "),
      allergies: p?.medicalSummary?.allergies ?? [],
    },
    doctor: {
      name: dr(d?.name),
      spec: (d?.professionalDetails?.specializations ?? []).join(", "),
      reg: d?.professionalDetails?.registrationNumber,
    },
    vitals: c.vitals ?? {},
    complaints: c.complaints ?? "",
    diagnosis: c.diagnosis ?? [],
    notes: c.notes ?? "",
    items: c.prescription?.items ?? [],
    advice: c.prescription?.advice ?? "",
    company,
  };
}

/** Designer preview data. Uses the clinic's own details where they are set. */
export function sampleConsultation(tenant: Tenant | null): ConsultSheetData {
  const company = companyFromTenant(tenant);
  if (!company.addressLines.length)
    company.addressLines = [
      "12, Health Street, Andheri East",
      "Mumbai, Maharashtra, 400069",
    ];
  if (!company.phone) company.phone = "9820000000";
  return {
    title: "PRESCRIPTION",
    date: new Date(),
    followUp: new Date(Date.now() + 7 * 86_400_000),
    patient: {
      name: "Asha Verma",
      idLine: "Patient ID: NC-00042  |  34 yrs  |  female",
      phone: "9876543210",
      address: "221B Baker Street, Andheri East, Mumbai",
      allergies: ["Penicillin"],
    },
    doctor: {
      name: "Dr. Rajesh Kulkarni",
      spec: "General Medicine",
      reg: "MMC-12345",
    },
    vitals: {
      bp: "120/80",
      pulse: 78,
      tempC: 37.2,
      spo2: 98,
      weightKg: 62,
      heightCm: 163,
    },
    complaints: "Fever and body ache for 2 days, mild sore throat.",
    diagnosis: ["Viral fever", "Acute pharyngitis"],
    notes: "Advised rest; review if fever persists beyond 3 days.",
    items: [
      {
        drug: "Paracetamol 650 mg",
        dose: "1 tablet",
        frequency: "1-1-1",
        days: 5,
        instructions: "After food",
      },
      {
        drug: "Cetirizine 10 mg",
        dose: "1 tablet",
        frequency: "0-0-1",
        days: 5,
        instructions: "At bedtime",
      },
      {
        drug: "Pantoprazole 40 mg",
        dose: "1 tablet",
        frequency: "1-0-0",
        days: 5,
        instructions: "Before breakfast",
      },
    ],
    advice:
      "Drink plenty of fluids. Avoid cold drinks. Steam inhalation twice a day.",
    company,
  };
}
