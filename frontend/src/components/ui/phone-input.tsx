import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const COUNTRIES = [
  { code: "91", iso: "in", name: "India" },
  { code: "1", iso: "us", name: "USA / Canada" },
  { code: "44", iso: "gb", name: "United Kingdom" },
  { code: "971", iso: "ae", name: "UAE" },
  { code: "61", iso: "au", name: "Australia" },
  { code: "65", iso: "sg", name: "Singapore" },
  { code: "60", iso: "my", name: "Malaysia" },
  { code: "966", iso: "sa", name: "Saudi Arabia" },
  { code: "977", iso: "np", name: "Nepal" },
  { code: "880", iso: "bd", name: "Bangladesh" },
  { code: "94", iso: "lk", name: "Sri Lanka" },
];

export const DEFAULT_COUNTRY = "91";

// Emoji flags don't render on Windows, so use real flag images.
const Flag = ({ iso, name }: { iso: string; name: string }) => (
  <img
    src={`https://flagcdn.com/w40/${iso}.png`}
    alt={name}
    width={22}
    height={16}
    className="h-4 w-[22px] shrink-0 border border-black/30 object-cover"
  />
);

/**
 * Backend stores the last 10 digits of the number. India (default) emits the
 * bare 10 digits; any other country emits "<dialcode><number>".
 */
export function composePhone(country: string, local: string) {
  return country === DEFAULT_COUNTRY ? local : country + local;
}

/** Inverse of composePhone, for pre-filling an edit form from a stored number. */
export function splitPhone(stored: string | undefined | null): {
  country: string;
  local: string;
} {
  const digits = String(stored ?? "").replace(/\D/g, "");
  if (digits.length <= 10) return { country: DEFAULT_COUNTRY, local: digits };
  const local = digits.slice(-10);
  const dial = digits.slice(0, -10);
  const match = COUNTRIES.find((c) => c.code === dial);
  return { country: match ? match.code : DEFAULT_COUNTRY, local };
}

/** Returns an error message, or "" when the number is valid. */
export function validatePhone(country: string, local: string) {
  if (!local) return "Mobile number is required";
  if (!/^\d+$/.test(local)) return "Digits only";
  if (local.length !== 10) return "Enter a 10-digit mobile number";
  if (country === DEFAULT_COUNTRY && !/^[6-9]/.test(local)) {
    return "Indian mobile numbers start with 6, 7, 8 or 9";
  }
  return "";
}

interface PhoneInputProps {
  id?: string;
  country: string;
  local: string;
  onChange: (country: string, local: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
}

export function PhoneInput({
  id,
  country,
  local,
  onChange,
  onBlur,
  invalid,
  placeholder = "98765 43210",
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          "flex h-10 items-stretch border-2 border-black bg-white",
          invalid && "border-red-500",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex shrink-0 items-center gap-1.5 border-r-2 border-black px-2 text-sm font-bold hover:bg-muted"
        >
          <Flag iso={current.iso} name={current.name} />+{current.code}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={local}
          placeholder={placeholder}
          onChange={(e) =>
            onChange(country, e.target.value.replace(/\D/g, "").slice(0, 10))
          }
          onBlur={onBlur}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none"
        />
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-50 mt-1 max-h-60 w-64 overflow-auto border-2 border-black bg-white"
        >
          {COUNTRIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === country}
                onClick={() => {
                  onChange(c.code, local);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                  c.code === country && "bg-muted font-bold",
                )}
              >
                <Flag iso={c.iso} name={c.name} />
                <span className="flex-1">{c.name}</span>
                <span className="text-muted-foreground">+{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
