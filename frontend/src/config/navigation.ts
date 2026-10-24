import type { LucideIcon } from "lucide-react";
import {
  Activity,
  UserRound,
  BarChart3,
  FileBarChart,
  Building2,
  MapPin,
  ShieldCheck,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  FlaskConical,
  Pill,
  Truck,
  KeyRound,
  Receipt,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Stethoscope,
  Users,
  Wallet,
  ClipboardPlus,
  Repeat,
  ListOrdered,
} from "lucide-react";
import type { UserRole } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { label: "Tenants", href: "/tenants", icon: Building2 },
      { label: "Platform Settings", href: "/settings", icon: Settings },
      { label: "Billing Overview", href: "/billing", icon: Wallet },
    ],
  },
];

// Same categorised layout as NestHR / NestLeads / NestSports: a few short, labelled groups
// instead of one long "Workspace" list.
const TENANT_ADMIN_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Clinical",
    items: [
      { label: "Patients", href: "/patients", icon: Users },
      { label: "Doctors", href: "/doctors", icon: Stethoscope },
      { label: "Queue", href: "/queue", icon: ListOrdered },
      { label: "Appointments", href: "/appointments", icon: CalendarDays },
      { label: "Calendar", href: "/calendar", icon: CalendarRange },
      { label: "Consultations", href: "/consultations", icon: ClipboardPlus },
      { label: "Follow-ups", href: "/follow-ups", icon: Repeat },
      { label: "Lab Orders", href: "/lab-orders", icon: FlaskConical },
      { label: "Medicines", href: "/medicines", icon: Pill },
      { label: "Vendors", href: "/vendors", icon: Truck },
    ],
  },
  {
    label: "Billing & Finance",
    items: [
      { label: "Invoices", href: "/invoices", icon: Receipt },
      { label: "Billing", href: "/billing", icon: Wallet },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Reports", href: "/reports", icon: FileBarChart },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Staff", href: "/staff", icon: ClipboardList },
      { label: "Password Reset", href: "/password-reset", icon: KeyRound },
      { label: "Locations", href: "/locations", icon: MapPin },
      { label: "Audit Log", href: "/audit-log", icon: ShieldCheck },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const DOCTOR_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Today's Patients", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "My Work",
    items: [
      { label: "Queue", href: "/queue", icon: ListOrdered },
      { label: "Appointments", href: "/appointments", icon: CalendarDays },
      { label: "Calendar", href: "/calendar", icon: CalendarRange },
      { label: "Consultations", href: "/consultations", icon: ClipboardPlus },
      { label: "Follow-ups", href: "/follow-ups", icon: Repeat },
      { label: "Patients", href: "/patients", icon: Users },
      { label: "Lab Orders", href: "/lab-orders", icon: FlaskConical },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: "/reports", icon: FileBarChart },
      { label: "Messages", href: "/messages", icon: MessageSquare },
    ],
  },
];

// Patient portal: every /my/* page is backed by the account-scoped /api/me endpoints.
const PATIENT_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "My Health", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Care",
    items: [
      { label: "Appointments", href: "/my/appointments", icon: CalendarDays },
      { label: "Prescriptions", href: "/my/prescriptions", icon: Pill },
      { label: "Lab Reports", href: "/my/lab-reports", icon: FlaskConical },
      { label: "Health Tracker", href: "/my/vitals", icon: Activity },
    ],
  },
  {
    label: "Records & Billing",
    items: [
      { label: "Invoices", href: "/my/invoices", icon: Receipt },
      { label: "Documents", href: "/my/documents", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile & Family", href: "/my/profile", icon: UserRound },
    ],
  },
];

// A solo practitioner has no branches, so Locations is noise. Staff stays: they still
// run a front desk / compounder / nurse under their own login.
const SOLO_HIDDEN = new Set(["/locations"]);

// Menu entry -> permission key (utils/permissions.js on the server uses the same keys).
const HREF_PAGE: Record<string, string> = {
  "/dashboard": "dashboard",
  "/patients": "patients",
  "/doctors": "doctors",
  "/queue": "appointments",
  "/appointments": "appointments",
  "/calendar": "calendar",
  "/follow-ups": "appointments",
  "/consultations": "consultations",
  "/invoices": "invoices",
  "/lab-orders": "lab-orders",
  "/medicines": "medicines",
  "/vendors": "medicines",
  "/analytics": "analytics",
  "/reports": "reports",
  "/locations": "locations",
  "/audit-log": "audit-log",
  "/staff": "staff",
  "/password-reset": "password-reset",
  "/billing": "billing",
  "/settings": "settings",
};

/** Which permission page(s) a URL belongs to, so a route can be guarded the same way the menu is. */
/** True for the clinic-staff pages (anything with a permission key) — patients are never allowed on these. */
export const isStaffPath = (pathname: string) =>
  pagesForPath(pathname) !== null;

export function pagesForPath(pathname: string): string[] | null {
  const seg = "/" + pathname.split("/")[1];
  if (seg === "/consultation")
    return ["consultations", "appointments", "calendar"]; // a single consultation, opened from the list or an appointment
  const key = HREF_PAGE[seg];
  return key ? [key] : null;
}

export function getNavGroupsForRole(
  role: UserRole,
  orgType?: string,
  pages?: string[] | null,
): NavGroup[] {
  // Clinic staff: one shared menu, filtered by what the owner granted to this role.
  const staffRole = role !== "super_admin" && role !== "patient";
  let groups = navForRole(role);
  if (staffRole && pages) {
    // Keep the categories; just drop entries the owner didn't grant and any group left empty.
    groups = TENANT_ADMIN_NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        const key = HREF_PAGE[i.href];
        return !key || pages.includes(key);
      }),
    })).filter((g) => g.items.length > 0);
  }
  if (orgType !== "individual_doctor") return groups;
  return groups.map((g) => ({
    ...g,
    items: g.items.filter((i) => !SOLO_HIDDEN.has(i.href)),
  }));
}

function navForRole(role: UserRole): NavGroup[] {
  switch (role) {
    case "super_admin":
      return SUPER_ADMIN_NAV;
    case "tenant_owner":
    case "hospital_admin":
      return TENANT_ADMIN_NAV;
    case "doctor":
    case "nurse":
    case "receptionist":
    case "pharmacist":
    case "lab_technician":
    case "billing_executive":
    case "staff":
      return DOCTOR_NAV;
    case "patient":
      return PATIENT_NAV;
    default:
      return TENANT_ADMIN_NAV;
  }
}
