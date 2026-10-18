import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authAPI, ApiError } from "@/services/api";
import type { Tenant, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  tenant: Tenant | null;
  permissions: string[];
  /** Pages this user's role may open (null until /auth/me has answered). */
  pages: string[] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Returns a pendingToken when the account needs a 2FA code. */
  login: (
    email: string,
    password: string,
  ) => Promise<{ pendingToken?: string }>;
  /** Re-reads the session after a login that happened outside `login` (2FA / OTP). */
  refreshSession: () => Promise<void>;
  register: (payload: Parameters<typeof authAPI.register>[0]) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Coarse role -> permission mapping. A granular permission matrix is out of
// scope for this pass; this just gates nav/UI affordances.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["manage_tenants", "manage_platform"],
  tenant_owner: ["manage_org", "manage_staff", "manage_billing"],
  hospital_admin: ["manage_staff"],
  doctor: ["view_patients", "manage_appointments"],
  nurse: ["view_patients"],
  receptionist: ["manage_appointments"],
  pharmacist: [],
  lab_technician: [],
  billing_executive: ["manage_billing"],
  patient: ["view_own_records"],
  staff: [],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [pages, setPages] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const data = await authAPI.getMe();
      setUser(data.user);
      setTenant(data.tenant);
      setPages(data.pages ?? null);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // swallow non-API errors (e.g. network) — treat as logged out
      }
      setUser(null);
      setTenant(null);
      setPages(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authAPI.login({ email, password });
      if (res.requires2FA) return { pendingToken: res.pendingToken };
      await loadMe();
      return {};
    },
    [loadMe],
  );

  const register = useCallback(
    async (payload: Parameters<typeof authAPI.register>[0]) => {
      await authAPI.register(payload);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } finally {
      setUser(null);
      setTenant(null);
    }
  }, []);

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const permissions = useMemo(
    () => (user ? ROLE_PERMISSIONS[user.role] || [] : []),
    [user],
  );

  const value: AuthContextValue = {
    user,
    tenant,
    permissions,
    pages,
    isAuthenticated: !!user,
    isLoading,
    login,
    refreshSession: loadMe,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
