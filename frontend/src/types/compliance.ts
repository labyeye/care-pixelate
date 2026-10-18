export interface AuditEntry {
  _id: string;
  userId?: { _id: string; name: string; email: string } | string;
  role?: string;
  method: string;
  action: "view" | "create" | "update" | "delete" | "action";
  resource: string;
  resourceId?: string;
  path: string;
  status: number;
  ip?: string;
  at: string;
}

export interface ClinicLocation {
  _id: string;
  name: string;
  code: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  phone?: string;
  status: "active" | "inactive";
}

export interface AnalyticsSummary {
  range: { from: string; to: string };
  appointments: {
    total: number;
    byStatus: Record<string, number>;
    byDay: { date: string; count: number }[];
    noShowRate: number;
  };
  newPatients: number;
  revenue: {
    invoices: number;
    billed: number;
    collected: number;
    outstanding: number;
    receivedByMode: Record<string, number>;
  };
  topDoctors: { doctorId: string; name: string; completed: number }[];
  lab: Record<string, number>;
}

export interface ScribeDraft {
  complaints: string;
  diagnosis: string[];
  notes: string;
  vitals: {
    bp?: string;
    pulse?: number;
    tempC?: number;
    spo2?: number;
    weightKg?: number;
  };
  prescription: {
    items: {
      drug: string;
      dose?: string;
      frequency?: string;
      days?: number;
      instructions?: string;
    }[];
    advice?: string;
  };
  followUpInDays: number | null;
}
