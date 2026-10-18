import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedValue } from "@/components/ui/AnimatedValue";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** Hex accent colour used as the icon chip fill. */
  color?: string;
  onClick?: () => void;
  active?: boolean;
  /** Optional small line under the value. */
  sub?: string;
  className?: string;
}

/**
 * Summary / status card used at the top of list pages — same look as the
 * Students page (solid icon chip + big number + uppercase label).
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color = "#024BAB",
  onClick,
  active,
  sub,
  className,
}: StatCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "nb-rise nb-lift border-2 border-black bg-white p-4 flex items-center gap-3 text-left",
        !onClick &&
          "hover:!shadow-none hover:!translate-x-0 hover:!translate-y-0",
        active && "shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]",
        className,
      )}
      style={active ? { backgroundColor: `${color}12` } : undefined}
    >
      <div
        className="nb-chip nb-chip-hover w-10 h-10 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center shrink-0"
        style={{ backgroundColor: color }}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-black leading-tight tabular-nums">
          <AnimatedValue value={value} />
        </p>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
        {sub ? (
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        ) : null}
      </div>
    </Tag>
  );
}
