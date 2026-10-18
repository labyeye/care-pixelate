import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The table action cell used on every list page (same look as the Doctors table):
 * a right-aligned row of outline icon buttons. Clicks never bubble to a clickable <TableRow>.
 * Pair the column with <TableHead className="text-right">Actions</TableHead>.
 */
export function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex justify-end gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

interface ActionButtonProps {
  label: string; // used for the tooltip and the accessible name
  icon: LucideIcon;
  onClick?: () => void;
  /** Render as a router link instead of a button. */
  to?: string;
  disabled?: boolean;
  className?: string;
}

export function ActionButton({
  label,
  icon: Icon,
  onClick,
  to,
  disabled,
  className,
}: ActionButtonProps) {
  if (to && !disabled) {
    return (
      <Button asChild variant="outline" size="icon" className={className}>
        <Link to={to} aria-label={label} title={label}>
          <Icon className="h-4 w-4" />
        </Link>
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
