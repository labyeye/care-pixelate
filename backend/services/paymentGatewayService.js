// Unified interface over the payment gateways a club can connect in
// Settings. Each createOrder() call returns a shape the frontend can branch
// on via `checkoutMode`:
//   - "modal"    (razorpay, cashfree) — open the gateway's JS/RN SDK inline,
//                 then call confirmPayment() with what the SDK handed back.
//   - "redirect" (phonepe, paytm) — send the browser/webview to `redirectUrl`
//                 (paytm also needs `redirectFields` posted as a form), the
//                 gateway sends the user back to our return URL, and we
//                 confirm by calling the gateway's own status API — never
//                 trust the redirect query params alone.
const crypto = require("crypto");
const razorpayService = require("./razorpayService");
const paytmChecksum = require("./paytmChecksum");

const CASHFREE_BASE =
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const PHONEPE_BASE =
  process.env.PHONEPE_ENV === "production"
    ? "https://api.phonepe.com/apis/hermes"
    : "https://api-preprod.phonepe.com/apis/pg-sandbox";

const PAYTM_BASE =
  process.env.PAYTM_ENV === "production"
    ? "https://securegw.paytm.in"
    : "https://securegw-stage.paytm.in";

function requireCreds(creds, fields, gateway) {
  const missing = fields.filter((f) => !creds?.[f]);
  if (missing.length) {
    throw new Error(
      `${gateway} is not connected — missing ${missing.join(", ")} in Settings.`,
    );
  }
}

// ---------------------------------------------------------------- Cashfree
async function cashfreeCreateOrder({ amount, orderId, customer, returnUrl }, creds) {
  requireCreds(creds, ["appId", "secretKey"], "Cashfree");
  const res = await fetch(`${CASHFREE_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-client-id": creds.appId,
      "x-client-secret": creds.secretKey,
      "x-api-version": "2023-08-01",
    },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone || "9999999999",
        customer_email: customer.email || undefined,
      },
      order_meta: { return_url: returnUrl },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Cashfree order creation failed");
  }
  const checkoutHost =
    process.env.CASHFREE_ENV === "production"
      ? "https://payments.cashfree.com"
      : "https://payments-test.cashfree.com";
  return {
    gateway: "cashfree",
    checkoutMode: "modal",
    orderId,
    providerOrderId: data.order_id,
    paymentSessionId: data.payment_session_id,
    appId: creds.appId,
    // The web app uses the Cashfree JS SDK modal; the mobile app (no
    // native SDK wired in) opens this hosted checkout page in a WebView.
    checkoutUrl: `${checkoutHost}/order/#${data.payment_session_id}`,
    amount,
    currency: "INR",
  };
}

async function cashfreeCheckStatus(orderId, creds) {
  requireCreds(creds, ["appId", "secretKey"], "Cashfree");
  const res = await fetch(`${CASHFREE_BASE}/orders/${orderId}`, {
    headers: {
      "x-client-id": creds.appId,
      "x-client-secret": creds.secretKey,
      "x-api-version": "2023-08-01",
    },
  });
  const data = await res.json();
  return {
    isSuccess: data.order_status === "PAID",
    status: data.order_status,
    raw: data,
  };
}

// ----------------------------------------------------------------- PhonePe
async function phonepeCreateOrder({ amount, orderId, customer, returnUrl }, creds) {
  requireCreds(creds, ["merchantId", "saltKey"], "PhonePe");
  const saltIndex = creds.saltIndex || "1";

  const payload = {
    merchantId: creds.merchantId,
    merchantTransactionId: orderId,
    merchantUserId: String(customer.id).slice(0, 36),
    amount: Math.round(amount * 100),
    redirectUrl: returnUrl,
    redirectMode: "REDIRECT",
    paymentInstrument: { type: "PAY_PAGE" },
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
    "base64",
  );
  const checksum =
    crypto
      .createHash("sha256")
      .update(base64Payload + "/pg/v1/pay" + creds.saltKey)
      .digest("hex") +
    "###" +
    saltIndex;

  const res = await fetch(`${PHONEPE_BASE}/pg/v1/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-VERIFY": checksum,
    },
    body: JSON.stringify({ request: base64Payload }),
  });
  const data = await res.json();
  const redirectUrl = data?.data?.instrumentResponse?.redirectInfo?.url;
  if (!res.ok || !data.success || !redirectUrl) {
    throw new Error(data.message || "PhonePe order creation failed");
  }
  return {
    gateway: "phonepe",
    checkoutMode: "redirect",
    orderId,
    providerOrderId: orderId,
    redirectUrl,
    amount,
    currency: "INR",
  };
}

async function phonepeCheckStatus(orderId, creds) {
  requireCreds(creds, ["merchantId", "saltKey"], "PhonePe");
  const saltIndex = creds.saltIndex || "1";
  const path = `/pg/v1/status/${creds.merchantId}/${orderId}`;
  const checksum =
    crypto
      .createHash("sha256")
      .update(path + creds.saltKey)
      .digest("hex") +
    "###" +
    saltIndex;

  const res = await fetch(`${PHONEPE_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-VERIFY": checksum,
      "X-MERCHANT-ID": creds.merchantId,
    },
  });
  const data = await res.json();
  return {
    isSuccess: data.success && data.code === "PAYMENT_SUCCESS",
    status: data.code,
    raw: data,
  };
}

