import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Tweens a number from its previous value to `to` (ease-out), or jumps straight there with reduced motion. */
function useTween(to: number, ms = 800) {
  const [v, setV] = useState(reduced() ? to : 0);
  const from = useRef(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) {
      setV(to);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (to - a) * e;
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

// "₹1,23,456" / "12" / "4.5 h" -> prefix, number, suffix. Anything else is left alone.
const SPLIT = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/;

function Counting({
  prefix,
  num,
  suffix,
  decimals,
  grouped,
}: {
  prefix: string;
  num: number;
  suffix: string;
  decimals: number;
  grouped: boolean;
}) {
  const v = useTween(num);
  const shown = grouped
    ? v.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : v.toFixed(decimals);
  return (
    <>
      {prefix}
      {shown}
      {suffix}
    </>
  );
}

/**
 * Counts up numeric card values (12, "₹4,500", "3 days"). Non-numeric content — skeletons, text,
 * JSX — renders unchanged, so it is safe to wrap any StatCard value.
 */
export function AnimatedValue({ value }: { value: React.ReactNode }) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return (
      <Counting
        prefix=""
        num={value}
        suffix=""
        decimals={Number.isInteger(value) ? 0 : 1}
        grouped
      />
    );
  }
  if (typeof value === "string") {
    const m = SPLIT.exec(value.trim());
    if (m) {
      const n = Number(m[2].replace(/,/g, ""));
      if (Number.isFinite(n)) {
        const dot = m[2].split(".")[1];
        return (
          <Counting
            prefix={m[1]}
            num={n}
            suffix={m[3]}
            decimals={dot ? dot.length : 0}
            grouped={m[2].includes(",")}
          />
        );
      }
    }
  }
  return <>{value}</>;
}
