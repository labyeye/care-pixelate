import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ApiError, authAPI } from "@/services/api";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ResetPasswordPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8)
      return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setError("");
    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      toast.success("Password reset. Please sign in.");
      navigate("/login");
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

  const field = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setError("");
        }}
        className="w-full px-4 py-3 border-2 border-black text-sm font-medium bg-white focus:outline-none transition-colors"
        required
        autoComplete="new-password"
      />
    </div>
  );

  return (
    <AuthShell>
        <h2 className="text-2xl font-display font-bold text-black mb-1">
          Set a new password
        </h2>
        <p className="text-sm text-gray-500 font-medium mb-8">
          Choose at least 8 characters.
        </p>
        {error && (
          <div className="bg-red-50 border-2 border-red-400 text-red-600 text-sm px-3 py-2.5 mb-5 font-medium">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5 login-anim">
          {field("New password", password, setPassword)}
          {field("Confirm password", confirm, setConfirm)}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#024BAB] text-white py-3.5 text-sm font-bold border-2 border-black hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#0a0a0a] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              "Please wait..."
            ) : (
              <>
                Reset password <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
        <Link
          to="/login"
          className="block text-center mt-6 text-xs font-bold text-gray-500 hover:text-black"
        >
          ← Back to login
        </Link>
    </AuthShell>
  );
}
