import PaymentReturnPage from "./pages/PaymentReturnPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isStaffPath, pagesForPath } from "@/config/navigation";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import CalendarPage from "@/pages/CalendarPage";
import ConsultationPage from "@/pages/ConsultationPage";
import ConsultationsPage from "@/pages/ConsultationsPage";
import InvoicesPage from "@/pages/InvoicesPage";
import LabOrdersPage from "@/pages/LabOrdersPage";
import MedicinesPage from "@/pages/MedicinesPage";
import PasswordResetPage from "@/pages/PasswordResetPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import AuditLogPage from "@/pages/AuditLogPage";
import LocationsPage from "@/pages/LocationsPage";
import ReportsPage from "@/pages/ReportsPage";
import StaffPage from "@/pages/StaffPage";
import VendorsPage from "@/pages/VendorsPage";
import BillingPage from "@/pages/BillingPage";
import AppointmentsPage from "@/pages/AppointmentsPage";
import DashboardPage from "@/pages/DashboardPage";
import DoctorsPage from "@/pages/DoctorsPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import OnboardingPage from "@/pages/OnboardingPage";
import PatientsPage from "@/pages/PatientsPage";
import RegisterTenantPage from "@/pages/RegisterTenantPage";
import SettingsPage from "@/pages/SettingsPage";
import PatientRegisterPage from "@/pages/PatientRegisterPage";
import MyAppointmentsPage from "@/pages/portal/MyAppointmentsPage";
import MyDocumentsPage from "@/pages/portal/MyDocumentsPage";
import { MyInvoicesPage, MyLabReportsPage, MyPrescriptionsPage } from "@/pages/portal/MyMedicalPages";
import MyProfilePage from "@/pages/portal/MyProfilePage";
import MyVitalsPage from "@/pages/portal/MyVitalsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <p className="font-display font-bold text-muted-foreground">Loading...</p>
  </div>
);

// An owner who registered but hasn't created an organisation yet.
const needsOnboarding = (u: { role: string; tenantId?: string | null } | null) =>
  !!u && u.role !== "super_admin" && !u.tenantId;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, pages } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsOnboarding(user)) return <Navigate to="/onboarding" replace />;

  // Patients only get the /my/* portal; clinic staff never see it.
  const isPortal = pathname.startsWith("/my/");
  // /dashboard is shared: patients get their portal home there, so it must not bounce to itself.
  if (user?.role === "patient" && pathname !== "/dashboard" && isStaffPath(pathname)) return <Navigate to="/dashboard" replace />;
  if (isPortal && user?.role !== "patient") return <Navigate to="/dashboard" replace />;

  // Role permissions: a direct URL to a page this role may not use bounces to the landing page.
  const needed = pagesForPath(pathname);
  const clinicStaff = !!user && user.role !== "super_admin" && user.role !== "patient";
  if (clinicStaff && pages && needed && !needed.some((k) => pages.includes(k))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// Login / register: signed-in users go straight to where they belong.
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) {
    return <Navigate to={needsOnboarding(user) ? "/onboarding" : "/dashboard"} replace />;
  }

  return <>{children}</>;
}

function OnboardingRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <OnboardingPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterTenantPage /></PublicOnlyRoute>} />
      <Route path="/register-patient" element={<PublicOnlyRoute><PatientRegisterPage /></PublicOnlyRoute>} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route path="/payment-return" element={<ProtectedRoute><PaymentReturnPage /></ProtectedRoute>} />
      <Route path="/my/appointments" element={<ProtectedRoute><MyAppointmentsPage /></ProtectedRoute>} />
      <Route path="/my/prescriptions" element={<ProtectedRoute><MyPrescriptionsPage /></ProtectedRoute>} />
      <Route path="/my/lab-reports" element={<ProtectedRoute><MyLabReportsPage /></ProtectedRoute>} />
      <Route path="/my/invoices" element={<ProtectedRoute><MyInvoicesPage /></ProtectedRoute>} />
      <Route path="/my/documents" element={<ProtectedRoute><MyDocumentsPage /></ProtectedRoute>} />
      <Route path="/my/vitals" element={<ProtectedRoute><MyVitalsPage /></ProtectedRoute>} />
      <Route path="/my/profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients"
        element={
          <ProtectedRoute>
            <PatientsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctors"
        element={
          <ProtectedRoute>
            <DoctorsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute>
            <AppointmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consultations"
        element={
          <ProtectedRoute>
            <ConsultationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consultation/:appointmentId"
        element={
          <ProtectedRoute>
            <ConsultationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <InvoicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lab-orders"
        element={
          <ProtectedRoute>
            <LabOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/medicines"
        element={
          <ProtectedRoute>
            <MedicinesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/password-reset"
        element={
          <ProtectedRoute>
            <PasswordResetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendors"
        element={
          <ProtectedRoute>
            <VendorsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <AnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute>
            <AuditLogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/locations"
        element={
          <ProtectedRoute>
            <LocationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <StaffPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <BillingPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