// ------------------------------------------------------------------ Paytm
async function paytmCreateOrder({ amount, orderId, customer, returnUrl }, creds) {
  requireCreds(creds, ["merchantId", "merchantKey"], "Paytm");

  const body = {
    requestType: "Payment",
    mid: creds.merchantId,
    websiteName: process.env.PAYTM_ENV === "production" ? "DEFAULT" : "WEBSTAGING",
    orderId,
    callbackUrl: returnUrl,
    txnAmount: { value: amount.toFixed(2), currency: "INR" },
    userInfo: { custId: String(customer.id) },
  };
  const checksum = paytmChecksum.generateSignature(
    JSON.stringify(body),
    creds.merchantKey,
  );

  const res = await fetch(
    `${PAYTM_BASE}/theia/api/v1/initiateTransaction?mid=${creds.merchantId}&orderId=${orderId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head: { signature: checksum } }),
    },
  );
  const data = await res.json();
  const txnToken = data?.body?.txnToken;
  if (data?.body?.resultInfo?.resultStatus !== "S" || !txnToken) {
    throw new Error(
      data?.body?.resultInfo?.resultMsg || "Paytm order creation failed",
    );
  }
  return {
    gateway: "paytm",
    checkoutMode: "redirect",
    orderId,
    providerOrderId: orderId,
    redirectUrl: `${PAYTM_BASE}/theia/api/v1/showPaymentPage?mid=${creds.merchantId}&orderId=${orderId}`,
    redirectFields: { mid: creds.merchantId, orderId, txnToken },
    amount,
    currency: "INR",
  };
}

async function paytmCheckStatus(orderId, creds) {
  requireCreds(creds, ["merchantId", "merchantKey"], "Paytm");
  const body = { mid: creds.merchantId, orderId };
  const checksum = paytmChecksum.generateSignature(
    JSON.stringify(body),
    creds.merchantKey,
  );
  const res = await fetch(
    `${PAYTM_BASE}/v3/order/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, head: { signature: checksum } }),
    },
  );
  const data = await res.json();
  return {
    isSuccess: data?.body?.resultInfo?.resultStatus === "TXN_SUCCESS",
    status: data?.body?.resultInfo?.resultStatus,
    raw: data,
  };
}

// --------------------------------------------------------------- Dispatch
// creds is the shape stored in Setting, already picked per gateway by the
// caller (see controllers' getCompanyPaymentCreds helper).
async function createOrder(gateway, creds, { amount, orderId, customer, returnUrl }) {
  switch (gateway) {
    case "cashfree":
      return cashfreeCreateOrder({ amount, orderId, customer, returnUrl }, creds);
    case "phonepe":
      return phonepeCreateOrder({ amount, orderId, customer, returnUrl }, creds);
    case "paytm":
      return paytmCreateOrder({ amount, orderId, customer, returnUrl }, creds);
    case "razorpay":
    default: {
      const result = await razorpayService.createOrder(
        { amount, receipt: orderId, notes: { orderId } },
        creds ? { key_id: creds.keyId, key_secret: creds.keySecret } : undefined,
      );
      return {
        gateway: "razorpay",
        checkoutMode: "modal",
        orderId: result.orderId,
        providerOrderId: result.orderId,
        keyId: result.keyId,
        amount,
        currency: "INR",
      };
    }
  }
}

// For modal gateways this is called right after the SDK callback (payload
// carries whatever the SDK handed back); for redirect gateways this is
// called from the return-page poll (payload is ignored, we ask the gateway
// directly by providerOrderId).
async function confirmPayment(gateway, creds, providerOrderId, payload) {
  switch (gateway) {
    case "cashfree":
      return cashfreeCheckStatus(providerOrderId, creds);
    case "phonepe":
      return phonepeCheckStatus(providerOrderId, creds);
    case "paytm":
      return paytmCheckStatus(providerOrderId, creds);
    case "razorpay":
    default: {
      const isValid = razorpayService.verifySignature(
        payload,
        creds ? { key_id: creds.keyId, key_secret: creds.keySecret } : undefined,
      );
      return { isSuccess: isValid, status: isValid ? "PAID" : "FAILED" };
    }
  }
}

module.exports = { createOrder, confirmPayment };
