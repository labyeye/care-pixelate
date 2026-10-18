import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { authAPI, setToken, removeToken } from '../services/api';
import storage from '../utils/storage';

interface RegisterPayload {
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

interface PatientRegisterPayload {
  clinicCode: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  password: string;
  acceptTerms: boolean;
}

interface AuthContextType {
  user: any | null;
  tenant: any | null;
  /** Page keys this role may open (clinic staff); null until loaded. */
  pages: string[] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  registerPatient: (payload: PatientRegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tenant: null,
  pages: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  registerPatient: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [tenant, setTenant] = useState<any | null>(null);
  const [pages, setPages] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await storage.getItem('token');
        if (token) {
          const res = await authAPI.getMe();
          setUser(res.data.user);
          setTenant(res.data.tenant);
          setPages((res.data as any).pages ?? null);
        }
      } catch {
        await removeToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authAPI.login(email, password);
    const token = res.data?.token;
    if (!token) {
      throw new Error('Login failed: no token received from server');
    }
    await setToken(token);
    await storage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    setTenant(res.data.tenant ?? null);
    authAPI
      .getMe()
      .then(m => setPages((m.data as any).pages ?? null))
      .catch(() => {});
  };

  const register = async (payload: RegisterPayload) => {
    const res = await authAPI.registerTenant(payload);
    const token = res.data?.token;
    if (!token) {
      throw new Error('Registration failed: no token received from server');
    }
    await setToken(token);
    await storage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    setTenant(res.data.tenant ?? null);
  };

  const registerPatient = async (payload: PatientRegisterPayload) => {
    const res = await authAPI.registerPatient(payload);
    const token = res.data?.token;
    if (!token) {
      throw new Error('Registration failed: no token received from server');
    }
    await setToken(token);
    await storage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    setTenant(res.data.tenant ?? null);
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* best-effort — clear local session regardless */
    }
    await removeToken();
    setUser(null);
    setTenant(null);
    setPages(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        pages,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        registerPatient,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
