import { useEffect, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

export type FilterDef =
  | {
      kind: "select";
      key: string;
      label: string;
      value: string;
      onChange: (v: string) => void;
      options: FilterOption[];
    }
  | {
      kind: "date";
      key: string;
      label: string;
      value: string;
      onChange: (v: string) => void;
    };

/** Debounces a fast-changing value (search box) before it hits a query key. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Case-insensitive "does any of these fields contain the query" used by client-side search. */
export const matches = (
  q: string,
  ...fields: (string | number | undefined | null)[]
) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) =>
    String(f ?? "")
      .toLowerCase()
      .includes(needle),
  );
};

const field =
  "border-2 border-black bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#024BAB]";

/** Search + filter row, styled like the NestHR list toolbars. */
export function FilterBar({
  search,
  onSearch,
  placeholder = "Search…",
  filters = [],
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  filters?: FilterDef[];
}) {
  const active =
    (search.trim() ? 1 : 0) +
    filters.filter((f) => f.value && f.value !== "all").length;

  const clear = () => {
    onSearch("");
    filters.forEach((f) => f.onChange(f.kind === "select" ? "all" : ""));
  };

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className={cn(field, "w-full py-2.5 pl-9 pr-3")}
        />
      </div>

      {filters.map((f) =>
        f.kind === "select" ? (
          <label key={f.key} className="relative block">
            <span className="sr-only">{f.label}</span>
            <select
              aria-label={f.label}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={cn(
                field,
                "appearance-none py-2.5 pl-3 pr-8 capitalize",
                f.value !== "all" &&
                  f.value !== "" &&
                  "border-[#024BAB] bg-[#F0F6FF]",
              )}
            >
              <option value="all">{f.label}: All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" />
          </label>
        ) : (
          <label
            key={f.key}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            {f.label}
            <input
              type="date"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={cn(field, "px-3 py-2 normal-case text-black")}
            />
          </label>
        ),
      )}

      {active > 0 && (
        <button
          onClick={clear}
          className="flex items-center gap-1 border-2 border-black bg-white px-3 py-2.5 text-sm font-semibold hover:bg-gray-50"
        >
          <X className="h-4 w-4" /> Clear ({active})
        </button>
      )}
    </div>
  );
}
