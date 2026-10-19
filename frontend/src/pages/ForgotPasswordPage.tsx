import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ApiError, authAPI } from "@/services/api";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
        <h2 className="text-2xl font-display font-bold text-black mb-1">
          Forgot password?
        </h2>
        {sent ? (
          <p className="text-sm text-gray-500 font-medium mt-2">
            If an account exists for <b>{email}</b>, a reset link is on its way.
            It expires in 1 hour.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500 font-medium mb-8">
              Enter Email address and we'll send you a reset link.
            </p>
            {error && (
              <div className="bg-red-50 border-2 border-red-400 text-red-600 text-sm px-3 py-2.5 mb-5 font-medium">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5 login-anim">
              <div>
                <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@hospital.com"
                  className="w-full px-4 py-3 border-2 border-black text-sm font-medium bg-white focus:outline-none transition-colors"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#024BAB] text-white py-3.5 text-sm font-bold border-2 border-black hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#0a0a0a] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  "Please wait..."
                ) : (
                  <>
                    Send reset link <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
        <Link
          to="/login"
          className="block text-center mt-6 text-xs font-bold text-gray-500 hover:text-black"
        >
          ← Back to login
        </Link>
    </AuthShell>
  );
}
