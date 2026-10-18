// Checkout for the organisation's own gateway. Razorpay / Cashfree open inline; PhonePe / Paytm redirect
// away and are confirmed on /payment-return (the server re-asks the gateway either way).
export interface PayOrder {
  appointmentId: string;
  gateway: "razorpay" | "cashfree" | "phonepe" | "paytm";
  checkoutMode: "modal" | "redirect";
  orderId: string;
  keyId?: string;
  paymentSessionId?: string;
  redirectUrl?: string;
  redirectFields?: Record<string, string>;
  amount: number;
  currency: string;
}

const loadScript = (src: string, probe: () => unknown): Promise<boolean> =>
  new Promise((resolve) => {
    if (probe()) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

function redirect(order: PayOrder) {
  if (!order.redirectUrl) return;
  if (!order.redirectFields) {
    window.location.href = order.redirectUrl;
    return;
  }
  const form = document.createElement("form"); // Paytm needs a form POST
  form.method = "POST";
  form.action = order.redirectUrl;
  for (const [k, v] of Object.entries(order.redirectFields)) {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = k;
    i.value = v;
    form.appendChild(i);
  }
  document.body.appendChild(form);
  form.submit();
}

/** Resolves true once paid and verified, false if the user closed the window; redirect gateways never resolve (page leaves). */
export async function runCheckout(
  order: PayOrder,
  label: string,
  verify: (extra: {
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    razorpayOrderId?: string;
  }) => Promise<unknown>,
): Promise<boolean> {
  if (order.checkoutMode === "redirect") {
    redirect(order);
    return new Promise<boolean>(() => {});
  }
  const w = window as unknown as {
    Razorpay: new (o: unknown) => { open(): void };
    Cashfree: (
      o: unknown,
    ) => Promise<{ checkout(o: unknown): Promise<{ error?: unknown }> }>;
  };
  if (order.gateway === "cashfree") {
    if (
      !(await loadScript(
        "https://sdk.cashfree.com/js/v3/cashfree.js",
        () => w.Cashfree,
      ))
    )
      throw new Error("Could not load Cashfree checkout");
    const cf = await w.Cashfree({
      mode: import.meta.env.PROD ? "production" : "sandbox",
    });
    const r = await cf.checkout({
      paymentSessionId: order.paymentSessionId,
      redirectTarget: "_modal",
    });
    if (r.error) return false;
    await verify({});
    return true;
  }
  if (
    !(await loadScript(
      "https://checkout.razorpay.com/v1/checkout.js",
      () => w.Razorpay,
    ))
  )
    throw new Error("Could not load Razorpay checkout");
  return new Promise<boolean>((resolve, reject) => {
    new w.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount * 100,
      currency: order.currency,
      name: label,
      description: "Consultation fee",
      theme: { color: "#024BAB" },
      handler: (r: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) =>
        verify({
          razorpayOrderId: r.razorpay_order_id,
          razorpayPaymentId: r.razorpay_payment_id,
          razorpaySignature: r.razorpay_signature,
        }).then(() => resolve(true), reject),
      modal: { ondismiss: () => resolve(false) },
    }).open();
  });
}
