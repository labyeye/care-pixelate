// Terms & Privacy acceptance: an "action required" bar plus a blocking agreement modal, shown to a signed-in user
// until they accept the current version (backend: /api/legal, utils/terms.js — it refuses every other API call
// with TERMS_REQUIRED until then). Same component in every Nest product; only PRODUCT below differs.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { legalAPI } from "@/services/api";

const PRODUCT = {
  name: "NestDoc",
  tab: "nestcare", // tab on the privacy policy page
  stores: "patients and their health records, appointments, prescriptions, lab and pharmacy data, invoices, doctors and staff",
};
const SITE = "https://www.pixelatenest.com/legal";

type Status = { version: string; required: boolean; accepted: boolean };

export default function TermsGate() {
  const { isAuthenticated } = useAuth() as { isAuthenticated: boolean };
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(true);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(() => {
    if (!isAuthenticated) return setStatus(null);
    legalAPI.status().then(setStatus).catch(() => {});
  }, [isAuthenticated]);
  useEffect(check, [check]);
  useEffect(() => {
    // a newer version may have been published while this tab stayed open
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [check]);

  const pending = !!status && status.required && !status.accepted;
  useEffect(() => {
    if (!pending) return;
    const prev = document.body.style.paddingTop;
    document.body.style.paddingTop = "48px";
    return () => {
      document.body.style.paddingTop = prev;
    };
  }, [pending]);

  if (!pending) return null;

  async function accept() {
    setBusy(true);
    setError("");
    try {
      setStatus(await legalAPI.accept());
    } catch (e: any) {
      setError(e?.message || "Could not save your acceptance. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const link = (page: string, hash = "") => `${SITE}/${page}.html${hash}`;
  const h = "font-semibold text-gray-900 mt-4 mb-1";
  const ul = "list-disc pl-5 space-y-1";

  return (
    <>
      <div
        role="alert"
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100000, height: 48 }}
        className="flex items-center justify-between gap-3 bg-amber-500 px-4 text-sm font-medium text-black shadow"
      >
        <span>
          <b>Action required:</b> accept the {PRODUCT.name} Terms &amp; Privacy Policy. Your account is paused until you do.
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded bg-black px-3 py-1 text-white"
        >
          Review &amp; accept
        </button>
      </div>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100001, background: "rgba(0,0,0,.6)" }}
          className="flex items-center justify-center p-3"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Terms and Privacy Policy"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-lg bg-white text-gray-700 shadow-2xl"
          >
            <div className="border-b px-5 py-4">
              <h2 className="text-lg font-bold text-gray-900">Terms &amp; Privacy Policy — {PRODUCT.name}</h2>
              <p className="text-xs text-gray-500">Version {status!.version} · Pixelate Nest (Kalahanu Tech Studios LLP)</p>
            </div>

            <div className="overflow-y-auto px-5 py-3 text-sm leading-relaxed">
              <p>
                Please read and accept this before you continue. It applies to you and, where you act for a business, to that
                business.
              </p>

              <h3 className={h}>1. Your data is stored on our servers</h3>
              <p>
                Everything you or your team enter in {PRODUCT.name} — {PRODUCT.stores} — is stored on servers operated by Pixelate
                Nest and its infrastructure providers, not on your own device or premises. You stay the owner of your data. We
                process it only to run {PRODUCT.name} for you, keep it protected, back it up and support you. We never sell it
                or use it for advertising.
              </p>

              <h3 className={h}>2. What we track inside {PRODUCT.name}</h3>
              <ul className={ul}>
                <li>
                  <b>Sign-ins and security:</b> last-login time, IP address, browser/device and active sessions, failed-login
                  attempts and OTP/2-step checks — to stop misuse and let you sign out lost devices.
                </li>
                <li>
                  <b>Usage:</b> which screens you open (page path only, never what is on them), your user ID, role, account ID,
                  whether you use web or mobile app, and app version.
                </li>
                <li>
                  <b>Crashes and errors:</b> the error message, technical stack trace and the screen it happened on — to fix bugs.
                </li>
                <li>
                  <b>Performance:</b> counts of requests, failures and response times (no request contents).
                </li>
                <li>
                  <b>Activity / audit log:</b> who created, changed or deleted which record and when, visible to your account
                  admins.
                </li>
              </ul>
              <p className="mt-2">
                Usage and crash events are deleted after 90 days and performance counters after 30 days. We do not record
                keystrokes or screens, and {PRODUCT.name} contains no third-party advertising or analytics trackers. The
                Pixelate Nest team can see these figures and your acceptance record in our internal dashboard.
              </p>

              <h3 className={h}>3. Your responsibilities</h3>
              <ul className={ul}>
                <li>You are allowed to enter the personal data you add, and have told the people concerned where required.</li>
                <li>Keep your login safe, use accurate information and do not misuse or resell the service.</li>
                <li>Plans, billing, refunds, limits and service rules are in the Terms of Service.</li>
              </ul>

              <h3 className={h}>4. Your rights</h3>
              <p>
                You can ask us to access, correct or delete your data, or withdraw consent, by writing to{" "}
                <a className="text-blue-700 underline" href="mailto:support@pixelatenest.com">
                  support@pixelatenest.com
                </a>
                . Deleting your data ends your use of the service.
              </p>

              <p className="mt-3">
                Read in full:{" "}
                <a className="text-blue-700 underline" href={link("terms-of-service")} target="_blank" rel="noreferrer">
                  Terms of Service
                </a>{" "}
                ·{" "}
                <a className="text-blue-700 underline" href={link("privacy-policy", `#${PRODUCT.tab}`)} target="_blank" rel="noreferrer">
                  {PRODUCT.name} Privacy Policy
                </a>
              </p>
            </div>

            <div className="border-t px-5 py-4">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  I have read and agree to the Terms of Service and the {PRODUCT.name} Privacy Policy, including that all data is
                  stored on Pixelate Nest servers and the tracking described above.
                </span>
              </label>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded border px-4 py-2 text-sm">
                  Later
                </button>
                <button
                  type="button"
                  disabled={!agree || busy}
                  onClick={accept}
                  className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Accept & continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
