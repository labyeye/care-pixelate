import { useCallback, useEffect, useState } from "react";
import { Coins, Gift, MessageCircle, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { fmtCredits, useCredits } from "@/contexts/CreditsContext";
import { creditsAPI } from "@/services/api";
import { cn } from "@/lib/utils";

const loadRazorpay = (): Promise<boolean> =>
  new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

const FILTERS = [
  { key: "", label: "All" },
  { key: "debit", label: "Charged" },
  { key: "skipped", label: "Not sent" },
  { key: "refund", label: "Refunds" },
  { key: "topup", label: "Top-ups" },
  { key: "bonus", label: "Bonus" },
];

const EVENT_LABEL: Record<string, string> = {
  appointment_confirmed: "Appointment confirmed",
  appointment_reminder: "Appointment reminder",
  appointment_cancelled: "Appointment cancelled",
  followup_reminder: "Follow-up reminder",
  payment_receipt: "Payment receipt",
  invoice_due: "Invoice due",
  prescription_ready: "Prescription ready",
  lab_report_ready: "Lab report ready",
  video_consult_link: "Video consult link",
  birthday_wish: "Birthday wish",
};

const REASON: Record<string, string> = {
  low_balance: "Not sent: no credits",
  daily_cap: "Not sent: daily limit reached",
  send_failed: "Refunded: could not send",
  delivery_failed: "Refunded: not delivered",
};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function CreditsPage() {
  const { user } = useAuth();
  const { credits, refresh } = useCredits();
  const [packs, setPacks] = useState<any[]>([]);
  const [gstPct, setGstPct] = useState(18);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [topups, setTopups] = useState<any[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const canView = user?.role === "tenant_owner" || user?.role === "hospital_admin";
  const canBuy = user?.role === "tenant_owner";

  const loadLedger = useCallback(async (p: number, f: string) => {
    try {
      const res = await creditsAPI.ledger(p, f);
      setRows((prev) => (p === 1 ? res.data : [...prev, ...res.data]));
      setTotal(res.total);
      setPage(p);
    } catch {
      // table just stays as it was
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    creditsAPI
      .packs()
      .then((r) => {
        setPacks(r.packs);
        setGstPct(r.gstPct);
      })
      .catch(() => {});
    creditsAPI.topups().then(setTopups).catch(() => {});
  }, [canView]);

  useEffect(() => {
    if (canView) loadLedger(1, filter);
  }, [canView, filter, loadLedger]);

  const buy = async (pack: any) => {
    setPaying(pack.id);
    try {
      const order = await creditsAPI.createTopup(pack.id);
      if (!(await loadRazorpay()))
        throw new Error("Could not load the payment window. Check your connection.");
      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: Math.round(order.amount * 100),
          currency: order.currency || "INR",
          name: "NestDoc",
          description: `${fmtCredits(pack.credits)} WhatsApp credits`,
          theme: { color: "#024BAB" },
          prefill: { name: user?.name, email: user?.email },
          handler: async (response: any) => {
            try {
              await creditsAPI.verifyTopup({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              toast.success(`${fmtCredits(pack.credits)} credits are in your wallet`);
              await refresh();
              creditsAPI.topups().then(setTopups).catch(() => {});
              loadLedger(1, filter);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => resolve() },
        });
        rzp.on("payment.failed", (r: any) =>
          reject(new Error(r?.error?.description || "Payment failed")),
        );
        rzp.open();
      });
    } catch (e: any) {
      toast.error(e.message || "Could not add credits");
    }
    setPaying(null);
  };

  if (!canView) {
    return (
      <AppLayout title="WhatsApp Credits">
        <p className="text-sm font-medium text-gray-600">
          Only the clinic owner and admin can see credits.
        </p>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="WhatsApp Credits">
      <div className="max-w-5xl space-y-6">
        {credits && !credits.metered ? (
          <div className="border-2 border-black bg-white p-6">
            <p className="font-medium">Credits are not enabled for your clinic</p>
            <p className="mt-1 text-sm text-gray-600">
              WhatsApp messages to your patients are included in your plan, so there is nothing to top up.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div
                className={cn(
                  "border-2 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:col-span-2",
                  credits?.zero ? "bg-red-50" : "bg-white",
                )}
              >
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                  <Coins className="h-4 w-4 text-[#024BAB]" /> Available credits
                </div>
                <p className={cn("mt-2 text-5xl font-medium", credits?.zero && "text-red-600")}>
                  {fmtCredits(credits?.total)}
                </p>
                {!!credits?.bonus && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#00A878]">
                    <Gift className="h-3.5 w-3.5" /> includes {fmtCredits(credits.bonus)} bonus credits
                    {credits.bonusExpiresAt
                      ? ` · valid till ${new Date(credits.bonusExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </p>
                )}
                {credits?.zero ? (
                  <p className="mt-3 text-sm font-medium text-red-600">
                    Patient WhatsApp messages are paused until you add credits. Login OTPs still work.
                  </p>
                ) : credits?.low ? (
                  <p className="mt-3 text-sm font-medium text-[#FA731C]">
                    Credits are running low. Top up so appointment reminders don't stop.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 border-2 border-black bg-[#F0F7FF] p-5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                  <MessageCircle className="h-4 w-4 text-[#25D366]" /> How it's charged
                </div>
                <p className="text-sm">
                  <b>{credits?.rates?.message ?? 0.2} credit</b> per patient message
                </p>
                <p className="text-sm">
                  <b>{credits?.rates?.birthday ?? 1} credit</b> per birthday wish
                </p>
                <p className="flex items-start gap-1 text-xs text-gray-600">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#024BAB]" />
                  Login OTPs are free. A message that fails to send is refunded.
                </p>
              </div>
            </div>

            <div>
              <h2 className="mb-3 font-display font-medium">Add credits</h2>
              {!canBuy && <p className="mb-2 text-xs text-gray-500">Only the clinic owner can buy credits.</p>}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {packs.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col border-2 border-black bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                  >
                    <p className="text-2xl font-medium">{fmtCredits(p.credits)}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">credits</p>
                    {p.bonus > 0 && (
                      <span className="mt-1 self-start border border-black bg-[#FFF4D6] px-1.5 text-[11px] font-medium">
                        +{fmtCredits(p.bonus)} free
                      </span>
                    )}
                    <p className="mt-3 text-sm font-medium">{inr(p.price)}</p>
                    <p className="text-[11px] text-gray-500">
                      + {gstPct}% GST = {inr(p.total)}
                    </p>
                    <button
                      onClick={() => buy(p)}
                      disabled={!!paying || !canBuy}
                      className="mt-3 flex items-center justify-center gap-1 border-2 border-black bg-[#024BAB] py-2 text-xs font-medium text-white hover:bg-[#013a85] disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> {paying === p.id ? "Opening…" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Credits are non-refundable once purchased.</p>
            </div>

            <div>
              <h2 className="mb-3 font-display font-medium">Usage</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "border-2 border-black px-3 py-1 text-xs font-medium",
                      filter === f.key ? "bg-black text-white" : "bg-white hover:bg-[#024BAB]/10",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto border-2 border-black bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#024BAB] text-left text-white">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">What</th>
                      <th className="px-3 py-2 font-medium">To</th>
                      <th className="px-3 py-2 text-right font-medium">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center font-medium text-gray-500">
                          Nothing here yet
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r._id} className="border-t border-black/10">
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                          {new Date(r.createdAt).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {r.type === "topup" ? "Top-up" : r.type === "bonus" ? "Bonus credits" : EVENT_LABEL[r.event] || r.event || r.type}
                          {(REASON[r.note] || (r.type !== "debit" && r.note)) && (
                            <span className="block text-[11px] text-gray-500">{REASON[r.note] || r.note}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.phone || "—"}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-medium",
                            r.credits > 0 ? "text-[#00A878]" : r.credits === 0 ? "text-gray-400" : "",
                          )}
                        >
                          {r.credits > 0 ? "+" : ""}
                          {fmtCredits(r.credits)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length < total && (
                <button
                  onClick={() => loadLedger(page + 1, filter)}
                  className="mt-3 border-2 border-black bg-white px-4 py-1.5 text-xs font-medium hover:bg-[#024BAB]/10"
                >
                  Load more
                </button>
              )}
            </div>

            {topups.length > 0 && (
              <div>
                <h2 className="mb-3 font-display font-medium">Top-up invoices</h2>
                <div className="divide-y divide-black/10 border-2 border-black bg-white">
                  {topups.map((t) => (
                    <div key={t._id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-medium">{t.invoiceNumber}</span>
                      <span className="text-gray-600">
                        {new Date(t.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="text-gray-600">{fmtCredits(t.credits)} credits</span>
                      <span className="font-medium">
                        {inr(t.total)} <span className="font-normal text-gray-500">(GST {inr(t.gst)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
