import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/ui/StatCard";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, reportsAPI, summaryAPI } from "@/services/api";
import type { LucideIcon } from "lucide-react";

export interface SummaryCard {
  key: string;
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  color?: string;
  sub?: string;
  /** Clicking filters the table below. Omit for informational cards. */
  filterable?: boolean;
}

/** Headline numbers for every list page (true totals, not just the loaded rows). */
export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: summaryAPI.get,
    staleTime: 30_000,
  });
}

const ADMINS = ["super_admin", "tenant_owner", "hospital_admin"];
const CLINICAL_EXPORT = [...ADMINS, "doctor"];
const FINANCIAL_EXPORT = [...ADMINS, "billing_executive"];
const INVENTORY_EXPORT = [...ADMINS, "pharmacist"];

const shimmer = (
  <span className="inline-block h-7 w-12 animate-pulse bg-muted" />
);
export const stat = (n: number | undefined | null) =>
  n === undefined || n === null ? shimmer : n.toLocaleString("en-IN");
export const inr = (n: number | undefined | null) =>
  n === undefined || n === null ? shimmer : `₹${n.toLocaleString("en-IN")}`;

/**
 * Card row + action bar shared by the list pages.
 *  - cards: clickable ones set `active` (the page filters its rows by that key)
 *  - exportType: report id for the CSV button (hidden for roles that can't run it)
 *  - shown / total: "Showing X of Y" hint so a filtered/partial list is never mistaken for everything
 */
export function SummaryBar({
  cards,
  active,
  onPick,
  exportType,
  exportLabel = "Export CSV",
  shown,
  total,
  extra,
}: {
  cards: SummaryCard[];
  active: string;
  onPick: (key: string) => void;
  exportType?:
    | "patients"
    | "doctors"
    | "appointments"
    | "revenue"
    | "lab"
    | "outstanding"
    | "stock-on-hand"
    | "vendor-directory";
  exportLabel?: string;
  shown?: number;
  total?: number;
  extra?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState(false);

  const canExport =
    !!exportType &&
    (["revenue", "outstanding"].includes(exportType)
      ? FINANCIAL_EXPORT
      : ["stock-on-hand", "vendor-directory"].includes(exportType)
        ? INVENTORY_EXPORT
        : CLINICAL_EXPORT
    ).includes(user?.role ?? "");

  const refresh = async () => {
    setSpin(true);
    await qc.invalidateQueries();
    setTimeout(() => setSpin(false), 400);
  };

  const exportCsv = async () => {
    if (!exportType) return;
    setBusy(true);
    try {
      await reportsAPI.download(exportType, {});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 space-y-3 print:hidden">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard
            key={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            color={c.color}
            sub={c.sub}
            active={c.filterable ? active === c.key : false}
            onClick={
              c.filterable
                ? () => onPick(active === c.key ? "all" : c.key)
                : undefined
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {active !== "all" && (
          <button
            onClick={() => onPick("all")}
            className="flex items-center gap-1 border-2 border-black bg-[#024BAB] px-2 py-1 text-xs font-bold text-white"
          >
            {cards.find((c) => c.key === active)?.label ?? active}{" "}
            <X className="h-3 w-3" />
          </button>
        )}
        {shown !== undefined && total !== undefined && (
          <span className="text-xs font-semibold text-muted-foreground">
            Showing {shown.toLocaleString("en-IN")} of{" "}
            {total.toLocaleString("en-IN")}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {extra}
          <button
            onClick={refresh}
            className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 text-sm font-semibold hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} />{" "}
            Refresh
          </button>
          {canExport && (
            <button
              onClick={exportCsv}
              disabled={busy}
              className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Download className="h-4 w-4" />{" "}
              {busy ? "Preparing…" : exportLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
