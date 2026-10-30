import type { PayOrder } from "@/lib/paymentGateway";
import type {
  BillableItem,
  CatalogItem,
  Invoice,
  LabOrder,
} from "@/types/billing";
import type {
  AnalyticsSummary,
  AuditEntry,
  ClinicLocation,
  ScribeDraft,
} from "@/types/compliance";
import type {
  ApiResponse,
  Appointment,
  Consultation,
  Doctor,
  Patient,
  PlanInfo,
  StaffMember,
  Triage,
  Subscription,
  Tenant,
  User,
  Medicine,
  Vendor,
} from "@/types";

const API_BASE = import.meta.env.VITE_API_URL

export type PhotoKind = "patient" | "doctor" | "staff";

/** Image URL for a person's profile photo (served by the API, cookie-authenticated, browser-cached). */
export const photoUrl = (
  kind: PhotoKind,
  id: string,
  version?: string | number,
) => `${API_BASE}/photos/${kind}/${id}${version ? `?v=${version}` : ""}`;

/** One account that shares the phone number being signed in with. */
export interface PhoneChoice {
  userId: string;
  name: string;
  role: string;
  email: string; // masked
  clinic: string;
  patientId?: string;
  age?: number | null;
  gender?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let isRefreshing = false;

async function rawRequest(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (MUTATING.has(method)) {
    const csrfToken = getCookie("csrf_token");
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  });

  return res;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return (await requestBody<T>(path, options)).data;
}

async function requestBody<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T> & { warnings?: string[] }> {
  let res = await rawRequest(path, options);

  // Auth endpoints report their own 401s (wrong password, bad code, no session
  // yet on a public page) — refreshing + hard-redirecting would make /register
  // and /forgot-password unreachable for signed-out visitors.
  if (res.status === 401 && !isRefreshing && !path.startsWith("/auth/")) {
    isRefreshing = true;
    try {
      const refreshRes = await rawRequest("/auth/refresh", { method: "POST" });
      isRefreshing = false;
      if (refreshRes.ok) {
        res = await rawRequest(path, options);
      } else {
        if (typeof window !== "undefined") window.location.href = "/login";
        throw new ApiError("Session expired", 401);
      }
    } catch (err) {
      isRefreshing = false;
      if (typeof window !== "undefined") window.location.href = "/login";
      throw err;
    }
  }

  if (
    res.status === 402 &&
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/billing")
  ) {
    window.location.href = "/billing";
  }

  let body: (ApiResponse<T> & { warnings?: string[] }) | undefined;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  if (!res.ok || !body?.success) {
    throw new ApiError(
      body?.message || `Request failed (${res.status})`,
      res.status,
    );
  }

  return body;
}

const buildQuery = (params?: Record<string, string | undefined>) => {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [
    string,
    string,
  ][];
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
};

export interface RegisterPayload {
  orgName: string;
  orgType: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  doctorCount: number;
  gstin?: string;
  password: string;
  acceptTerms: boolean;
}

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  price: { subtotal: number; gst: number; total: number };
}

