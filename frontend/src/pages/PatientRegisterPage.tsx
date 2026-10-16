import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { composePhone, DEFAULT_COUNTRY, PhoneInput, validatePhone } from "@/components/ui/phone-input";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, authAPI } from "@/services/api";
import logoLong from "@/assets/logos/logo-long.png";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Patient self-signup: the patient enters their clinic's code (confirmed against the server),
 * then creates a login. The account is created with its own patient profile and signed in.
 */
export default function PatientRegisterPage() {
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [clinicCode, setClinicCode] = useState(params.get("clinic") ?? "");
  const [clinic, setClinic] = useState<{ name: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const [f, setF] = useState({ name: "", email: "", country: DEFAULT_COUNTRY, phone: "", dob: "", gender: "", password: "", confirm: "", terms: false });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const errors: Record<string, string> = {};
  if (f.name.trim().split(/\s+/).filter(Boolean).length < 2) errors.name = "Enter your first and last name";
  if (!EMAIL_RE.test(f.email.trim())) errors.email = "Enter a valid email address";
  const phoneErr = validatePhone(f.country, f.phone);
  if (phoneErr) errors.phone = phoneErr;
  if (!f.dob || new Date(f.dob) > new Date()) errors.dob = "Enter a valid date of birth";
  if (!f.gender) errors.gender = "Select a gender";
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(f.password)) errors.password = "8+ characters with uppercase, lowercase and a number";
  if (f.confirm !== f.password) errors.confirm = "Passwords do not match";
  if (!f.terms) errors.terms = "Please accept the Terms and Privacy Policy";
  const err = (k: string) => (submitted ? errors[k] : undefined);

  const check = async () => {
    setChecking(true);
    try {
      setClinic(await authAPI.clinic(clinicCode));
    } catch (e) {
      setClinic(null);
      toast.error(e instanceof ApiError ? e.message : "Could not find that clinic");
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return toast.error("Please fix the highlighted fields");
    setSaving(true);
    try {
      await authAPI.registerPatient({
        clinicCode: clinicCode.trim().toLowerCase(), name: f.name.trim(), email: f.email.trim(), phone: composePhone(f.country, f.phone),
        password: f.password, dob: f.dob, gender: f.gender, acceptTerms: f.terms,
      });
      await refreshSession();
      toast.success("Welcome! Your account is ready.");
      navigate("/dashboard");
    } catch (e2) {
      toast.error(e2 instanceof ApiError ? e2.message : "Registration failed");
    } finally {
      setSaving(false);
    }
  };

  const field = (k: string, label: string, input: React.ReactNode, wide = false) => (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {input}
      {err(k) && <p className="text-xs font-bold text-red-600">{err(k)}</p>}
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F6FF] p-6">
      <div className="w-full max-w-xl animate-fade-in">
        <img src={logoLong} alt="NestCare" className="mb-8 h-12 object-contain" />
        <h2 className="mb-1 font-display text-3xl font-bold text-black">Patient sign up</h2>
        <p className="mb-8 text-sm text-muted-foreground">
          See your appointments, prescriptions, lab reports and bills online ·{" "}
          <Link to="/login" className="font-bold text-black underline hover:text-[#FA731C]">Sign in</Link>
        </p>

        <div className="mb-6 space-y-1.5">
          <Label htmlFor="clinic">Clinic code</Label>
          <div className="flex gap-2">
            <Input id="clinic" value={clinicCode} onChange={(e) => { setClinicCode(e.target.value); setClinic(null); }} placeholder="Ask your clinic for its code" autoFocus />
            <Button type="button" variant="outline" disabled={!clinicCode.trim() || checking} onClick={check}>
              {checking ? "Checking…" : "Verify"}
            </Button>
          </div>
          {clinic && (
            <p className="flex items-center gap-1 text-sm font-bold text-[#00A070]">
              <CheckCircle2 className="h-4 w-4" /> {clinic.name}
            </p>
          )}
        </div>

        <form onSubmit={submit} noValidate className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${clinic ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!clinic}>
          {field("name", "Full name", <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Asha Verma" autoComplete="name" />, true)}
          {field("email", "Email", <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />)}
          {field("phone", "Mobile number", <PhoneInput id="phone" country={f.country} local={f.phone} onChange={(c, l) => setF((p) => ({ ...p, country: c, phone: l }))} invalid={!!err("phone")} />)}
          {field("dob", "Date of birth", <Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={(e) => set("dob", e.target.value)} />)}
          {field(
            "gender",
            "Gender",
            <select className="h-10 w-full border-2 border-black bg-white px-3 text-sm" value={f.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="undisclosed">Prefer not to say</option>
            </select>,
          )}
          {field("password", "Password", <Input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="Min. 8 chars, Aa + number" autoComplete="new-password" />)}
          {field("confirm", "Confirm password", <Input type="password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} autoComplete="new-password" />)}

          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} />
              <span>I agree to the Terms of Service and Privacy Policy, and consent to the clinic processing my health data to provide care.</span>
            </label>
            {err("terms") && <p className="mt-1 text-xs font-bold text-red-600">{err("terms")}</p>}
          </div>

          <Button type="submit" className="w-full sm:col-span-2" disabled={saving || !clinic}>
            {saving ? "Creating account…" : "Create my account →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
