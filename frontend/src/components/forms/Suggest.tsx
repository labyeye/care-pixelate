import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/forms/WizardModal";

type Search = (q: string) => Promise<string[]>;

/** Filters `presets` locally and (optionally) merges async internet results. */
function useOptions(query: string, presets: string[], search?: Search, exclude: string[] = []) {
  const [remote, setRemote] = useState<string[]>([]);

  useEffect(() => {
    if (!search || query.trim().length < 3) {
      setRemote([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      search(query.trim()).then((r) => live && setRemote(r)).catch(() => live && setRemote([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, search]);

  const q = query.trim().toLowerCase();
  const taken = new Set(exclude.map((x) => x.toLowerCase()));
  // starts-with matches first, then word-start, then anywhere (so "pen" ranks Penicillin above "Aspirin pen")
  const rank = (p: string) => { const l = p.toLowerCase(); return l.startsWith(q) ? 0 : l.includes(" " + q) ? 1 : 2; };
  const local = presets.filter((p) => !q || p.toLowerCase().includes(q)).sort((a, b) => (q ? rank(a) - rank(b) : 0));
  const seen = new Set<string>();
  return [...local, ...remote]
    .filter((o) => {
      const k = o.toLowerCase();
      if (taken.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12);
}

function Dropdown({ options, onPick, active = -1 }: { options: string[]; onPick: (o: string) => void; active?: number }) {
  if (!options.length) return null;
  return (
    <ul className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto border-2 border-black bg-white">
      {options.map((o, i) => (
        <li key={o}>
          <button
            type="button"
            // mousedown fires before the input's blur, so the pick isn't lost.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(o);
            }}
            className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted", i === active && "bg-muted font-bold")}
          >
            {o}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Single-value text input with a suggestion dropdown (free text still allowed). */
export function Suggest({
  value,
  onChange,
  presets = [],
  search,
  placeholder,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  presets?: string[];
  search?: Search;
  placeholder?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(-1);
  const options = useOptions(value, presets, search);
  const show = focus && options.length > 0 && !(options.length === 1 && options[0].toLowerCase() === value.trim().toLowerCase());
  return (
    <div className="relative">
      <input
        {...rest}
        className={cn(inputCls, className)}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setActive(-1);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = options.length;
            setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            onChange(options[active]);
            setFocus(false);
          } else if (e.key === "Escape") {
            setFocus(false);
          }
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        autoComplete="off"
      />
      {show && <Dropdown options={options} active={active} onPick={(o) => { onChange(o); setFocus(false); }} />}
    </div>
  );
}

/** Multi-value chip input: type + Enter/comma, or pick a suggestion. */
export function TagInput({
  values,
  onChange,
  presets = [],
  search,
  placeholder = "Type and press Enter",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  presets?: string[];
  search?: Search;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const options = useOptions(text, presets, search, values);

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return setText("");
    onChange([...values, v]);
    setText("");
  };

  return (
    <div className="relative">
      <div
        onClick={() => ref.current?.focus()}
        className="flex min-h-[42px] cursor-text flex-wrap items-center gap-1.5 border-2 border-black bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-[#024BAB]/30"
      >
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 border-2 border-black bg-[#F0F6FF] px-2 py-0.5 text-xs font-bold">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(values.filter((x) => x !== v));
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={ref}
          value={text}
          placeholder={values.length ? "" : placeholder}
          onChange={(e) => {
            const v = e.target.value;
            setActive(-1);
            if (v.endsWith(",")) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (!options.length) return;
              e.preventDefault();
              const n = options.length;
              setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(active >= 0 && options[active] ? options[active] : text);
              setActive(-1);
            } else if (e.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false);
            add(text);
          }}
          autoComplete="off"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
      {focus && <Dropdown options={options} active={active} onPick={add} />}
    </div>
  );
}

/**
 * Textarea with suggestions for the phrase being typed. Phrases are separated by a comma or new line;
 * picking a suggestion replaces only the current phrase, so a doctor can build "Fever, Cough, Sore throat".
 */
export function SuggestArea({
  value,
  onChange,
  presets,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  presets: string[];
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(-1);
  const cut = Math.max(value.lastIndexOf(","), value.lastIndexOf("\n"));
  const current = value.slice(cut + 1).trim();
  const done = value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const options = useOptions(current, presets, undefined, done.filter((x) => x.toLowerCase() !== current.toLowerCase()));
  const show = focus && current.length >= 1 && options.length > 0 && !(options.length === 1 && options[0].toLowerCase() === current.toLowerCase());

  const pick = (o: string) => {
    const head = value.slice(0, cut + 1);
    const sep = head && !head.endsWith("\n") ? " " : "";
    onChange(`${head}${sep}${o}, `);
    setActive(-1);
  };

  return (
    <div className="relative">
      <textarea
        rows={rows}
        className={cn(inputCls, className)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setActive(-1);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          const n = options.length;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(options[active]);
          }
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      />
      {show && <Dropdown options={options} active={active} onPick={pick} />}
    </div>
  );
}
