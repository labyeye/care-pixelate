import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, authAPI } from "@/services/api";

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function SecuritySettings() {
  const { user, refreshSession } = useAuth();
  const [busy, setBusy] = useState(false);

  // authenticator app
  const [qr, setQr] = useState<{ qrCode: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // WhatsApp phone
  const [phone, setPhone] = useState(user?.phone || "");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Authenticator app (2FA)</CardTitle>
          <CardDescription>
            {user?.totpEnabled
              ? "Enabled. A code is required at every password sign-in."
              : "Add a second step to your password sign-in."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user?.totpEnabled && !qr && (
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  async () => setQr(await authAPI.totpSetup()),
                  "Scan the QR with your authenticator app",
                )
              }
            >
              Set up
            </Button>
          )}
          {!user?.totpEnabled && qr && (
            <div className="space-y-3">
              <img
                src={qr.qrCode}
                alt="Authenticator QR"
                className="h-44 w-44 border-2 border-black"
              />
              <p className="text-xs text-muted-foreground break-all">
                Or enter manually: {qr.secret}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="totp">6-digit code</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(digits(e.target.value))}
                />
              </div>
              <Button
                disabled={busy || totpCode.length < 6}
                onClick={() =>
                  run(async () => {
                    await authAPI.totpVerify(totpCode);
                    setQr(null);
                    setTotpCode("");
                    await refreshSession();
                  }, "Authenticator enabled")
                }
              >
                Enable
              </Button>
            </div>
          )}
          {user?.totpEnabled && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="totp-off">
                  Enter a current code to disable
                </Label>
                <Input
                  id="totp-off"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(digits(e.target.value))}
                />
              </div>
              <Button
                variant="outline"
                disabled={busy || totpCode.length < 6}
                onClick={() =>
                  run(async () => {
                    await authAPI.totpDisable(totpCode);
                    setTotpCode("");
                    await refreshSession();
                  }, "Authenticator disabled")
                }
              >
                Disable
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp phone login</CardTitle>
          <CardDescription>
            {user?.phoneVerified
              ? `Verified (${user.phone}). You can sign in with a WhatsApp OTP.`
              : "Verify your number to sign in with a WhatsApp OTP."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wa-phone">Phone number</Label>
            <Input
              id="wa-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
          {otpSent && (
            <div className="space-y-1.5">
              <Label htmlFor="wa-otp">OTP</Label>
              <Input
                id="wa-otp"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(digits(e.target.value))}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant={otpSent ? "outline" : "default"}
              disabled={busy || !phone.trim()}
              onClick={() =>
                run(async () => {
                  await authAPI.sendPhoneOtp(phone.trim());
                  setOtpSent(true);
                }, "OTP sent to your WhatsApp")
              }
            >
              {otpSent ? "Resend OTP" : "Send OTP"}
            </Button>
            {otpSent && (
              <Button
                disabled={busy || otp.length < 6}
                onClick={() =>
                  run(async () => {
                    await authAPI.verifyPhoneOtp(otp);
                    setOtpSent(false);
                    setOtp("");
                    await refreshSession();
                  }, "Phone verified")
                }
              >
                Verify
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
