import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { paymentsAPI, portalAPI } from "@/services/api";

// PhonePe / Paytm send the browser back here. We never trust the query string: the server asks the gateway
// itself whether the order was paid before marking anything settled.
export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"verifying" | "ok" | "failed">("verifying");
  const [msg, setMsg] = useState("");
  const patient = params.get("as") === "patient";

  useEffect(() => {
    const appointmentId = params.get("appointmentId");
    const orderId = params.get("orderId");
    if (!appointmentId || !orderId) {
      setMsg("No order was received from the payment gateway.");
      setState("failed");
      return;
    }
    (patient ? portalAPI.payVerify(appointmentId, orderId) : paymentsAPI.verify(appointmentId, orderId))
      .then(() => setState("ok"))
      .catch((e: Error) => {
        setMsg(e.message || "Payment verification failed.");
        setState("failed");
      });
  }, []);

  const back = () => navigate(patient ? "/my/appointments" : "/appointments", { replace: true });
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F6FF] px-6 py-12">
      <div className="w-full max-w-md border-2 border-black bg-white p-8 text-center">
        {state === "verifying" && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-[#024BAB]" />
            <h2 className="mb-2 text-xl font-bold">Confirming your payment</h2>
            <p className="text-sm text-gray-500">Please wait while we verify it with the bank…</p>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
            <h2 className="mb-2 text-xl font-bold">Payment successful</h2>
            <p className="mb-6 text-sm text-gray-500">Your payment has been verified and recorded.</p>
            <button onClick={back} className="w-full border-2 border-black bg-[#024BAB] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-[#023590]">Continue</button>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h2 className="mb-2 text-xl font-bold">Verification failed</h2>
            <p className="mb-6 text-sm text-gray-500">{msg}</p>
            <button onClick={back} className="mb-3 w-full border-2 border-black bg-[#024BAB] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-[#023590]">Back</button>
            <p className="text-xs text-gray-400">If money was deducted it will show as pending shortly. Contact the clinic if it does not clear.</p>
          </>
        )}
      </div>
    </div>
  );
}
