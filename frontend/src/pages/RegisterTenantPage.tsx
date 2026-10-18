import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  composePhone,
  DEFAULT_COUNTRY,
  PhoneInput,
  validatePhone,
} from "@/components/ui/phone-input";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/api";
import logoLong from "@/assets/logos/logo-long.png";

type Form = {
  name: string;
  email: string;
  country: string;
  phone: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Mirrors the backend rules in authController.registerAccount.
function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const name = f.name.trim();
  if (name.length < 2 || name.length > 80) e.name = "Enter 2–80 characters";
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address";
  const phoneErr = validatePhone(f.country, f.phone);
  if (phoneErr) e.phone = phoneErr;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(f.password)) {
    e.password = "8+ characters with uppercase, lowercase and a number";
  }
  if (f.confirmPassword !== f.password)
    e.confirmPassword = "Passwords do not match";
  if (!f.acceptTerms)
    e.acceptTerms = "Please accept the Terms and Privacy Policy";
  return e;
}

/**
 * Step 1 of onboarding (same shape as NestHR): create the account, then the
 * wizard at /onboarding collects organisation, team size, plan and payment.
 */
export default function RegisterTenantPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>({
    name: "",
    email: "",
    country: DEFAULT_COUNTRY,
    phone: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>(
    {},
  );
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errors = validate(form);
  // An error shows once the field was touched or a submit was attempted.
  const err = (k: keyof Form) =>
    submitted || touched[k] ? errors[k] : undefined;
  const touch = (k: keyof Form) => () =>
    setTouched((t) => ({ ...t, [k]: true }));
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const field = (
    k: keyof Form,
    label: string,
    input: React.ReactNode,
    wide = false,
  ) => (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={k}>{label}</Label>
      {input}
      {err(k) && <p className="text-xs font-bold text-red-600">{err(k)}</p>}
    </div>
  );

  const text = (
    k: Exclude<keyof Form, "acceptTerms">,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) =>
    field(
      k,
      label,
      <Input
        id={k}
        value={form[k] as string}
        onChange={(e) => set(k, e.target.value as never)}
        onBlur={touch(k)}
        aria-invalid={!!err(k)}
        className={err(k) ? "border-red-500" : undefined}
        {...props}
      />,
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setIsSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: composePhone(form.country, form.phone),
        password: form.password,
        acceptTerms: form.acceptTerms,
      });
      navigate("/onboarding");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Registration failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F6FF] p-6">
      <div className="w-full max-w-xl animate-fade-in">
        <img
          src={logoLong}
          alt="NestCare"
          className="mb-8 h-12 object-contain"
        />

        <h2 className="mb-1 font-display text-3xl font-bold text-black">
          Create account
        </h2>
        <p className="mb-8 text-sm text-muted-foreground">
          Set up your NestCare workspace ·{" "}
          <Link
            to="/login"
            className="font-bold text-black underline hover:text-[#FA731C] transition-colors"
          >
            Sign in
          </Link>
        </p>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {text("name", "Full name", {
            placeholder: "Dr. Jane Doe",
            autoComplete: "name",
            autoFocus: true,
          })}
          {text("email", "Email", {
            type: "email",
            placeholder: "you@hospital.com",
            autoComplete: "email",
          })}

          {field(
            "phone",
            "Mobile number (WhatsApp)",
            <PhoneInput
              id="phone"
              country={form.country}
              local={form.phone}
              onChange={(c, l) =>
                setForm((p) => ({ ...p, country: c, phone: l }))
              }
              onBlur={touch("phone")}
              invalid={!!err("phone")}
            />,
            true,
          )}

          {text("password", "Password", {
            type: "password",
            placeholder: "Min. 8 chars, Aa + number",
            autoComplete: "new-password",
          })}
          {text("confirmPassword", "Confirm password", {
            type: "password",
            placeholder: "Re-enter password",
            autoComplete: "new-password",
          })}

          <div className="sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.acceptTerms}
                onChange={(e) => set("acceptTerms", e.target.checked)}
                onBlur={touch("acceptTerms")}
              />
              <span>
                I agree to the Terms of Service and Privacy Policy, and consent
                to my data being processed to run my workspace.
              </span>
            </label>
            {err("acceptTerms") && (
              <p className="mt-1 text-xs font-bold text-red-600">
                {err("acceptTerms")}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full sm:col-span-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Create Account →"}
          </Button>
        </form>
      </div>
    </div>
  );
}
