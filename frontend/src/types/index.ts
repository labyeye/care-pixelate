export type UserRole =
  | "super_admin"
  | "tenant_owner"
  | "hospital_admin"
  | "doctor"
  | "nurse"
  | "receptionist"
  | "pharmacist"
  | "lab_technician"
  | "billing_executive"
  | "patient"
  | "staff";

export type OrgType =
  | "hospital"
  | "clinic"
  | "individual_doctor"
  | "multi_speciality_hospital"
  | "diagnostic_center"
  | "pharmacy"
  | "medical_college"
  | "corporate_healthcare"
  | "ngo_healthcare"
  | "telemedicine_company";

export interface User {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId?: string | null;
  status?: "active" | "inactive";
  phone?: string;
  phoneVerified?: boolean;
  totpEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantBranding {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  appName: string;
}

export interface TenantContact {
  email: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
  language: string;
  city?: string;
  state?: string;
  pincode?: string;
  website?: string;
}

export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  orgType: OrgType;
  ownerUser: string;
  plan: "trial" | "basic" | "starter" | "pro" | "clinic" | "enterprise";
  planExpiresAt?: string;
  status: "active" | "suspended" | "cancelled";
  branding: TenantBranding;
  contact: TenantContact;
  limits: {
    userLimit: number;
    storageLimit: number;
    doctorLimit?: number;
    patientLimit?: number;
  };
  activeModules: string[];
  gstDetails?: { gstin: string; legalName: string; pan?: string };
  bank?: {
    accountHolder?: string;
    bankName?: string;
    branch?: string;
    accountNumber?: string;
    ifsc?: string;
    accountType?: "current" | "savings";
    upiId?: string;
  };
  invoiceSettings?: {
    terms?: string;
    footerNote?: string;
    signatoryName?: string;
    signatoryTitle?: string;
    showBank?: boolean;
  };
  /** Invoice Designer layout (Settings -> Invoice Designer); null/absent = the classic invoice. */
  invoiceTemplate?: unknown;
  /** Consultation Designer layout (Settings -> Consultation Designer); null/absent = the classic prescription. */
  consultationTemplate?: unknown;
  profile?: { expectedDoctors?: number; termsAcceptedAt?: string };
  createdAt?: string;
  updatedAt?: string;
}

export type PatientGender = "male" | "female" | "other" | "undisclosed";

