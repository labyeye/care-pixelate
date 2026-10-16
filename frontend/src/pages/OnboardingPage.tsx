import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, authAPI, billingAPI } from "@/services/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoLong from "@/assets/logos/logo-long.png";
import type { OrgType } from "@/types";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

type Step = "company" | "doctors" | "plan" | "payment";
type Cycle = "monthly" | "yearly";

const STEPS: { id: Step; label: string }[] = [
  { id: "company", label: "Organisation" },
  { id: "doctors", label: "Team size" },
  { id: "plan", label: "Plan" },
  { id: "payment", label: "Payment" },
];

const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clinic" },
  { value: "individual_doctor", label: "Individual Doctor" },
  { value: "multi_speciality_hospital", label: "Multi-Speciality Hospital" },
  { value: "diagnostic_center", label: "Diagnostic Center" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "medical_college", label: "Medical College" },
  { value: "corporate_healthcare", label: "Corporate Healthcare" },
  { value: "ngo_healthcare", label: "NGO Healthcare" },
  { value: "telemedicine_company", label: "Telemedicine Company" },
];

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

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

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="mb-10 flex items-center justify-center">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center border-2 border-black text-sm font-bold transition-all",
                  done && "bg-[#024BAB] text-white",
                  active && "bg-[#FA731C] text-white",
                  !done && !active && "bg-white text-gray-400",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span
                className={cn(
                  "mt-1 text-[10px] font-bold uppercase tracking-wide",
                  active ? "text-[#FA731C]" : done ? "text-[#024BAB]" : "text-gray-400",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn("mx-1 mt-[-14px] h-0.5 w-8 sm:w-16", idx < currentIdx ? "bg-[#024BAB]" : "bg-gray-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const primaryBtn =
  "w-full bg-[#024BAB] text-white border-2 border-black font-bold uppercase text-sm px-4 py-3 flex items-center justify-center gap-2 hover:bg-[#023590] disabled:opacity-60 disabled:cursor-not-allowed transition-all";
const backBtn = "w-full text-center text-xs text-gray-400 hover:text-black font-bold mt-3 transition-colors";

export default function OnboardingPage() {
  const { user, tenant, logout, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("company");
  const [company, setCompany] = useState({ orgName: "", orgType: "clinic" as OrgType, city: "", state: "", gstin: "", registrationNumber: "", registrationCouncil: "", consultationFee: "", clinicCode: "" });
  const [companyErrors, setCompanyErrors] = useState<Record<string, string>>({});
  const [doctors, setDoctors] = useState<number | "">(1);
  const [planId, setPlanId] = useState("starter");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [busy, setBusy] = useState<"pay" | "trial" | null>(null);
  const inFlow = useRef(false);

  const plans = useQuery({ queryKey: ["billing-plans"], queryFn: billingAPI.plans });
  const gstRate = plans.data?.gstRate ?? 18;
  const trialDays = plans.data?.trial.days ?? 14;
  const plan = plans.data?.plans[planId];
  const solo = company.orgType === "individual_doctor";
  const count = solo ? 1 : Number(doctors) || 0;

  const price = (rate: number, n: number) => {
    const subtotal = rate * n * (cycle === "yearly" ? 12 : 1);
    const gst = Math.round((subtotal * gstRate) / 100);
    return { subtotal, gst, total: subtotal + gst };
  };

  // Already has an organisation (e.g. returning later) — nothing to onboard.
  useEffect(() => {
    if (tenant && !inFlow.current) navigate("/dashboard", { replace: true });
  }, [tenant, navigate]);

  const submitCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const org = company.orgName.trim();
    if (org.length < 2 || org.length > 120) errs.orgName = "Enter 2–120 characters";
    if (!company.city.trim()) errs.city = "City is required";
    if (!company.state.trim()) errs.state = "State is required";
    if (company.gstin && !GSTIN_RE.test(company.gstin.trim().toUpperCase())) errs.gstin = "Invalid GSTIN format";
    if (solo) {
      if (company.registrationNumber.trim().length < 2) errs.registrationNumber = "Medical registration number is required";
      if (company.registrationCouncil.trim().length < 2) errs.registrationCouncil = "Registration council is required";
    }
    const fee = company.consultationFee === "" ? 0 : Number(company.consultationFee);
    if (!Number.isFinite(fee) || fee < 0) errs.consultationFee = "Enter a valid fee";
    const code = company.clinicCode.trim();
    if (code && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code)) errs.clinicCode = "Lowercase letters, numbers and single hyphens only";
    else if (code && (code.length < 3 || code.length > 40)) errs.clinicCode = "3-40 characters";
    setCompanyErrors(errs);
    if (!Object.keys(errs).length) setStep(solo ? "plan" : "doctors");
  };

  const continueDoctors = () => {
    if (!count || count < 1 || count > 1000) {
      toast.error("Enter between 1 and 1000 doctors");
      return;
    }
    setStep("plan");
  };

  // Creates the organisation (trial) — both "pay" and "trial" paths need it,
  // and billing endpoints only work once the account has a tenant.
  const createOrg = async () => {
    await authAPI.onboard({
      orgName: company.orgName.trim(),
      orgType: company.orgType,
      city: company.city.trim(),
      state: company.state.trim(),
      gstin: company.gstin.trim().toUpperCase() || undefined,
      doctorCount: count,
      ...(solo && {
        registrationNumber: company.registrationNumber.trim(),
        registrationCouncil: company.registrationCouncil.trim(),
      }),
      consultationFee: company.consultationFee === "" ? undefined : Number(company.consultationFee),
      clinicCode: company.clinicCode.trim() || undefined,
    });
    await refreshSession();
  };

  const startTrial = async () => {
    setBusy("trial");
    inFlow.current = true;
    try {
      await createOrg();
      toast.success(`Workspace ready — your ${trialDays}-day trial has started`);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      inFlow.current = false;
      toast.error(err instanceof ApiError ? err.message : "Could not create your workspace");
      setBusy(null);
    }
  };

  const pay = async () => {
    setBusy("pay");
    inFlow.current = true;
    try {
      await createOrg();
      if (!(await loadRazorpay())) throw new Error("Could not load the payment window");
      const order = await billingAPI.createOrder({ plan: planId, doctors: count, billingCycle: cycle });
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: "NestCare",
          description: `${plan?.name} · ${count} doctor(s) · ${cycle}`,
          theme: { color: "#024BAB" },
          prefill: { name: user?.name, email: user?.email, contact: user?.phone },
          handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await billingAPI.verify(r);
              toast.success("Payment successful — plan activated");
              await refreshSession();
              navigate("/dashboard", { replace: true });
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
      const msg = err instanceof Error ? err.message : "Please try again.";
      if (msg === "Payment cancelled") {
        // The workspace exists already (trial) — pay later from Billing.
        toast.info("Payment cancelled. Your trial is active — you can upgrade anytime from Billing.");
        navigate("/dashboard", { replace: true });
        return;
      }
      toast.error(msg);
      setBusy(null);
    }
  };

  const orderPrice = plan ? price(plan.perDoctor, Math.max(count, plan.minDoctors)) : null;

  return (
    <div className="min-h-screen bg-[#F0F6FF]">
      <header className="sticky top-0 z-10 border-b-2 border-black bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <img src={logoLong} alt="NestCare" className="h-9 object-contain" />
          <button onClick={logout} className="text-sm font-bold text-black transition-colors hover:text-[#024BAB]">
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <StepIndicator current={step} />

        {step === "company" && (
          <div>
            <div className="mb-8 text-center">
              <h1 className="mb-2 font-display text-3xl font-bold text-black">Set up your organisation</h1>
              <p className="text-sm font-medium text-gray-500">Your clinic or hospital details</p>
            </div>
            <form
              onSubmit={submitCompany}
              noValidate
              className="mx-auto grid max-w-2xl grid-cols-1 gap-4 border-2 border-black bg-white p-8 sm:grid-cols-2"
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="orgName">Organisation name</Label>
                <Input
                  id="orgName"
                  value={company.orgName}
                  onChange={(e) => setCompany({ ...company, orgName: e.target.value })}
                  placeholder="Sunrise Hospital"
                  autoFocus
                />
                {companyErrors.orgName && <p className="text-xs font-bold text-red-600">{companyErrors.orgName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orgType">Organisation type</Label>
                <select
                  id="orgType"
                  value={company.orgType}
                  onChange={(e) => setCompany({ ...company, orgType: e.target.value as OrgType })}
                  className="nb-input flex h-10 w-full px-3 py-2 text-sm"
                >
                  {ORG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstin">GSTIN (optional)</Label>
                <Input
                  id="gstin"
                  value={company.gstin}
                  maxLength={15}
                  onChange={(e) => setCompany({ ...company, gstin: e.target.value })}
                  placeholder="27ABCDE1234F1Z5"
                />
                {companyErrors.gstin && <p className="text-xs font-bold text-red-600">{companyErrors.gstin}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder="Pune" />
                {companyErrors.city && <p className="text-xs font-bold text-red-600">{companyErrors.city}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" value={company.state} onChange={(e) => setCompany({ ...company, state: e.target.value })} placeholder="Maharashtra" />
                {companyErrors.state && <p className="text-xs font-bold text-red-600">{companyErrors.state}</p>}
              </div>
              {solo && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="registrationNumber">Medical registration no.</Label>
                    <Input id="registrationNumber" value={company.registrationNumber} onChange={(e) => setCompany({ ...company, registrationNumber: e.target.value })} placeholder="MMC-12345" />
                    {companyErrors.registrationNumber && <p className="text-xs font-bold text-red-600">{companyErrors.registrationNumber}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="registrationCouncil">Registration council</Label>
                    <Input id="registrationCouncil" value={company.registrationCouncil} onChange={(e) => setCompany({ ...company, registrationCouncil: e.target.value })} placeholder="Maharashtra Medical Council" />
                    {companyErrors.registrationCouncil && <p className="text-xs font-bold text-red-600">{companyErrors.registrationCouncil}</p>}
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="consultationFee">Consultation fee (₹, optional)</Label>
                <Input id="consultationFee" type="number" min={0} value={company.consultationFee} onChange={(e) => setCompany({ ...company, consultationFee: e.target.value })} placeholder="500" />
                {companyErrors.consultationFee && <p className="text-xs font-bold text-red-600">{companyErrors.consultationFee}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clinicCode">Clinic code (optional)</Label>
                <Input id="clinicCode" value={company.clinicCode} onChange={(e) => setCompany({ ...company, clinicCode: e.target.value.toLowerCase() })} placeholder="dr-sharma-clinic" />
                <p className="text-xs text-gray-500">Patients type this in the app to join you.</p>
                {companyErrors.clinicCode && <p className="text-xs font-bold text-red-600">{companyErrors.clinicCode}</p>}
              </div>
              <button type="submit" className={cn(primaryBtn, "sm:col-span-2")}>
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

        {step === "doctors" && (
          <div>
            <div className="mb-8 text-center">
              <h1 className="mb-2 font-display text-3xl font-bold text-black">How many doctors?</h1>
              <p className="text-sm font-medium text-gray-500">Plans are priced per doctor</p>
            </div>
            <div className="mx-auto max-w-sm border-2 border-black bg-white p-8">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-black">Number of doctors</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={doctors}
                onChange={(e) => setDoctors(e.target.value === "" ? "" : Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                placeholder="e.g. 3"
                autoFocus
                className="mb-2 w-full border-2 border-black px-4 py-3 text-center text-2xl font-bold focus:outline-none"
              />
              <p className="mb-6 text-center text-xs font-medium text-gray-400">Include visiting and consulting doctors</p>
              <div className="mb-6 grid grid-cols-4 gap-2">
                {[1, 3, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDoctors(n)}
                    className={cn(
                      "border-2 border-black py-2 text-sm font-bold transition-all",
                      count === n ? "bg-[#024BAB] text-white" : "bg-white text-black hover:bg-gray-50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button onClick={continueDoctors} className={primaryBtn}>
                Continue <ChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setStep("company")} className={backBtn}>← Back</button>
            </div>
          </div>
        )}

        {step === "plan" && (
          <div>
            <div className="mb-8 text-center">
              <h1 className="mb-2 font-display text-3xl font-bold text-black">Choose your plan</h1>
              <p className="text-sm font-medium text-gray-500">
                Priced per doctor — for your team of {count} · includes a {trialDays}-day free trial
              </p>
            </div>

            <div className="mb-6 flex justify-center gap-2">
              {(["monthly", "yearly"] as Cycle[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={cn(
                    "border-2 border-black px-4 py-2 text-sm font-bold capitalize transition-all",
                    cycle === c ? "bg-[#024BAB] text-white" : "bg-white text-black hover:bg-gray-50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {plans.isLoading && <p className="text-center text-sm font-medium text-gray-500">Loading plans…</p>}
            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {Object.entries(plans.data?.plans ?? {}).map(([id, p]) => {
                const selected = planId === id;
                const tooFew = count < p.minDoctors;
                const total = price(p.perDoctor, Math.max(count, p.minDoctors)).total;
                return (
                  <button
                    key={id}
                    disabled={tooFew}
                    onClick={() => setPlanId(id)}
                    className={cn(
                      "flex flex-col border-2 bg-white p-5 text-left transition-all disabled:opacity-50",
                      selected ? "border-[#024BAB] ring-2 ring-[#024BAB]" : "border-black hover:border-[#024BAB]",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="font-display text-lg font-bold text-black">{p.name}</h3>
                      {selected && <Check className="h-5 w-5 shrink-0 text-[#024BAB]" />}
                    </div>
                    <p className="mb-4 text-xs font-medium text-gray-500">
                      {tooFew ? `Needs ${p.minDoctors}+ doctors` : p.minDoctors > 1 ? `Min ${p.minDoctors} doctors` : "Per doctor, per month"}
                    </p>
                    <div className="mb-4 border-b-2 border-black pb-4">
                      <div className="font-display text-2xl font-bold text-[#024BAB]">{inr(p.perDoctor)}</div>
                      <div className="text-xs font-medium text-gray-500">/doctor/month</div>
                      <div className="mt-1 text-xs font-bold text-gray-600">
                        {inr(total)} incl. GST / {cycle === "yearly" ? "year" : "month"}
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#024BAB]" />
                          <span className="font-medium text-gray-700">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="mx-auto max-w-sm">
              <button onClick={() => setStep("payment")} disabled={!plan || count < plan.minDoctors} className={primaryBtn}>
                Continue to Payment <ChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setStep(solo ? "company" : "doctors")} className={backBtn}>← Back</button>
            </div>
          </div>
        )}

        {step === "payment" && plan && orderPrice && (
          <div>
            <div className="mb-8 text-center">
              <h1 className="mb-2 font-display text-3xl font-bold text-black">Confirm &amp; Pay</h1>
              <p className="text-sm font-medium text-gray-500">A secure Razorpay checkout will open to complete your payment</p>
            </div>

            <div className="mx-auto max-w-md space-y-4">
              <div className="border-2 border-black bg-white">
                <div className="border-b-2 border-black bg-[#F0F6FF] p-5">
                  <p className="text-xs font-bold uppercase text-gray-500">Order Summary</p>
                </div>
                <div className="space-y-3 p-5 text-sm">
                  {[
                    ["Organisation", company.orgName.trim()],
                    ["Plan", plan.name],
                    ["Rate", `${inr(plan.perDoctor)}/doctor/month`],
                    ["Doctors", String(Math.max(count, plan.minDoctors))],
                    ["Billing", cycle === "yearly" ? "Yearly" : "Monthly"],
                    ["Subtotal", inr(orderPrice.subtotal)],
                    [`GST (${gstRate}%)`, inr(orderPrice.gst)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="font-bold text-gray-600">{k}</span>
                      <span className="font-bold text-black">{v}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t-2 border-black pt-3">
                    <span className="text-sm font-bold uppercase">Total / {cycle === "yearly" ? "year" : "month"}</span>
                    <span className="text-xl font-bold text-[#024BAB]">{inr(orderPrice.total)}</span>
                  </div>
                </div>
              </div>

              <button onClick={pay} disabled={busy !== null} className={cn(primaryBtn, "py-4")}>
                {busy === "pay" ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Opening checkout...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-5 w-5" /> Pay {inr(orderPrice.total)} via Razorpay
                  </>
                )}
              </button>

              <button
                onClick={startTrial}
                disabled={busy !== null}
                className="w-full border-2 border-black bg-white px-4 py-3 text-sm font-bold uppercase text-black transition-all hover:bg-gray-50 disabled:opacity-60"
              >
                {busy === "trial" ? "Setting up..." : `Start ${trialDays}-day free trial instead`}
              </button>

              <div className="flex items-center justify-center gap-2 text-xs font-medium text-gray-400">
                <AlertCircle className="h-3.5 w-3.5" />
                Secured by Razorpay · PCI-DSS compliant
              </div>

              <button onClick={() => setStep("plan")} className={backBtn}>← Back to plan selection</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
