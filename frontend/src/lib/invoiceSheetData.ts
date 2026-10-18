// Everything an invoice sheet needs, in one flat shape, so the printable invoice and the Invoice Designer
// preview render from the same data. `sheetFromInvoice` maps a real invoice; `sampleSheet` feeds the designer.
import type { Invoice } from "@/types/billing";
import type { Doctor, Patient, Tenant } from "@/types";
import { numToWords } from "./buildInvoiceHTML";

export interface SheetItem {
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  disc: number; // % off the line
  gstRate: number;
  amt: number; // taxable value of the line (after its discount, before GST)
}

export interface SheetCompany {
  name: string;
  addressLines: string[];
  email?: string;
  phone?: string;
  website?: string;
  gst?: string;
  pan?: string;
  state?: string;
  bank: { label: string; value: string }[];
  terms: string[];
  signatoryName: string;
  signatoryTitle?: string;
  footerNote?: string;
}

export interface SheetData {
  title: string;
  invNo: string;
  invDate: Date;
  dueDate: Date;
  statusLabel: string; // PAID / PART PAID / UNPAID / VOID
  patient: {
    name: string;
    idLine: string;
    address: string;
    email?: string;
    phone?: string;
  };
  doctor?: { name: string; spec?: string; reg?: string };
  items: SheetItem[];
  subtotal: number; // sum of line taxable values
  discount: number; // additional invoice-level discount
  taxAmt: number;
  isInterState: boolean;
  total: number;
  paid: number;
  balance: number;
  taxRows: { hsn: string; rate: number; taxable: number; tax: number }[];
  payments: { date: Date; mode: string; reference?: string; amount: number }[];
  notes?: string;
  words: string;
  company: SheetCompany;
}

const DEFAULT_TERMS = [
  "Please quote the invoice number in all payment references.",
  "Medicines once dispensed cannot be returned or exchanged.",
  "Keep this invoice for insurance / reimbursement claims.",
];

const obj = <T>(v: unknown): T | undefined =>
  v && typeof v === "object" ? (v as T) : undefined;
const ageOf = (dob?: string) => {
  if (!dob) return "";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000);
  return y >= 0 && y < 150 ? `${y} yrs` : "";
};