export interface Patient {
  _id: string;
  tenantId: string;
  patientId: string;
  userId?: string | null;
  firstName: string;
  middleName?: string;
  lastName: string;
  /** Server-computed "first middle last" (virtual) — use for display only. */
  name: string;
  profileImage?: string;
  dateOfBirth: string;
  gender: PatientGender;
  bloodGroup?:
    "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
  maritalStatus?:
    "single" | "married" | "divorced" | "widowed" | "other" | "undisclosed";
  contact: { phone: string; alternatePhone?: string; email?: string };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  emergencyContact?: { name?: string; relationship?: string; phone?: string };
  guardian?: { name?: string; relationship?: string; phone?: string };
  medicalSummary?: {
    allergies?: string[];
    chronicConditions?: string[];
    pastMedicalHistory?: string[];
    pastSurgicalHistory?: string[];
    familyMedicalHistory?: string[];
    currentMedications?: {
      name?: string;
      dosage?: string;
      frequency?: string;
    }[];
    notes?: string;
  };
  patientStatus: "active" | "inactive" | "archived";
  registeredBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DoctorAvailability {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  startTime: string;
  endTime: string;
}

export interface Doctor {
  _id: string;
  tenantId: string;
  doctorId: string;
  userId?: string | null;
  firstName: string;
  middleName?: string;
  lastName: string;
  /** Server-computed "first middle last" (virtual) — use for display only. */
  name: string;
  profileImage?: string;
  gender?: "male" | "female" | "other" | "undisclosed";
  dateOfBirth?: string | null;
  contact: { phone: string; email: string };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  professionalDetails: {
    registrationNumber: string;
    registrationCouncil: string;
    qualifications?: {
      degree: string;
      institution?: string;
      year?: number | null;
    }[];
    specializations?: string[];
    experienceYears?: number;
    bio?: string;
    languages?: string[];
  };
  consultation?: {
    consultationFee?: number;
    followUpFee?: number;
    currency?: string;
    appointmentDurationMinutes?: number;
    consultationModes?: ("in_person" | "video")[];
    acceptingAppointments?: boolean;
  };
  availability?: DoctorAvailability[];
  leaveDates?: string[];
  verificationStatus: "pending" | "verified" | "rejected";
  accountStatus: "active" | "inactive" | "suspended";
  createdAt?: string;
  updatedAt?: string;
}

export interface Appointment {
  _id: string;
  tenantId: string;
  patientId: string | Patient;
  doctorId: string | Doctor;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  reason?: string;
  notes?: string;
  type?: "in_clinic" | "video" | "walk_in";
  tokenNo?: number;
  fee?: number;
  paymentStatus?: "unpaid" | "paid" | "waived";
  checkedInAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffMember {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "inactive";
  phone?: string;
  staffId?: string;
  designation?: string;
  department?: string;
  employmentType?: string;
  joiningDate?: string | null;
  hasProfile?: boolean;
  /** Server says this login has a profile photo; `photoV` busts the browser cache when it changes. */
  hasPhoto?: boolean;
  photoV?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  count?: number;
}

export interface PlanInfo {
  name: string;
  perDoctor: number;
  minDoctors: number;
  features: string[];
}

export interface Subscription {
  plan: string;
  status: "trialing" | "active" | "expired" | "cancelled";
  doctors: number;
  billingCycle: "monthly" | "yearly";
  currentPeriodEnd?: string;
  invoices: {
    _id?: string;
    invoiceNumber: string;
    amount: number;
    subtotal?: number;
    gst?: number;
    plan: string;
    doctors?: number;
    billingCycle?: string;
    paidAt?: string;
    createdAt?: string;
    status: string;
    razorpayPaymentId?: string;
  }[];
}

export interface RxItem {
  drug: string;
  dose?: string;
  frequency?: string;
  days?: number;
  instructions?: string;
}

export interface Consultation {
  _id: string;
  tenantId: string;
  appointmentId?: string;
  patientId: string | Patient;
  doctorId: string | Doctor;
  vitals?: {
    bp?: string;
    pulse?: number;
    tempC?: number;
    spo2?: number;
    weightKg?: number;
    heightCm?: number;
  };
  complaints?: string;
  diagnosis: string[];
  notes?: string;
  followUpOn?: string;
  prescription?: { items: RxItem[]; advice?: string };
  status: "draft" | "signed";
  signedAt?: string;
  vitalsRecordedByName?: string;
  vitalsRecordedByRole?: string;
  vitalsRecordedAt?: string;
  createdAt?: string;
}

export interface Triage {
  vitals: {
    bp?: string;
    pulse?: number;
    tempC?: number;
    spo2?: number;
    weightKg?: number;
    heightCm?: number;
  };
  complaints: string;
  recordedBy: { name: string; role: string } | null;
  recordedAt: string | null;
  consultationStatus: "draft" | "signed" | null;
}

export interface Medicine {
  _id: string;
  medicineId: string;
  name: string;
  genericName?: string;
  brandName?: string;
  manufacturer?: string;
  category?: string;
  dosageForm: string;
  strength?: string;
  activeIngredients: { name: string; strength?: string }[];
  packSize: number;
  unit: string;
  prescriptionRequired: boolean;
  scheduleCategory?: string;
  storageInstructions?: string;
  warnings: string[];
  mrp: number;
  sellingPrice: number;
  gstRate: number;
  hsnCode?: string;
  barcode?: string;
  sku?: string;
  reorderLevel: number;
  trackInventory: boolean;
  stockQty: number;
  expiryDate?: string | null;
  description?: string;
  isActive: boolean;
  /** Supplier (populated by the API); send the id string when saving. */
  vendor?:
    | { _id: string; vendorId: string; businessName: string; phone?: string }
    | string
    | null;
  createdAt?: string;
}

export interface Vendor {
  _id: string;
  vendorId: string;
  vendorType: string;
  businessName: string;
  contactPerson?: {
    name?: string;
    designation?: string;
    phone?: string;
    email?: string;
  };
  phone: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  gstin?: string;
  drugLicenseNumber?: string;
  paymentTerms: string;
  alternatePhone?: string;
  drugLicenseExpiry?: string | null;
  creditLimit?: number;
  openingBalance?: number;
  bankDetails?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  notes?: string;
  status: "active" | "inactive" | "blocked";
  /** Supply figures computed from the medicines linked to this vendor (list endpoint only). */
  supply?: { medicines: number; units: number; value: number; low: number };
}
