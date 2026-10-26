import { writePrintDocument } from "@/lib/printWindow";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CreditCard,
  Crown,
  Download,
  Loader2,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, billingAPI } from "@/services/api";
import { buildSubscriptionInvoiceHTML } from "@/lib/buildSubscriptionInvoiceHTML";
import { cn } from "@/lib/utils";
import logoLong from "@/assets/logos/logo-long.png";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

// Tolerates records without an amount so one bad invoice can never take the whole page down.
const inr = (n?: number | null) => `₹${(n ?? 0).toLocaleString("en-IN")}`;
const longDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const TRIAL_DAYS = 14;
const PERIOD_DAYS = { monthly: 30, yearly: 365 } as const;

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function BillingPage() {
  const { user, tenant, refreshSession } = useAuth();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [doctors, setDoctors] = useState<number | "">(
    tenant?.profile?.expectedDoctors ?? 1,
  );
  const [gatewayModal, setGatewayModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const plans = useQuery({
    queryKey: ["billing-plans"],
    queryFn: billingAPI.plans,
  });
  const mine = useQuery({ queryKey: ["billing-me"], queryFn: billingAPI.me });

  const t = mine.data?.tenant;
  const sub = mine.data?.subscription;
  const planMap = plans.data?.plans ?? {};
  const gstRate = plans.data?.gstRate ?? 18;
  const currentPlan = t?.plan ?? tenant?.plan;

  // Preselect the plan the clinic is on (or the first one, if it is still on trial).
  useEffect(() => {
    if (selectedPlan || !plans.data) return;
    setSelectedPlan(
      currentPlan && planMap[currentPlan]
        ? currentPlan
        : (Object.keys(planMap)[0] ?? ""),
    );
  }, [plans.data, currentPlan, selectedPlan, planMap]);
  useEffect(() => {
    const n = sub?.doctors ?? tenant?.profile?.expectedDoctors;
    if (n) setDoctors(n);
    if (sub?.billingCycle) setCycle(sub.billingCycle);
  }, [sub?.doctors, sub?.billingCycle, tenant?.profile?.expectedDoctors]);

  const expires = t?.planExpiresAt ? new Date(t.planExpiresAt) : null;
  const rawDays = expires
    ? Math.ceil((expires.getTime() - Date.now()) / 86_400_000)
    : null;
  const daysLeft = rawDays === null ? null : Math.max(0, rawDays);
  const isTrial = currentPlan === "trial";
  const isActive =
    !isTrial &&
    !!expires &&
    expires.getTime() > Date.now() &&
    t?.status === "active";
  const totalDays = isTrial
    ? TRIAL_DAYS
    : PERIOD_DAYS[sub?.billingCycle ?? "monthly"];
  const daysPct =
    daysLeft !== null
      ? Math.min(Math.round((daysLeft / totalDays) * 100), 100)
      : 100;

  const docUsed = mine.data?.usage.doctors ?? 0;
  const docMax = t?.limits.doctorLimit ?? 0;
  const docPct =
    docMax > 0 ? Math.min(Math.round((docUsed / docMax) * 100), 100) : 0;

  const invoices = [...(sub?.invoices ?? [])].sort(
    (a, b) =>
      +new Date(b.paidAt ?? b.createdAt ?? 0) -
      +new Date(a.paidAt ?? a.createdAt ?? 0),
  );
  const lastPaid = invoices.find((i) => i.status === "paid");
  const planName = (id?: string) =>
    (id && planMap[id]?.name) ||
    (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Plan");

  const count = Number(doctors) || 0;
  const plan = planMap[selectedPlan];
  const billed = plan
    ? plan.perDoctor *
      Math.max(count, plan.minDoctors) *
      (cycle === "yearly" ? 12 : 1)
    : 0;
  const gst = Math.round((billed * gstRate) / 100);
  const tooFew = !!plan && count < plan.minDoctors;

  const downloadInvoice = (
    inv: NonNullable<typeof sub>["invoices"][number],
  ) => {
    const html = buildSubscriptionInvoiceHTML(
      inv,
      {
        name: t?.gstDetails?.legalName || t?.name || tenant?.name,
        email: t?.contact?.email || user?.email,
        phone: t?.contact?.phone || user?.phone,
        address: t?.contact?.address,
        city: t?.contact?.city,
        state: t?.contact?.state,
        pincode: t?.contact?.pincode,
        gstin: t?.gstDetails?.gstin,
      },
      planName(inv.plan),
    );
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow pop-ups to download the invoice");
    writePrintDocument(w, html, true);
  };

  const startPayment = () => {
    if (!plan || !count) return toast.error("Enter the number of doctors");
    if (tooFew)
      return toast.error(`${plan.name} needs ${plan.minDoctors}+ doctors`);
    setGatewayModal(true);
  };

  const pay = async () => {
    setGatewayModal(false);
    setUpgrading(true);
    try {
      if (!(await loadRazorpay()))
        throw new Error("Could not load the payment window");
      const order = await billingAPI.createOrder({
        plan: selectedPlan,
        doctors: count,
        billingCycle: cycle,
      });
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: "NestDoc",
          description: `${plan?.name} · ${count} doctor(s) · ${cycle}`,
          prefill: {
            name: user?.name,
            email: user?.email,
            contact: user?.phone,
          },
          theme: { color: "#024BAB" },
          handler: async (r: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              await billingAPI.verify(r);
              toast.success("Payment successful — plan activated");
              await refreshSession();
              qc.invalidateQueries({ queryKey: ["billing-me"] });
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.open();
      });
    } catch (err) {
      const msg =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Could not start payment";
      if (msg !== "Payment cancelled") toast.error(msg);
    } finally {
      setUpgrading(false);
    }
  };

  if (mine.isLoading || plans.isLoading) {
    return (
      <AppLayout title="Billing">
        <div className="flex h-[60vh] items-center justify-center">
          <img
            src={logoLong}
            alt="NestDoc"
            className="h-16 w-auto animate-pulse"
          />
        </div>
      </AppLayout>
    );
  }

  const stats = [
    {
      label: "Doctors",
      value: docUsed,
      max: docMax || "∞",
      pct: docPct,
      icon: Stethoscope,
      bg: "bg-[#024BAB]",
    },
    {
      label: "Days Remaining",
      value: daysLeft ?? "—",
      max: totalDays,
      pct: daysPct,
      icon: Calendar,
      bg: "bg-[#FA731C]",
    },
    {
      label: "Staff Seats",
      value: t?.limits.userLimit ?? "—",
      max: "",
      pct: 100,
      icon: Users,
      bg: "bg-[#00C48C]",
    },
  ];

  return (
    <AppLayout title="Billing">
      <div className="mx-auto space-y-6 p-4 sm:space-y-8 sm:p-6">
        {isTrial && (
          <div className="flex items-start gap-3 border-2 border-[#FBBF24] bg-[#FBBF24]/10 p-4">
            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]" />
            <div>
              <p className="text-sm font-bold text-[#D97706]">
                {TRIAL_DAYS}-Day Free Trial Active — {daysLeft ?? 0} days
                remaining
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                You're on a free trial
                {expires ? ` until ${longDate(expires)}` : ""}. Subscribe
                anytime below to keep full access.
              </p>
            </div>
          </div>
        )}
        {!isActive && !isTrial && (
          <div className="flex items-start gap-3 border-2 border-[#EF4444] bg-[#EF4444]/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#EF4444]" />
            <div>
              <p className="text-sm font-bold text-[#EF4444]">
                No Active Subscription
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your plan has expired. Choose a plan below to continue using
                NestDoc.
              </p>
            </div>
          </div>
        )}

        {/* Current plan band */}
        <div className="flex flex-col gap-4 border-2 bg-[#024BAB] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-white">
              <Crown className="h-5 w-5 text-[#024BAB]" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-white">
                {isTrial ? "Free Trial" : `${planName(currentPlan)} Plan`} —{" "}
                {isTrial ? "Trial" : isActive ? "Active" : "Inactive"}
              </p>
              <p className="text-sm font-medium text-white/70">
                {expires
                  ? `${isTrial ? "Trial ends" : isActive ? "Next billing" : "Expired on"}: ${longDate(expires)}`
                  : "No active subscription"}
              </p>
            </div>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 self-start border-2 border-black px-3 py-1.5 text-sm font-bold sm:self-auto",
              isTrial
                ? "bg-[#FBBF24] text-black"
                : isActive
                  ? "bg-white text-[#024BAB]"
                  : "bg-[#EF4444] text-white",
            )}
          >
            {isTrial ? (
              <Zap className="h-4 w-4" />
            ) : isActive ? (
              <Check className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {isTrial
              ? `${daysLeft ?? 0} days left`
              : isActive
                ? "Paid & Active"
                : "Attention Required"}
          </div>
        </div>

        {/* Usage cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-3 border-2 bg-white p-4"
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black",
                  s.bg,
                )}
              >
                <s.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-display text-3xl font-bold text-black">
                  {s.value}
                  {s.max !== "" && (
                    <span className="ml-1 text-sm font-medium text-muted-foreground">
                      / {s.max}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
              </div>
              <div className="h-2 border border-black bg-[#024BAB]/20">
                <div
                  className={cn(
                    "h-full border-r border-black",
                    s.pct > 85 && s.label !== "Days Remaining"
                      ? "bg-[#EF4444]"
                      : "bg-[#024BAB]",
                  )}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Change plan */}
        <div>
          <h2 className="mb-6 font-display text-2xl font-bold text-black">
            Change Plan
          </h2>

          <div className="mb-6 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            {Object.entries(planMap).map(([id, p]) => (
              <button
                key={id}
                onClick={() => setSelectedPlan(id)}
                className={cn(
                  "border-2 bg-white p-4 text-left transition-all",
                  selectedPlan === id
                    ? "border-[#024BAB] ring-2 ring-[#024BAB]"
                    : "border-black hover:border-[#024BAB]",
                )}
              >
                <p className="text-sm font-bold text-black">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {inr(p.perDoctor)}/doctor/month
                  {p.minDoctors > 1 ? ` · min ${p.minDoctors} doctors` : ""}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-black/80">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-1">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#00C48C]" />{" "}
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          <div className="max-w-sm border-2 bg-white p-5">
            <div className="mb-4 flex gap-0 border-2 border-black">
              {(["monthly", "yearly"] as const).map((c, i) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={cn(
                    "flex-1 px-3 py-2 text-sm font-semibold capitalize",
                    i === 0 && "border-r-2 border-black",
                    cycle === c
                      ? "bg-black text-white"
                      : "bg-white text-black hover:bg-gray-50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-black">
              Number of doctors
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={doctors}
              onChange={(e) =>
                setDoctors(
                  e.target.value === ""
                    ? ""
                    : Math.min(
                        1000,
                        Math.max(1, parseInt(e.target.value) || 1),
                      ),
                )
              }
              className="mb-4 w-full border-2 border-black px-4 py-2.5 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#024BAB]"
            />

            {plan && count > 0 && (
              <div className="mb-4">
                <span className="font-display text-3xl font-bold text-black">
                  {inr(billed + gst)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  /{cycle === "yearly" ? "yr" : "mo"}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {inr(billed)} + {gstRate}% GST ({inr(gst)}) · {plan.name} ·{" "}
                  {Math.max(count, plan.minDoctors)} doctor(s)
                </p>
                {tooFew && (
                  <p className="mt-1 text-xs font-bold text-[#EF4444]">
                    {plan.name} needs at least {plan.minDoctors} doctors.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={startPayment}
              disabled={upgrading || !plan || !count || tooFew}
              className="flex w-full items-center justify-center gap-2 border-2 bg-black py-2.5 text-sm text-white hover:bg-black/80 disabled:opacity-50"
            >
              {upgrading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {currentPlan === selectedPlan && isActive
                    ? "Renew & Pay"
                    : "Update & Pay"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Payment method */}
        <div className="border-2 bg-white p-4 sm:p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-black">
            <CreditCard className="h-5 w-5 text-[#024BAB]" /> Payment Method
          </h3>
          {lastPaid ? (
            <div className="flex items-center gap-3 border-2 border-black bg-[#024BAB]/5 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-[#024BAB]">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-black">
                  Razorpay — last payment {inr(lastPaid.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Paid on {lastPaid.paidAt ? longDate(lastPaid.paidAt) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-black p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No payment method on file
              </p>
            </div>
          )}
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3 shrink-0" />
            Payments are processed securely via Razorpay. We never store your
            card details.
          </p>
        </div>

        {/* Invoice history */}
        <div className="border-2 bg-white p-4 sm:p-5">
          <h3 className="mb-4 font-display text-lg font-bold text-black">
            Invoice History
          </h3>
          {invoices.length === 0 ? (
            <div className="border-2 border-dashed border-black/30 py-6 text-center">
              <p className="text-xs text-muted-foreground">No invoices found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div
                  key={
                    inv._id ?? inv.invoiceNumber ?? `${inv.plan}-${inv.paidAt}`
                  }
                  className="flex flex-col gap-2 border-2 border-black p-3 transition-colors hover:bg-[#024BAB]/5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-xs font-bold text-muted-foreground">
                      {inv.invoiceNumber ?? "Invoice"}
                    </span>
                    <span className="text-sm font-medium text-black">
                      {longDate(inv.paidAt ?? inv.createdAt ?? new Date())}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {planName(inv.plan)} · {inv.billingCycle ?? "monthly"}
                      {inv.doctors
                        ? ` · ${inv.doctors} doctor${inv.doctors > 1 ? "s" : ""}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-black">
                      {inr(inv.amount)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 border-2 border-black px-2 py-0.5 text-[11px] font-bold",
                        inv.status === "paid"
                          ? "bg-[#00C48C] text-black"
                          : "bg-[#FA731C] text-white",
                      )}
                    >
                      {inv.status === "paid" && <Check className="h-3 w-3" />}
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                    <button
                      onClick={() => downloadInvoice(inv)}
                      className="flex items-center gap-1 text-xs font-bold text-[#024BAB] underline transition-colors hover:text-[#024BAB]/80"
                    >
                      <Download className="h-3 w-3" /> Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {gatewayModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm border-2 border-black bg-white">
              <div className="flex items-center justify-between border-b-2 border-black p-5">
                <h3 className="text-lg font-bold">Choose Payment Gateway</h3>
                <button
                  onClick={() => setGatewayModal(false)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                <p className="mb-4 text-sm text-muted-foreground">
                  Select how you'd like to complete this payment.
                </p>
                <button
                  onClick={pay}
                  className="flex w-full items-center gap-4 border-2 border-black p-4 text-left transition-colors hover:bg-[#024BAB]/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-[#024BAB]">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-black">Razorpay</p>
                    <p className="text-xs text-muted-foreground">
                      Cards, UPI, Net Banking, Wallets
                    </p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </button>
                <p className="flex items-center justify-center gap-1 pt-2 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" /> All payments are 256-bit
                  encrypted
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </AppLayout>
  );
}
