import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  Eye,
  EyeOff,
  Pill,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, authAPI, type PhoneChoice } from "@/services/api";
import logoShort from "@/assets/logos/logo-short.png";
import logoLong from "@/assets/logos/logo-long.png";
import loginDash from "@/assets/login-dash.png";

const features = [
  { icon: Users, label: "Patient Records" },
  { icon: CalendarCheck, label: "Appointments" },
  { icon: Stethoscope, label: "Doctors & Staff" },
  { icon: Pill, label: "Billing & Pharmacy" },
];

type Mode = "email" | "phone" | "2fa" | "select";

const labelCls =
  "block text-xs font-bold text-black uppercase tracking-wider mb-1.5";
const inputCls =
  "w-full px-4 py-3 border-2 border-black text-sm font-medium bg-white focus:outline-none transition-colors";
const codeCls =
  "w-full px-4 py-3 border-2 border-black text-lg font-bold tracking-[0.5em] text-center bg-white focus:outline-none transition-colors";

export default function LoginPage() {
  const { login, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [pendingToken, setPendingToken] = useState("");
  const [tfaCode, setTfaCode] = useState("");

  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  // Shared phone number: after the OTP, pick which account to open.
  const [choices, setChoices] = useState<PhoneChoice[]>([]);
  const [selectionToken, setSelectionToken] = useState("");

  // Runs an async step with shared loading/error handling.
  const run = async (fn: () => Promise<void>, fallback: string) => {
    setError("");
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    await refreshSession();
    navigate("/dashboard");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await login(email, password);
      if (res.pendingToken) {
        setPendingToken(res.pendingToken);
        setMode("2fa");
      } else {
        navigate("/dashboard");
      }
    }, "Login failed. Please check your credentials.");
  };

  const handle2FA = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authAPI.verify2FA(pendingToken, tfaCode);
      await finish();
    }, "Invalid code. Try again.");
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await authAPI.loginSendOtp(phone.trim());
      setOtpSent(true);
    }, "Failed to send OTP. Please try again.");
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await authAPI.loginVerifyOtp(phone.trim(), otp);
      if (res.requiresSelection && res.choices && res.selectionToken) {
        setChoices(res.choices);
        setSelectionToken(res.selectionToken);
        setOtp("");
        setMode("select");
        return;
      }
      await finish();
    }, "Invalid or expired OTP.");
  };

  const handleSelect = (userId: string) => {
    run(async () => {
      await authAPI.loginSelect(selectionToken, userId);
      await finish();
    }, "Could not sign in. Please request a new OTP.");
  };

  const backTo = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-2 text-xs font-bold text-gray-500 hover:text-black transition-colors"
    >
      ← {label}
    </button>
  );

  const submitBtn = (text: string, disabled = false) => (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full bg-[#024BAB] text-white py-3.5 text-sm font-bold border-2 border-black hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#0a0a0a] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Please wait...
        </>
      ) : (
        <>
          {text} <ArrowRight className="w-4 h-4" />
        </>
      )}
    </button>
  );

  const heading = (icon: React.ReactNode, title: string, sub: string) => (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <h2 className="text-2xl font-display font-bold text-black">{title}</h2>
      </div>
      <p className="text-sm text-gray-500 font-medium">{sub}</p>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#024BAB] flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10 flex items-center gap-3">
          <img
            src={logoShort}
            alt="NestDoc"
            className="w-14 h-14 object-contain"
          />

          <span className="font-display font-bold text-white text-2xl">
            NestDoc
          </span>
        </div>

        <img
          src={loginDash}
          alt="Dashboard preview"
          className="relative z-10 max-w-auto mx-auto"
        />

        <div className="relative z-10">
          <h1 className="text-3xl xl:text-4xl font-display font-bold text-white leading-tight mb-5">
            Every patient.
            
            Every appointment.
            
            One place.
          </h1>
          <p className="text-white/70 text-base font-medium max-w-sm">
            Run your clinic or hospital from a single workspace and never miss a
            visit again.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap gap-2">
          {features.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-2 text-white text-sm font-bold"
            >
              <Icon className="w-4 h-4 text-white/70" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 bg-white flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <img
              src={logoLong}
              alt="NestDoc"
              className="h-12 object-contain"
            />
          </div>

          {mode === "2fa" ? (
            <>
              {heading(
                <ShieldCheck className="w-7 h-7 text-[#024BAB]" />,
                "Two-Factor Auth",
                "Enter the 6-digit code from your authenticator app.",
              )}
            </>
          ) : mode === "select" ? (
            <>
              {heading(
                <UserRound className="w-7 h-7 text-[#024BAB]" />,
                "Who is signing in?",
                "More than one account uses this phone number. Choose yours.",
              )}
            </>
          ) : mode === "phone" ? (
            <>
              {heading(
                <Smartphone className="w-7 h-7 text-[#024BAB]" />,
                otpSent ? "Enter OTP" : "Phone Login",
                otpSent
                  ? "We sent a 6-digit OTP to your WhatsApp."
                  : "We'll send a one-time password to your WhatsApp.",
              )}
            </>
          ) : (
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-black">
                Welcome back
              </h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">
                Sign in to your healthcare workspace
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border-2 border-red-400 text-red-600 text-sm px-3 py-2.5 mb-5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {mode === "2fa" && (
            <form onSubmit={handle2FA} className="space-y-5 login-anim">
              <div>
                <label className={labelCls}>Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={tfaCode}
                  onChange={(e) => {
                    setTfaCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  placeholder="000000"
                  className={codeCls}
                  autoFocus
                  maxLength={6}
                />
              </div>
              {submitBtn("Verify", tfaCode.length < 6)}
              {backTo("Back to login", () => {
                setMode("email");
                setTfaCode("");
                setPendingToken("");
                setError("");
              })}
            </form>
          )}

          {mode === "phone" && !otpSent && (
            <form onSubmit={handleSendOtp} className="space-y-5 login-anim">
              <div>
                <label className={labelCls}>Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError("");
                  }}
                  placeholder="+91 98765 43210"
                  className={inputCls}
                  required
                  autoFocus
                />
              </div>
              {submitBtn("Send OTP on WhatsApp", !phone.trim())}
              {backTo("Sign in with Email", () => {
                setMode("email");
                setPhone("");
                setError("");
              })}
            </form>
          )}

          {mode === "select" && (
            <div className="space-y-3">
              {choices.map((c) => {
                const meta = [
                  c.patientId,
                  c.age != null ? `${c.age} yrs` : "",
                  c.gender,
                  c.role !== "patient" ? c.role.replace(/_/g, " ") : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={c.userId}
                    type="button"
                    disabled={loading}
                    onClick={() => handleSelect(c.userId)}
                    className="flex w-full items-center gap-3 border-2 border-black bg-white p-3 text-left transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_#0a0a0a] disabled:opacity-60"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-black bg-[#024BAB] text-lg font-bold text-white">
                      {c.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold capitalize text-black">
                        {c.name}
                      </span>
                      <span className="block truncate text-xs capitalize text-gray-500">
                        {meta}
                      </span>
                      <span className="block truncate text-xs text-gray-400">
                        {[c.clinic, c.email].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </button>
                );
              })}
              {backTo("Use a different number", () => {
                setMode("phone");
                setOtpSent(false);
                setOtp("");
                setChoices([]);
                setSelectionToken("");
                setError("");
              })}
            </div>
          )}

          {mode === "phone" && otpSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-5 login-anim">
              <div>
                <label className={labelCls}>WhatsApp OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  placeholder="000000"
                  className={codeCls}
                  autoFocus
                  maxLength={6}
                />
              </div>
              {submitBtn("Verify OTP", otp.length < 6)}
              {backTo("Change number / Resend", () => {
                setOtpSent(false);
                setOtp("");
                setError("");
              })}
            </form>
          )}

          {mode === "email" && (
            <>
              <form onSubmit={handleLogin} className="space-y-5 login-anim">
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    placeholder="you@hospital.com"
                    className={inputCls}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-black uppercase tracking-wider">
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-bold text-[#024BAB] hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="flex border-2 border-black transition-colors">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      placeholder="Your password"
                      className="flex-1 px-4 py-3 bg-white text-sm font-medium outline-none"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="px-3 border-l-2 border-black hover:bg-gray-50 transition-colors"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? (
                        <EyeOff className="w-4 h-4 text-black" />
                      ) : (
                        <Eye className="w-4 h-4 text-black" />
                      )}
                    </button>
                  </div>
                </div>

                {submitBtn("Sign In")}
              </form>

              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-black/10" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Or continue with
                  </span>
                  <div className="flex-1 h-px bg-black/10" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode("phone");
                    setError("");
                  }}
                  className="w-full flex items-center justify-center gap-2 border-2 border-black py-2.5 text-xs font-bold text-black hover:bg-gray-50 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#0a0a0a] transition-all"
                >
                  <Smartphone className="w-4 h-4 text-[#024BAB]" />
                  Phone OTP
                </button>
              </div>

              <div className="mt-6 pt-6 border-t-2 border-black/10 text-center">
                <p className="text-xs text-gray-500">
                  New organisation?{" "}
                  <Link
                    to="/register"
                    className="font-bold text-[#024BAB] hover:underline transition-colors"
                  >
                    Register your practice
                  </Link>
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Patient?{" "}
                  <Link
                    to="/register-patient"
                    className="font-bold text-[#024BAB] hover:underline transition-colors"
                  >
                    Create your patient account
                  </Link>
                </p>
              </div>
            </>
          )}
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}

function LegalFooter() {
  return (
    <p className="text-xs text-gray-500 mt-4 text-center">
      © 2026 Pixelate Nest. All rights reserved.{" "}
      <a
        href="https://www.pixelatenest.com/legal/privacy-policy.html"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-[#024BAB] hover:underline"
      >
        Privacy Policy
      </a>
      {" · "}
      <a
        href="https://www.pixelatenest.com/legal/terms-of-service.html"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-[#024BAB] hover:underline"
      >
        Terms of Service
      </a>
    </p>
  );
}
