import type { Doctor, Patient } from "@/types";

export interface InvoiceLine {
  description: string;
  qty: number;
  rate: number;
  gstRate: number;
  amount: number;
  hsnCode?: string;
  unit?: string;
  discountPercent?: number;
  medicineId?: string;
}

export interface Invoice {
  _id: string;
  number: string;
  patientId: string | Patient;
  appointmentId?: string;
  items: InvoiceLine[];
  subtotal: number;
  gst: number;
  discount: number;
  total: number;
  paid: number;
  status: "unpaid" | "partial" | "paid" | "void";
  payments: { amount: number; mode: string; reference?: string; receivedAt: string; receivedBy?: string | { name: string } }[];
  createdBy?: string | { name: string };
  notes?: string;
  dueDate?: string;
  doctorId?: string | Doctor;
  createdAt: string;
}

export interface LabTest {
  name: string;
  result: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  flag?: "" | "low" | "normal" | "high";
}

export interface LabStaffRef {
  _id: string;
  name: string;
  role: string;
}

export interface LabStage {
  _id?: string;
  status: "ordered" | "collected" | "resulted" | "cancelled";
  at: string;
  by?: string;
  byName?: string;
  byRole?: string;
  note?: string;
}

export interface LabOrder {
  _id: string;
  number: string;
  patientId: string | Patient;
  doctorId?: string | Doctor;
  tests: LabTest[];
  status: "ordered" | "collected" | "resulted" | "cancelled";
  notes?: string;
  /** Staff responsible for performing the test. */
  assignedTo?: LabStaffRef | string | null;
  collectedBy?: LabStaffRef | string | null;
  resultedBy?: LabStaffRef | string | null;
  collectedAt?: string;
  resultedAt?: string;
  /** Lifecycle timeline, oldest first. */
  stages?: LabStage[];
  createdAt: string;
}

/** One billable thing found in the patient's records (visit / lab test / medicine). */
export interface BillableItem {
  id: string;
  kind: "appointment" | "lab" | "medicine";
  group: string;
  groupLabel: string;
  description: string;
  qty: number;
  rate: number;
  gstRate: number;
  hsnCode?: string;
  unit?: string;
  medicineId?: string;
  /** false = no price known yet; the user types it once and it is remembered. */
  priced: boolean;
  source: { kind: "appointment" | "lab" | "medicine"; refId: string; key: string };
}

/** Type-ahead result for an invoice line: an inventory medicine or a price-list item, with everything to fill the row. */
export interface CatalogItem {
  kind: "medicine" | "lab" | "procedure";
  label: string;
  description: string;
  rate: number;
  gstRate: number;
  hsnCode: string;
  unit: string;
  medicineId?: string;
  stock: number | null;
  detail?: string;
}