export const billingAPI = {
  plans: () =>
    request<{
      plans: Record<string, PlanInfo>;
      trial: { days: number; doctorLimit: number; patientLimit: number };
      gstRate: number;
    }>("/billing/plans"),
  me: () =>
    request<{
      tenant: Tenant;
      subscription: Subscription | null;
      usage: { doctors: number };
    }>("/billing/me"),
  createOrder: (payload: {
    plan: string;
    doctors: number;
    billingCycle: "monthly" | "yearly";
  }) =>
    request<RazorpayOrder>("/billing/order", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verify: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    request<{ subscription: Subscription }>("/billing/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const creditsAPI = {
  balance: () => request<any>("/credits/balance"),
  packs: () =>
    request<{ packs: any[]; gstPct: number; ratePerMessage: number }>(
      "/credits/packs",
    ),
  estimate: () =>
    request<{
      appointmentReminders: number;
      followUpReminders: number;
      credits: number;
    }>("/credits/estimate"),
  topups: () => request<any[]>("/credits/topups"),
  // the list endpoint also returns `total` next to `data`, so it needs the whole body
  ledger: async (page = 1, type = "") =>
    (await requestBody<any[]>(
      `/credits/ledger?page=${page}${type ? `&type=${type}` : ""}`,
    )) as unknown as { data: any[]; total: number; page: number },
  createTopup: (packId: string) =>
    request<any>("/credits/topup", {
      method: "POST",
      body: JSON.stringify({ packId }),
    }),
  verifyTopup: (payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) =>
    request<any>("/credits/topup/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const authAPI = {
  /** Step 1: account only. The organisation is created in `onboard`. */
  register: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    acceptTerms: boolean;
  }) =>
    request<{ user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Final onboarding step: creates the organisation (14-day trial). */
  onboard: (payload: {
    orgName: string;
    orgType: string;
    city: string;
    state: string;
    gstin?: string;
    doctorCount: number;
    registrationNumber?: string;
    registrationCouncil?: string;
    consultationFee?: number;
    clinicCode?: string;
  }) =>
    request<{ tenant: Tenant }>("/auth/onboard", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  registerTenant: (payload: RegisterPayload) =>
    request<{ user: User; tenant: Tenant }>("/auth/register-tenant", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Public: confirms a clinic code before a patient signs up. */
  clinic: (slug: string) =>
    request<{ name: string; appName?: string; logoUrl?: string }>(
      `/auth/clinic/${encodeURIComponent(slug.trim().toLowerCase())}`,
    ),
  /** Patient self-signup into an existing clinic; signs the patient in (cookie). */
  registerPatient: (payload: {
    clinicCode: string;
    name: string;
    email: string;
    phone: string;
    password: string;
    dob: string;
    gender: string;
    acceptTerms: boolean;
  }) =>
    request<{ user: User }>("/auth/register-patient", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string }) =>
    request<{ user?: User; requires2FA?: boolean; pendingToken?: string }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  verify2FA: (pendingToken: string, token: string) =>
    request<{ user: User }>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ pendingToken, token }),
    }),
  forgotPassword: (email: string) =>
    request<Record<string, never>>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<Record<string, never>>(`/auth/reset-password/${token}`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  loginSendOtp: (phone: string) =>
    request<Record<string, never>>("/auth/login/otp/send", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  /** One matching account -> signed in. Several (shared phone) -> requiresSelection + the choices to pick from. */
  loginVerifyOtp: (phone: string, otp: string) =>
    request<{
      user?: User;
      requiresSelection?: boolean;
      selectionToken?: string;
      choices?: PhoneChoice[];
    }>("/auth/login/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, otp }),
    }),
  loginSelect: (selectionToken: string, userId: string) =>
    request<{ user: User }>("/auth/login/select", {
      method: "POST",
      body: JSON.stringify({ selectionToken, userId }),
    }),
  sendPhoneOtp: (phone: string) =>
    request<Record<string, never>>("/auth/phone/send-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyPhoneOtp: (otp: string) =>
    request<Record<string, never>>("/auth/phone/verify-otp", {
      method: "POST",
      body: JSON.stringify({ otp }),
    }),
  totpSetup: () =>
    request<{ secret: string; qrCode: string }>("/auth/2fa/totp/setup", {
      method: "POST",
    }),
  totpVerify: (token: string) =>
    request<Record<string, never>>("/auth/2fa/totp/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  totpDisable: (token: string) =>
    request<Record<string, never>>("/auth/2fa/totp/disable", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  getMe: () =>
    request<{ user: User; tenant: Tenant | null; pages?: string[] }>(
      "/auth/me",
    ),
  refresh: () =>
    request<{ refreshed: boolean }>("/auth/refresh", { method: "POST" }),
  logout: () =>
    request<Record<string, never>>("/auth/logout", { method: "POST" }),
};

export const tenantAPI = {
  getCurrent: (tenantId?: string) =>
    request<Tenant>(`/tenants/me${buildQuery({ tenantId })}`),
  updateTenant: (payload: Partial<Tenant>, tenantId?: string) =>
    request<Tenant>(`/tenants/me${buildQuery({ tenantId })}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

function makeCrudApi<T>(resource: string) {
  return {
    getAll: (
      tenantId?: string,
      params: Record<string, string | undefined> = {},
    ) => request<T[]>(`/${resource}${buildQuery({ tenantId, ...params })}`),
    getOne: (id: string, tenantId?: string) =>
      request<T>(`/${resource}/${id}${buildQuery({ tenantId })}`),
    create: (payload: Partial<T>, tenantId?: string) =>
      request<T>(`/${resource}${buildQuery({ tenantId })}`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<T>, tenantId?: string) =>
      request<T>(`/${resource}/${id}${buildQuery({ tenantId })}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    remove: (id: string, tenantId?: string) =>
      request<Record<string, never>>(
        `/${resource}/${id}${buildQuery({ tenantId })}`,
        {
          method: "DELETE",
        },
      ),
  };
}

export interface TimelineEvent {
  type: "appointment" | "consultation" | "invoice" | "lab";
  date: string;
  title: string;
  detail: string;
  id: string;
}
export interface PatientTimeline {
  summary: {
    visits: number;
    lastVisit: string | null;
    nextAppointment: string | null;
    nextFollowUp: string | null;
    outstanding: number;
  };
  events: TimelineEvent[];
}
export const patientsAPI = {
  ...makeCrudApi<Patient>("patients"),
  timeline: (id: string) =>
    request<PatientTimeline>(`/patients/${id}/timeline`),
  importRows: (rows: Record<string, string>[]) =>
    request<{ created: number; skipped: { row: number; reason: string }[] }>(
      "/patients/import",
      { method: "POST", body: JSON.stringify({ rows }) },
    ),
};

export interface FollowUpRow {
  _id: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientId: string;
    name: string;
    contact?: { phone?: string };
  };
  doctor?: { _id: string; name: string };
  followUpOn: string;
  consultedOn: string;
  status: "pending" | "booked" | "visited";
  reminderSentAt: string | null;
}
export const followUpsAPI = {
  list: (params: { bucket?: string; status?: string } = {}) =>
    request<FollowUpRow[]>(`/follow-ups${buildQuery(params)}`),
  remind: (id: string) =>
    request<{ sent: boolean; status: string; reason: string }>(
      `/follow-ups/${id}/remind`,
      { method: "POST" },
    ),
};

export interface WhatsAppTemplateInfo {
  key: string;
  name: string;
  title: string;
  category: string;
  trigger: string;
  vars: string[];
  body: string;
  preview: string;
  enabled: boolean;
}
export interface WhatsAppSettings {
  enabled: boolean;
  connected: boolean;
  templates: WhatsAppTemplateInfo[];
}
export interface MessageLogRow {
  _id: string;
  template: string;
  to: string;
  status: "sent" | "failed" | "skipped" | "not_connected";
  reason: string;
  createdAt: string;
}
export const whatsappAPI = {
  get: () => request<WhatsAppSettings>("/whatsapp"),
  save: (payload: { enabled?: boolean; disabledTemplates?: string[] }) =>
    request<WhatsAppSettings>("/whatsapp", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  log: () => request<MessageLogRow[]>("/whatsapp/log"),
};
export const doctorsAPI = makeCrudApi<Doctor>("doctors");
export interface PaymentConfig {
  provider: "razorpay" | "cashfree" | "phonepe" | "paytm";
  enabled: boolean;
  configured: boolean;
  razorpayKeyId: string;
  cashfreeAppId: string;
  phonepeMerchantId: string;
  phonepeSaltIndex: string;
  paytmMerchantId: string;
  razorpayKeySecretSet: boolean;
  cashfreeSecretKeySet: boolean;
  phonepeSaltKeySet: boolean;
  paytmMerchantKeySet: boolean;
}
type VerifyExtra = {
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpayOrderId?: string;
};
export const paymentsAPI = {
  getConfig: () => request<PaymentConfig>("/payments/config"),
  saveConfig: (payload: Record<string, unknown>) =>
    request<PaymentConfig>("/payments/config", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  status: () =>
    request<{ enabled: boolean; provider: string | null }>("/payments/status"),
  order: (appointmentId: string) =>
    request<PayOrder>(`/payments/appointments/${appointmentId}/order`, {
      method: "POST",
    }),
  verify: (appointmentId: string, orderId: string, extra: VerifyExtra = {}) =>
    request<{ paymentStatus: string }>("/payments/verify", {
      method: "POST",
      body: JSON.stringify({ appointmentId, orderId, ...extra }),
    }),
};

export const appointmentsAPI = {
  ...makeCrudApi<Appointment>("appointments"),
  checkIn: (id: string) =>
    request<Appointment>(`/appointments/${id}/check-in`, { method: "POST" }),
  /** Doctor opens the visit from the Queue (starts the ongoing timer; checks the patient in if needed). */
  start: (id: string) =>
    request<Appointment>(`/appointments/${id}/start`, { method: "POST" }),
  /** Intake vitals recorded for a visit (nurse / receptionist), shown pre-filled to the doctor. */
  getVitals: (id: string) => request<Triage>(`/appointments/${id}/vitals`),
  saveVitals: (
    id: string,
    payload: { vitals: Record<string, unknown>; complaints?: string },
  ) =>
    request<Triage>(`/appointments/${id}/vitals`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  /** Inclusive YYYY-MM-DD range (max ~2 months), optionally for one doctor. */
  range: (params: { from: string; to: string; doctorId?: string }) =>
    request<Appointment[]>(
      `/appointments${buildQuery({ ...params, limit: "500" })}`,
    ),
};

export const consultationsAPI = {
  getAll: (params: {
    appointmentId?: string;
    patientId?: string;
    status?: string;
    doctorId?: string;
    from?: string;
    to?: string;
    q?: string;
    limit?: string;
  }) => request<Consultation[]>(`/consultations${buildQuery(params)}`),
  getOne: (id: string) => request<Consultation>(`/consultations/${id}`),
  create: async (payload: Record<string, unknown>) => {
    const b = await requestBody<Consultation>("/consultations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { data: b.data, warnings: b.warnings ?? [] };
  },
  update: async (id: string, payload: Record<string, unknown>) => {
    const b = await requestBody<Consultation>(`/consultations/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return { data: b.data, warnings: b.warnings ?? [] };
  },
  sign: (id: string) =>
    request<Consultation>(`/consultations/${id}/sign`, { method: "POST" }),
  discard: (id: string) =>
    request<Record<string, never>>(`/consultations/${id}`, {
      method: "DELETE",
    }),
};

export const invoicesAPI = {
  getAll: (params: { status?: string; patientId?: string } = {}) =>
    request<Invoice[]>(`/invoices${buildQuery(params)}`),
  getOne: (id: string) => request<Invoice>(`/invoices/${id}`),
  catalog: (q: string) =>
    request<CatalogItem[]>(`/invoices/catalog${buildQuery({ q })}`),
  billable: (patientId: string) =>
    request<BillableItem[]>(`/invoices/billable${buildQuery({ patientId })}`),
  create: (payload: {
    patientId: string;
    discount?: number;
    rememberPrices?: boolean;
    doctorId?: string;
    dueDate?: string;
    notes?: string;
    initialPayment?: { amount: number; mode: string; reference?: string };
    items: {
      description: string;
      qty: number;
      rate: number;
      gstRate: number;
      discountPercent?: number;
      hsnCode?: string;
      unit?: string;
      medicineId?: string;
      source?: BillableItem["source"];
    }[];
  }) =>
    request<Invoice>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  fromAppointment: (appointmentId: string) =>
    request<Invoice>(`/invoices/from-appointment/${appointmentId}`, {
      method: "POST",
    }),
  pay: (
    id: string,
    payload: { amount: number; mode: string; reference?: string },
  ) =>
    request<Invoice>(`/invoices/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  void: (id: string, reason?: string) =>
    request<Invoice>(`/invoices/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

export const labAPI = {
  getAll: (params: { status?: string; patientId?: string } = {}) =>
    request<LabOrder[]>(`/lab-orders${buildQuery(params)}`),
  technicians: () =>
    request<{ _id: string; name: string; role: string }[]>(
      "/lab-orders/technicians",
    ),
  create: (payload: {
    patientId: string;
    doctorId?: string;
    assignedTo?: string;
    tests: { name: string; unit?: string; refLow?: string; refHigh?: string }[];
  }) =>
    request<LabOrder>("/lab-orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    request<LabOrder>(`/lab-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  /** Edit the order itself: ordering doctor, performer, notes, test definitions. */
  updateDetails: (id: string, payload: Record<string, unknown>) =>
    request<LabOrder>(`/lab-orders/${id}/details`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<Record<string, never>>(`/lab-orders/${id}`, { method: "DELETE" }),
};

export interface MedicineStats {
  total: number;
  active: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  stockValue: number;
}

export const medicinesAPI = {
  getAll: (params: Record<string, string | undefined> = {}) =>
    request<Medicine[]>(`/medicines${buildQuery(params)}`),
  stats: () => request<MedicineStats>("/medicines/stats"),
  create: (payload: Partial<Medicine>) =>
    request<Medicine>("/medicines", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<Medicine>) =>
    request<Medicine>(`/medicines/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  stock: (
    id: string,
    payload: {
      type: "in" | "out" | "set";
      qty: number;
      expiryDate?: string;
      vendor?: string;
    },
  ) =>
    request<Medicine>(`/medicines/${id}/stock`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<Record<string, never>>(`/medicines/${id}`, { method: "DELETE" }),
};

export interface VendorStats {
  total: number;
  active: number;
  inactive: number;
  blocked: number;
  licenceDue: number;
  medicinesWithoutVendor: number;
  stockValue: number;
  openingBalance: number;
}

export interface ReportFilter {
  key: string;
  label: string;
  allLabel?: string;
  options: { value: string; label: string }[];
}

export const vendorsAPI = {
  stats: () => request<VendorStats>("/vendors/stats"),
  getAll: (params: Record<string, string | undefined> = {}) =>
    request<Vendor[]>(`/vendors${buildQuery(params)}`),
  create: (payload: Partial<Vendor>) =>
    request<Vendor>("/vendors", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<Vendor>) =>
    request<Vendor>(`/vendors/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<Record<string, never>>(`/vendors/${id}`, { method: "DELETE" }),
};

export interface PortalVital {
  _id: string;
  patientId: string;
  type: "bp" | "sugar" | "weight" | "pulse" | "spo2" | "temp";
  value: number;
  value2?: number;
  unit?: string;
  note?: string;
  measuredAt: string;
}

export interface PortalRecord {
  _id: string;
  patientId: string;
  title: string;
  type: "prescription" | "lab_report" | "bill" | "scan" | "discharge" | "other";
  recordDate: string;
  mimeType: string;
  size: number;
}

/** The signed-in patient's own data (all of it scoped server-side to the account's profiles). */
export const portalAPI = {
  profiles: () => request<Patient[]>("/me/profiles"),
  addProfile: (payload: Record<string, unknown>) =>
    request<Patient>("/me/profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProfile: (id: string, payload: Record<string, unknown>) =>
    request<Patient>(`/me/profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  doctors: () => request<Doctor[]>("/me/doctors"),
  slots: (doctorId: string, date: string) =>
    request<{ start: string; end: string }[]>(
      `/me/doctors/${doctorId}/slots${buildQuery({ date })}`,
    ),
  appointments: () => request<Appointment[]>("/me/appointments?limit=200"),
  book: (payload: {
    patientId: string;
    doctorId: string;
    scheduledAt: string;
    reason?: string;
    type?: string;
  }) =>
    request<Appointment>("/me/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancel: (id: string, reason?: string) =>
    request<Appointment>(`/me/appointments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  videoLink: (id: string) =>
    request<{ url: string }>(`/me/appointments/${id}/video-link`),
  payStatus: () => request<{ enabled: boolean }>("/me/pay-status"),
  payOrder: (id: string) =>
    request<PayOrder>(`/me/appointments/${id}/pay-order`, { method: "POST" }),
  payVerify: (
    appointmentId: string,
    orderId: string,
    extra: VerifyExtra = {},
  ) =>
    request<{ paymentStatus: string }>("/me/pay-verify", {
      method: "POST",
      body: JSON.stringify({ appointmentId, orderId, ...extra }),
    }),
  invoices: () => request<Invoice[]>("/me/invoices"),
  labOrders: () => request<LabOrder[]>("/me/lab-orders"),
  prescriptions: () => request<Consultation[]>("/me/prescriptions"),
  vitals: (params: { patientId?: string; type?: string } = {}) =>
    request<PortalVital[]>(`/me/vitals${buildQuery(params)}`),
  addVital: (payload: {
    patientId?: string;
    type: string;
    value: number;
    value2?: number;
    unit?: string;
    note?: string;
    measuredAt?: string;
  }) =>
    request<PortalVital>("/me/vitals", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteVital: (id: string) =>
    request<Record<string, never>>(`/me/vitals/${id}`, { method: "DELETE" }),
  records: () => request<PortalRecord[]>("/me/records"),
  uploadRecord: (payload: {
    patientId?: string;
    title: string;
    type: string;
    recordDate?: string;
    mimeType: string;
    dataBase64: string;
  }) =>
    request<PortalRecord>("/me/records", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteRecord: (id: string) =>
    request<Record<string, never>>(`/me/records/${id}`, { method: "DELETE" }),
  /** Fetched with the auth cookie, then opened as a blob. */
  openRecord: async (id: string) => {
    const res = await rawRequest(`/me/records/${id}/file`);
    if (!res.ok) throw new ApiError("Could not open the file", res.status);
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

export const videoAPI = {
  link: (appointmentId: string) =>
    request<{ url: string }>(`/appointments/${appointmentId}/video-link`),
};

export interface ReportResult {
  type: string;
  title: string;
  range: { from: string; to: string };
  truncated: boolean;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
}

export interface SummaryData {
  patients: {
    total: number;
    active: number;
    inactive: number;
    archived: number;
    newThisMonth: number;
  };
  doctors: {
    total: number;
    active: number;
    verified: number;
    pendingVerification: number;
  };
  staff: { total: number; active: number; inactive: number; doctors: number };
  appointments: {
    total: number;
    today: number;
    upcoming: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  invoices: {
    count: number;
    billed: number;
    collected: number;
    outstanding: number;
    unpaid: number;
    partial: number;
    paid: number;
  } | null;
  lab: {
    ordered: number;
    collected: number;
    resulted: number;
    abnormal: number;
  };
  consultations: {
    today: number;
    drafts: number;
    signed: number;
    followUpsThisWeek: number;
  };
  clinics: { total: number; active: number };
  auditToday: {
    events: number;
    views: number;
    changes: number;
    denied: number;
  } | null;
}

export interface PermissionMatrix {
  pages: {
    key: string;
    label: string;
    group: string;
    base: string[];
    mandatoryFor: string[];
  }[];
  roles: string[];
  current: Record<string, string[]>;
  defaults: Record<string, string[]>;
}

export const permissionsAPI = {
  get: () => request<PermissionMatrix>("/tenants/permissions"),
  update: (permissions: Record<string, string[]>) =>
    request<PermissionMatrix>("/tenants/permissions", {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }),
  reset: () =>
    request<PermissionMatrix>("/tenants/permissions", {
      method: "PUT",
      body: JSON.stringify({ reset: true }),
    }),
};

export const summaryAPI = {
  get: () => request<SummaryData>("/summary"),
};

export const reportsAPI = {
  list: () =>
    request<
      {
        id: string;
        title: string;
        category?: string;
        desc?: string;
        dateRange: boolean;
        filters?: ReportFilter[];
      }[]
    >("/reports"),
  run: (type: string, params: Record<string, string | undefined>) =>
    request<ReportResult>(`/reports/${type}${buildQuery(params)}`),
  /** Downloads through fetch so the auth cookie is sent; saves as a file. */
  download: async (
    type: string,
    params: Record<string, string | undefined>,
  ) => {
    const res = await rawRequest(
      `/reports/${type}${buildQuery({ ...params, format: "csv" })}`,
    );
    if (!res.ok)
      throw new ApiError("Could not download the report", res.status);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const complianceAPI = {
  // The list endpoints carry `total` next to `data`, so read the whole body here.
  audit: async (params: Record<string, string | undefined>) => {
    const b = await requestBody<AuditEntry[]>(
      `/audit-logs${buildQuery(params)}`,
    );
    return {
      items: b.data,
      total: (b as unknown as { total?: number }).total ?? b.data.length,
    };
  },
  analytics: (params: { from: string; to: string }) =>
    request<AnalyticsSummary>(`/analytics/summary${buildQuery(params)}`),
  clinics: () => request<ClinicLocation[]>("/clinics"),
  createClinic: (payload: Partial<ClinicLocation>) =>
    request<ClinicLocation>("/clinics", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateClinic: (id: string, payload: Partial<ClinicLocation>) =>
    request<ClinicLocation>(`/clinics/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteClinic: (id: string) =>
    request<Record<string, never>>(`/clinics/${id}`, { method: "DELETE" }),
  scribe: (transcript: string) =>
    request<ScribeDraft>("/ai/scribe", {
      method: "POST",
      body: JSON.stringify({ transcript }),
    }),
};

export const slotsAPI = {
  forDoctor: (doctorId: string, date: string) =>
    request<{ start: string; end: string }[]>(
      `/doctors/${doctorId}/slots?date=${date}`,
    ),
};

export const staffAPI = {
  getAll: () => request<StaffMember[]>("/staff"),
  create: (payload: Record<string, unknown>) =>
    request<StaffMember>("/staff", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getOne: (id: string) => request<Record<string, unknown>>(`/staff/${id}`),
  update: (id: string, payload: Record<string, unknown>) =>
    request<StaffMember>(`/staff/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<Record<string, never>>(`/staff/${id}`, { method: "DELETE" }),
  /** Owner/admin sets a new password (generated when omitted); returned once. Signs the person out. */
  resetPassword: (id: string, password?: string) =>
    request<{ password: string; email: string; name: string }>(
      `/staff/${id}/reset-password`,
      { method: "POST", body: JSON.stringify({ password }) },
    ),
};

// Terms & Privacy acceptance (backend /api/legal). Used by components/TermsGate.
export const legalAPI = {
  status: async () => {
    const r: any = await request("/legal/status");
    return r.data ?? r;
  },
  accept: async () => {
    const r: any = await request("/legal/accept", { method: "POST", body: JSON.stringify({}) });
    return r.data ?? r;
  },
};
