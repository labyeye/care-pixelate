import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { creditsAPI } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export interface CreditBalance {
  metered: boolean;
  balance?: number;
  bonus?: number;
  bonusExpiresAt?: string | null;
  total?: number;
  low?: boolean;
  zero?: boolean;
  dailyCap?: number;
  ratePerMessage?: number;
  rates?: { message: number; birthday: number };
}

interface CreditsContextType {
  credits: CreditBalance | null;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextType>({
  credits: null,
  refresh: async () => {},
});

// Only the people who run the clinic (owner / hospital admin) see or fetch the wallet.
const CAN_SEE = ["tenant_owner", "hospital_admin"];

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const enabled = !!user?.tenantId && CAN_SEE.includes(user.role);

  const refresh = useCallback(async () => {
    if (!enabled) return setCredits(null);
    try {
      setCredits(await creditsAPI.balance());
    } catch {
      // header just stays without the pill; nothing else depends on it
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  return (
    <CreditsContext.Provider value={{ credits, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

export const useCredits = () => useContext(CreditsContext);

/** 3203 -> "3,203", 0.4 -> "0.4" */
export const fmtCredits = (n = 0) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
