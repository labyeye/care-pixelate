import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  FlaskConical,
  IndianRupee,
  Printer,
  Boxes,
  CalendarClock,
  ClipboardList,
  Layers,
  Pill,
  Receipt,
  Search,
  ShieldCheck,
  Stethoscope,
  Tags,
  Truck,
  Users,
  Wallet,
  X,
  PackageMinus,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/ui/badge";
import { AnalyticsPanel } from "@/pages/AnalyticsPage";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, reportsAPI, type ReportFilter } from "@/services/api";
import { printReport } from "@/lib/reportPrint";
import { cn } from "@/lib/utils";
import logoLong from "@/assets/logos/logo-long.png";

type Category =
  "clinical" | "financial" | "diagnostics" | "inventory" | "vendors";

const CATEGORY_META: Record<
  Category,
  { label: string; color: string; tag: string }
> = {
  clinical: {
    label: "Clinical",
    color: "#024BAB",
    tag: "bg-[#024BAB] text-white",
  },
  financial: {
    label: "Financial",
    color: "#00C48C",
    tag: "bg-[#00C48C] text-white",
  },
  diagnostics: {
    label: "Diagnostics",
    color: "#FA731C",
    tag: "bg-[#FA731C] text-white",
  },
  inventory: {
    label: "Medicines & inventory",
    color: "#A855F7",
    tag: "bg-[#A855F7] text-white",
  },
  vendors: {
    label: "Vendors",
    color: "#EF4444",
    tag: "bg-[#EF4444] text-white",
  },
};
const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

const ICONS: Record<string, typeof FileText> = {
  appointments: CalendarDays,
  patients: Users,
  doctors: Stethoscope,
  revenue: IndianRupee,
  outstanding: Wallet,
  lab: FlaskConical,
  "stock-on-hand": Boxes,
  "reorder-list": PackageMinus,
  "expiry-tracker": CalendarClock,
  "category-summary": Layers,
  "price-list": Tags,
  "schedule-summary": ShieldCheck,
  "vendor-directory": ClipboardList,
  "vendor-supply": Truck,
  "vendor-medicines": Pill,
  "vendor-licences": ShieldCheck,
  "vendor-balances": Receipt,
};

// Optional per-report status filter.
const STATUS_OPTIONS: Record<string, string[]> = {
  appointments: ["scheduled", "completed", "cancelled", "no_show"],
  revenue: ["unpaid", "partial", "paid", "void"],
  lab: ["ordered", "collected", "resulted", "cancelled"],
};

const legacyFilters = (id: string): ReportFilter[] =>
  STATUS_OPTIONS[id]
    ? [
        {
          key: "status",
          label: "Status",
          allLabel: "All statuses",
          options: STATUS_OPTIONS[id].map((s) => ({ value: s, label: s })),
        },
      ]
    : [];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (v: string | number | undefined, numeric?: boolean) => {
  if (v === undefined || v === null || v === "") return "";
  return numeric && typeof v === "number"
    ? v.toLocaleString("en-IN")
    : String(v);
};

function CategoryTag({ cat }: { cat: Category }) {
  return (
    <span
      className={cn(
        "border border-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        CATEGORY_META[cat].tag,
      )}
    >
      {CATEGORY_META[cat].label}
    </span>
  );
}

