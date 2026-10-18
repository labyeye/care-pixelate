import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// NestHR status pill (same as its Employees page): fully rounded, 2px black border, hard 3px black
// offset shadow, uppercase bold label, 10%-tinted fill with coloured text. margin-right keeps the shadow from clipping in table cells.
const badgeVariants = cva(
  "inline-flex items-center rounded-full border-2 border-[#0a0a0a] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.03em] shadow-[3px_3px_0px_#0a0a0a] mr-[3px] shrink-0 whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-[#024BAB]/10 text-[#024BAB]",
        secondary: "bg-[#FA731C]/10 text-[#FA731C]",
        success: "bg-[#00C48C]/10 text-[#00C48C]",
        destructive: "bg-[#EF4444]/10 text-[#EF4444]",
        outline: "bg-gray-100 text-gray-500",
        purple: "bg-[#A855F7]/10 text-[#A855F7]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

type Variant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// One place that decides what colour every status word in the app gets.
const STATUS_VARIANT: Record<string, Variant> = {
  // good / done
  active: "success",
  completed: "success",
  resulted: "success",
  paid: "success",
  verified: "success",
  approved: "success",
  present: "success",
  granted: "success",
  ok: "success",
  visited: "success",
  sent: "success",
  // in progress / informational
  scheduled: "default",
  booked: "default",
  collected: "default",
  processed: "default",
  partial: "default",
  view: "default",
  // needs attention
  pending: "secondary",
  ordered: "secondary",
  low: "secondary",
  soon: "secondary",
  unpaid: "secondary",
  trialing: "secondary",
  warning: "secondary",
  update: "secondary",
  create: "secondary",
  action: "secondary",
  not_connected: "secondary",
  // bad
  no_show: "destructive",
  rejected: "destructive",
  suspended: "destructive",
  denied: "destructive",
  failed: "destructive",
  expired: "destructive",
  delete: "destructive",
  out: "destructive",
  blocked: "destructive",
  // inactive / closed
  inactive: "outline",
  skipped: "outline",
  missing: "outline",
  not_tracked: "outline",
  cancelled: "outline",
  void: "outline",
  archived: "outline",
  draft: "outline",
  // type tags
  video: "purple",
  in_clinic: "default",
  walk_in: "secondary",
  // payment methods
  cash: "success",
  upi: "purple",
  card: "default",
  bank: "secondary",
  insurance: "outline",
};

/** Status text -> NestHR-style pill. Unknown words fall back to the neutral grey pill. */
function StatusBadge({
  status,
  label,
  className,
}: {
  status: string | number | undefined | null;
  label?: string;
  className?: string;
}) {
  const raw = String(status ?? "");
  const key = raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  let variant: Variant = STATUS_VARIANT[key] ?? "outline";
  // HTTP status codes (audit log): 2xx/3xx ok, 4xx/5xx failed
  if (/^\d{3}$/.test(raw))
    variant = Number(raw) < 400 ? "success" : "destructive";
  return (
    <Badge variant={variant} className={className}>
      {label ?? raw.replace(/_/g, " ") ?? "—"}
    </Badge>
  );
}

export { Badge, StatusBadge, badgeVariants };