/** The issuing clinic, from Settings (General Info, Bank Details, Invoice & Printing). */
export function companyFromTenant(t: Tenant | null | undefined): SheetCompany {
  const is = t?.invoiceSettings;
  const bk = t?.bank;
  const terms = (is?.terms || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const bankRows: [string, string | undefined][] =
    is?.showBank === false
      ? []
      : [
          ["A/c Name", bk?.accountHolder],
          ["Bank", [bk?.bankName, bk?.branch].filter(Boolean).join(", ")],
          ["A/c No.", bk?.accountNumber],
          ["IFSC", bk?.ifsc],
          ["UPI", bk?.upiId],
        ];
  const c = t?.contact;
  return {
    name: t?.gstDetails?.legalName || t?.name || "Clinic",
    addressLines: [
      c?.address,
      [c?.city, c?.state, c?.pincode].filter(Boolean).join(", "),
    ].filter(Boolean) as string[],
    email: c?.email,
    phone: c?.phone,
    website: (c as { website?: string } | undefined)?.website,
    gst: t?.gstDetails?.gstin,
    pan: t?.gstDetails?.pan,
    state: c?.state,
    bank: bankRows
      .filter(([, v]) => v)
      .map(([label, value]) => ({ label, value: value as string })),
    terms: terms.length ? terms : DEFAULT_TERMS,
    signatoryName: is?.signatoryName || "Authorised Signatory",
    signatoryTitle: is?.signatoryTitle,
    footerNote: is?.footerNote,
  };
}

export function sheetFromInvoice(
  inv: Invoice,
  tenant: Tenant | null,
): SheetData {
  const patient = obj<Patient>(inv.patientId);
  const doctor = obj<Doctor>(inv.doctorId);
  const company = companyFromTenant(tenant);

  const items: SheetItem[] = inv.items.map((l) => ({
    description: l.description,
    hsn: l.hsnCode || "",
    qty: l.qty,
    unit: l.unit || "Nos",
    rate: l.rate,
    disc: l.discountPercent || 0,
    gstRate: l.gstRate,
    amt: l.amount,
  }));
  const subtotal = items.reduce((s, l) => s + l.amt, 0);
  const gst = inv.gst || 0;
  const total = inv.total;
  const paid = inv.paid || 0;

  // Same state -> CGST + SGST; different states -> IGST. Unknown state is treated as the clinic's own.
  const sellerState = (tenant?.contact?.state || "").trim().toLowerCase();
  const buyerState = (patient?.address?.state || "").trim().toLowerCase();
  const isInterState =
    !!sellerState && !!buyerState && sellerState !== buyerState;

  const groups = new Map<
    string,
    { hsn: string; rate: number; taxable: number; tax: number }
  >();
  for (const l of items) {
    if (!(l.gstRate > 0)) continue;
    const k = `${l.hsn}|${l.gstRate}`;
    const g = groups.get(k) ?? {
      hsn: l.hsn || "—",
      rate: l.gstRate,
      taxable: 0,
      tax: 0,
    };
    g.taxable += l.amt;
    g.tax += Math.round(l.amt * l.gstRate) / 100;
    groups.set(k, g);
  }

  const created = new Date(inv.createdAt);
  return {
    title: gst > 0 ? "TAX INVOICE" : "INVOICE",
    invNo: inv.number,
    invDate: created,
    dueDate: inv.dueDate ? new Date(inv.dueDate) : created,
    statusLabel:
      inv.status === "paid"
        ? "PAID"
        : inv.status === "partial"
          ? "PART PAID"
          : inv.status === "void"
            ? "VOID"
            : "UNPAID",
    patient: {
      name: patient?.name || "—",
      idLine: [
        patient?.patientId && `Patient ID: ${patient.patientId}`,
        ageOf(patient?.dateOfBirth),
        patient?.gender,
      ]
        .filter(Boolean)
        .join("  |  "),
      address: [
        patient?.address?.street,
        patient?.address?.city,
        patient?.address?.state,
        patient?.address?.pincode,
      ]
        .filter(Boolean)
        .join(", "),
      email: patient?.contact?.email,
      phone: patient?.contact?.phone,
    },
    doctor: doctor
      ? {
          name: doctor.name,
          spec: (doctor.professionalDetails?.specializations ?? []).join(", "),
          reg: doctor.professionalDetails?.registrationNumber,
        }
      : undefined,
    items,
    subtotal,
    discount: inv.discount || 0,
    taxAmt: gst,
    isInterState,
    total,
    paid,
    balance:
      inv.status === "void"
        ? 0
        : Math.max(0, Math.round((total - paid) * 100) / 100),
    taxRows: [...groups.values()],
    payments: (inv.payments ?? []).map((p) => ({
      date: new Date(p.receivedAt),
      mode: String(p.mode).toUpperCase(),
      reference: p.reference,
      amount: p.amount,
    })),
    notes: inv.notes,
    words: numToWords(total),
    company,
  };
}

/** Designer preview data. Uses the clinic's own details where they are set. */
export function sampleSheet(tenant: Tenant | null): SheetData {
  const company = companyFromTenant(tenant);
  if (!company.addressLines.length)
    company.addressLines = [
      "12, Health Street, Andheri East",
      "Mumbai, Maharashtra, 400069",
    ];
  if (!company.phone) company.phone = "9820000000";
  if (!company.bank.length) {
    company.bank = [
      { label: "A/c Name", value: company.name },
      { label: "Bank", value: "Sample Bank, Andheri" },
      { label: "A/c No.", value: "000123456789" },
      { label: "IFSC", value: "SBIN0001234" },
    ];
  }
  const items: SheetItem[] = [
    {
      description: "Consultation — General Medicine",
      hsn: "999311",
      qty: 1,
      unit: "Nos",
      rate: 600,
      disc: 0,
      gstRate: 0,
      amt: 600,
    },
    {
      description: "Complete Blood Count (CBC)",
      hsn: "999316",
      qty: 1,
      unit: "Nos",
      rate: 350,
      disc: 10,
      gstRate: 0,
      amt: 315,
    },
    {
      description: "Paracetamol 650 mg (strip of 15)",
      hsn: "30049099",
      qty: 2,
      unit: "Strip",
      rate: 30,
      disc: 0,
      gstRate: 12,
      amt: 60,
    },
    {
      description: "Pantoprazole 40 mg (strip of 15)",
      hsn: "30049099",
      qty: 1,
      unit: "Strip",
      rate: 144,
      disc: 0,
      gstRate: 12,
      amt: 144,
    },
  ];
  const subtotal = items.reduce((s, l) => s + l.amt, 0);
  const tax = Math.round((60 + 144) * 12) / 100;
  const total = subtotal + tax;
  return {
    title: "TAX INVOICE",
    invNo: "INV-0001",
    invDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 86_400_000),
    statusLabel: "PART PAID",
    patient: {
      name: "Asha Verma",
      idLine: "Patient ID: NC-00042  |  34 yrs  |  female",
      address: "221B Baker Street, Andheri East, Mumbai, Maharashtra, 400069",
      email: "asha.verma@example.com",
      phone: "9876543210",
    },
    doctor: {
      name: "Dr. Rajesh Kulkarni",
      spec: "General Medicine",
      reg: "MMC-12345",
    },
    items,
    subtotal,
    discount: 0,
    taxAmt: tax,
    isInterState: false,
    total,
    paid: 1000,
    balance: total - 1000,
    taxRows: [{ hsn: "30049099", rate: 12, taxable: 204, tax }],
    payments: [
      { date: new Date(), mode: "UPI", reference: "UPI-88231", amount: 1000 },
    ],
    words: numToWords(total),
    company,
  };
}