function NbSelect({
  value,
  onChange,
  children,
  className,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none border-2 border-black bg-white px-3 py-2 pr-8 text-sm font-medium capitalize focus:outline-none focus:ring-2 focus:ring-[#024BAB]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" />
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-3 border-2 bg-white p-12">
      <AlertCircle className="h-10 w-10 text-black/20" />
      <p className="font-semibold text-black">{msg}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex justify-center py-16">
      <img src={logoLong} alt="Loading" className="h-12 w-auto animate-pulse" />
    </div>
  );
}

function ReportTable({
  columns,
  rows,
  totals,
}: {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number>;
}) {
  const isName = (k: string, l: string) =>
    ["patient", "doctor", "name"].includes(k) ||
    ["patient", "doctor", "name"].includes(l.toLowerCase());
  const isStatus = (k: string) => ["status", "payment", "state"].includes(k);

  const cell = (
    c: { key: string; label: string; numeric?: boolean },
    v: string | number | undefined,
    row?: Record<string, string | number>,
  ) => {
    const s = fmt(v, c.numeric);
    if (isName(c.key, c.label) && s && s !== "Unknown") {
      return (
        <span className="flex items-center gap-2">
          <Avatar
            kind={c.key === "doctor" ? "doctor" : "patient"}
            id={
              String(
                (c.key === "doctor" ? row?.doctorRef : row?.patientRef) ?? "",
              ) || undefined
            }
            name={s}
          />
          <span>{s}</span>
        </span>
      );
    }
    if (isStatus(c.key) && s) return <StatusBadge status={s} />;
    return s;
  };

  return (
    <div className="overflow-hidden border-2 bg-white">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black bg-[#024BAB]/5">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-black",
                    c.numeric ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-black/10",
                  i % 2 !== 0 && "bg-[#F8FAFF]",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-sm text-black",
                      c.numeric && "text-right",
                    )}
                  >
                    {cell(c, r[c.key], r)}
                  </td>
                ))}
              </tr>
            ))}
            {totals && (
              <tr className="border-t-2 border-black bg-[#024BAB]/5 font-bold">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-sm text-black",
                      c.numeric && "text-right",
                    )}
                  >
                    {fmt(totals[c.key], c.numeric)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportGen({
  id,
  title,
  category,
  dateRange,
  filters,
}: {
  id: string;
  title: string;
  category: Category;
  dateRange: boolean;
  filters: ReportFilter[];
}) {
  const { tenant } = useAuth();
  const today = new Date();
  const [from, setFrom] = useState(
    iso(new Date(today.getTime() - 29 * 86_400_000)),
  );
  const [to, setTo] = useState(iso(today));
  const [values, setValues] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);

  const params = {
    from: dateRange ? from : undefined,
    to: dateRange ? to : undefined,
    ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
  };
  const q = useQuery({
    queryKey: ["report", id, params],
    queryFn: () => reportsAPI.run(id, params),
  });
  const data = q.data;

  const period = dateRange
    ? `${new Date(from).toLocaleDateString("en-IN")} – ${new Date(to).toLocaleDateString("en-IN")}`
    : "As of today";

  const tableRows = () =>
    data
      ? [...data.rows, ...(data.totals ? [data.totals] : [])].map((r) =>
          data.columns.map((c) => fmt(r[c.key], c.numeric)),
        )
      : [];

  const print = () => {
    if (!data) return;
    const ok = printReport({
      title,
      period,
      orgName: tenant?.branding?.appName || tenant?.name || "NestDoc",
      category: CATEGORY_META[category].label,
      headers: data.columns.map((c) => c.label),
      rows: tableRows(),
      numericCols: new Set(
        data.columns.map((c, i) => (c.numeric ? i : -1)).filter((i) => i >= 0),
      ),
    });
    if (!ok) toast.error("Allow pop-ups to print this report");
  };

  const download = async () => {
    setDownloading(true);
    try {
      await reportsAPI.download(id, params);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {dateRange && (
          <>
            <input
              aria-label="From date"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="border-2 border-black bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#024BAB]"
            />
            <span className="text-sm font-semibold">to</span>
            <input
              aria-label="To date"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="border-2 border-black bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#024BAB]"
            />
          </>
        )}
        {filters.map((f) => (
          <NbSelect
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
            className="w-48"
          >
            <option value="">
              {f.allLabel ?? `All ${f.label.toLowerCase()}`}
            </option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label.replace("_", " ")}
              </option>
            ))}
          </NbSelect>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            onClick={print}
            disabled={!data}
            className="flex items-center gap-2 border-2 border-black bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            onClick={download}
            disabled={!data || downloading}
            className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />{" "}
            {downloading ? "Preparing…" : "CSV"}
          </button>
        </div>
      </div>

      {data?.truncated && (
        <p className="text-xs font-bold text-amber-700">
          Showing the first 5,000 rows. Narrow the date range for the full set.
        </p>
      )}

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !data ? (
        <EmptyState
          msg={
            q.error instanceof ApiError
              ? q.error.message
              : "Could not load this report"
          }
        />
      ) : data.rows.length === 0 ? (
        <EmptyState msg="No data for this selection" />
      ) : (
        <ReportTable
          columns={data.columns}
          rows={data.rows}
          totals={data.totals}
        />
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<Category | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<"catalog" | "analytics">("catalog");

  const list = useQuery({
    queryKey: ["report-list"],
    queryFn: reportsAPI.list,
  });
  const reports = (list.data ?? []).map((r) => ({
    ...r,
    category: (CATEGORIES.includes(r.category as Category)
      ? r.category
      : "clinical") as Category,
    Icon: ICONS[r.id] ?? FileText,
  }));

  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    return (
      (filterCat === "all" || r.category === filterCat) &&
      (r.title.toLowerCase().includes(q) ||
        (r.desc ?? "").toLowerCase().includes(q))
    );
  });
  const active = reports.find((r) => r.id === activeId);
  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [c, reports.filter((r) => r.category === c).length]),
  ) as Record<Category, number>;

  return (
    <AppLayout title="Reports">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-black">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate, filter, and export clinic, medicine-inventory and vendor
            reports
          </p>
        </div>
        <div className="flex shrink-0 gap-0 border-2 border-black">
          {(["catalog", "analytics"] as const).map((m, i) => (
            <button
              key={m}
              onClick={() => setPageMode(m)}
              className={cn(
                "px-4 py-2 text-sm font-semibold transition-all",
                i === 0 && "border-r-2 border-black",
                pageMode === m
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-50",
              )}
            >
              {m === "catalog" ? "All Reports" : "Analytics"}
            </button>
          ))}
        </div>
      </div>

      {pageMode === "analytics" && <AnalyticsPanel />}

      {pageMode === "catalog" && (
        <>
          {active && (
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => setActiveId(null)}
                  className="flex items-center gap-2 border-2 border-black bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                >
                  <ArrowLeft className="h-4 w-4" /> All Reports
                </button>
                <div className="flex items-center gap-2">
                  <CategoryTag cat={active.category} />
                  <h2 className="text-xl font-semibold text-black">
                    {active.title}
                  </h2>
                </div>
                <button
                  onClick={() => setActiveId(null)}
                  aria-label="Close report"
                  className="ml-auto border-2 border-black bg-white p-1.5 hover:bg-gray-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="border-2 bg-white p-5">
                <ReportGen
                  key={active.id}
                  id={active.id}
                  title={active.title}
                  category={active.category}
                  dateRange={active.dateRange}
                  filters={
                    active.filters?.length
                      ? active.filters
                      : legacyFilters(active.id)
                  }
                />
              </div>
            </div>
          )}

          <div className="mb-6 flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                aria-label="Search reports"
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border-2 border-black bg-white py-2.5 pl-9 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#024BAB]"
              />
            </div>
            <div className="flex gap-1 border-2 border-black">
              {(
                [
                  ["all", "All"],
                  ...CATEGORIES.map((c) => [c, CATEGORY_META[c].label]),
                ] as [Category | "all", string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilterCat(id)}
                  className={cn(
                    "border-r-2 border-black px-4 py-2 text-sm font-semibold transition-all last:border-r-0",
                    filterCat === id
                      ? "bg-black text-white"
                      : "bg-white text-black hover:bg-gray-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            {CATEGORIES.map((c) => (
              <div
                key={c}
                className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5"
              >
                <span
                  className="h-2.5 w-2.5"
                  style={{ backgroundColor: CATEGORY_META[c].color }}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-black">
                  {CATEGORY_META[c].label}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {counts[c]} reports
                </span>
              </div>
            ))}
          </div>

          {list.isLoading && <LoadingState />}
          {list.isError && (
            <EmptyState msg="You don't have access to reports" />
          )}

          {CATEGORIES.map((cat) => {
            const items = filtered.filter((r) => r.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="mb-8">
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="h-5 w-1 border border-black"
                    style={{ backgroundColor: CATEGORY_META[cat].color }}
                  />
                  <h2 className="text-base font-semibold uppercase tracking-wider text-black">
                    {CATEGORY_META[cat].label} ({items.length})
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {items.map((r) => {
                    const isActive = activeId === r.id;
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "flex flex-col gap-3 border-2 bg-white p-4 transition-all",
                          isActive && "border-[#024BAB] bg-[#F0F6FF]",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border-2 border-black bg-[#024BAB]">
                            <r.Icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1">
                              <CategoryTag cat={r.category} />
                            </div>
                            <p className="text-sm font-semibold leading-tight text-black">
                              {r.title}
                            </p>
                          </div>
                        </div>
                        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                          {r.desc}
                        </p>
                        <button
                          onClick={() => setActiveId(isActive ? null : r.id)}
                          className={cn(
                            "w-full border-2 border-black py-2 text-sm font-semibold transition-all",
                            isActive
                              ? "bg-black text-white"
                              : "bg-white text-black hover:bg-[#024BAB] hover:text-white",
                          )}
                        >
                          {isActive ? "Close Report" : "Generate"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!list.isLoading && !list.isError && filtered.length === 0 && (
            <EmptyState msg={`No reports found matching "${search}"`} />
          )}
        </>
      )}
    </AppLayout>
  );
}
