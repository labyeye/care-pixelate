const PaymentReturnPage = lazy(() => import("./pages/PaymentReturnPage"));
import { useUsageTracker } from "@/hooks/useUsageTracker";
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { isStaffPath, pagesForPath } from "@/config/navigation";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const ConsultationPage = lazy(() => import("@/pages/ConsultationPage"));
const ConsultationsPage = lazy(() => import("@/pages/ConsultationsPage"));
const FollowUpsPage = lazy(() => import("@/pages/FollowUpsPage"));
const QueuePage = lazy(() => import("@/pages/QueuePage"));
const InvoicesPage = lazy(() => import("@/pages/InvoicesPage"));
const LabOrdersPage = lazy(() => import("@/pages/LabOrdersPage"));
const MedicinesPage = lazy(() => import("@/pages/MedicinesPage"));
const PasswordResetPage = lazy(() => import("@/pages/PasswordResetPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage"));
const LocationsPage = lazy(() => import("@/pages/LocationsPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const StaffPage = lazy(() => import("@/pages/StaffPage"));
const VendorsPage = lazy(() => import("@/pages/VendorsPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const AppointmentsPage = lazy(() => import("@/pages/AppointmentsPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DoctorsPage = lazy(() => import("@/pages/DoctorsPage"));
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const PatientsPage = lazy(() => import("@/pages/PatientsPage"));
import RegisterTenantPage from "@/pages/RegisterTenantPage";
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PatientRegisterPage = lazy(() => import("@/pages/PatientRegisterPage"));
const MyAppointmentsPage = lazy(() => import("@/pages/portal/MyAppointmentsPage"));
const MyDocumentsPage = lazy(() => import("@/pages/portal/MyDocumentsPage"));
const MyInvoicesPage = lazy(() =>
  import("@/pages/portal/MyMedicalPages").then((m) => ({ default: m.MyInvoicesPage })),
);
const MyLabReportsPage = lazy(() =>
  import("@/pages/portal/MyMedicalPages").then((m) => ({ default: m.MyLabReportsPage })),
);
const MyPrescriptionsPage = lazy(() =>
  import("@/pages/portal/MyMedicalPages").then((m) => ({ default: m.MyPrescriptionsPage })),
);
const MyProfilePage = lazy(() => import("@/pages/portal/MyProfilePage"));
const MyVitalsPage = lazy(() => import("@/pages/portal/MyVitalsPage"));

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
const needsOnboarding = (
  u: { role: string; tenantId?: string | null } | null,
) => !!u && u.role !== "super_admin" && !u.tenantId;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, pages } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsOnboarding(user)) return <Navigate to="/onboarding" replace />;

  // Patients only get the /my/* portal; clinic staff never see it.
  const isPortal = pathname.startsWith("/my/");
  // /dashboard is shared: patients get their portal home there, so it must not bounce to itself.
  if (
    user?.role === "patient" &&
    pathname !== "/dashboard" &&
    isStaffPath(pathname)
  )
    return <Navigate to="/dashboard" replace />;
  if (isPortal && user?.role !== "patient")
    return <Navigate to="/dashboard" replace />;

  // Role permissions: a direct URL to a page this role may not use bounces to the landing page.
  const needed = pagesForPath(pathname);
  const clinicStaff =
    !!user && user.role !== "super_admin" && user.role !== "patient";
  if (
    clinicStaff &&
    pages &&
    needed &&
    !needed.some((k) => pages.includes(k))
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// Login / register: signed-in users go straight to where they belong.
function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) {
    return (
      <Navigate
        to={needsOnboarding(user) ? "/onboarding" : "/dashboard"}
        replace
      />
    );
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
  useUsageTracker();
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterTenantPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register-patient"
        element={
          <PublicOnlyRoute>
            <PatientRegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route
        path="/payment-return"
        element={
          <ProtectedRoute>
            <PaymentReturnPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/appointments"
        element={
          <ProtectedRoute>
            <MyAppointmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/prescriptions"
        element={
          <ProtectedRoute>
            <MyPrescriptionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/lab-reports"
        element={
          <ProtectedRoute>
            <MyLabReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/invoices"
        element={
          <ProtectedRoute>
            <MyInvoicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/documents"
        element={
          <ProtectedRoute>
            <MyDocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/vitals"
        element={
          <ProtectedRoute>
            <MyVitalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my/profile"
        element={
          <ProtectedRoute>
            <MyProfilePage />
          </ProtectedRoute>
        }
      />
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
        path="/queue"
        element={
          <ProtectedRoute>
            <QueuePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/follow-ups"
        element={
          <ProtectedRoute>
            <FollowUpsPage />
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
      </Suspense>
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
