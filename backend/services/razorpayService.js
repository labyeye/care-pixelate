const Razorpay = require("razorpay");
const crypto = require("crypto");

// creds lets a caller pass a club's own Razorpay key (so the money lands in
// their account) instead of the platform's default RAZORPAY_KEY_ID/SECRET.
function resolveCreds(creds) {
  const key_id = creds?.key_id || process.env.RAZORPAY_KEY_ID;
  const key_secret = creds?.key_secret || process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env, or connect a Razorpay account in Settings.",
    );
  }
  return { key_id, key_secret };
}

async function createOrder(
  { amount, currency = "INR", receipt, notes = {} },
  creds,
) {
  const { key_id, key_secret } = resolveCreds(creds);
  const client = new Razorpay({ key_id, key_secret });
  const order = await client.orders.create({
    amount: Math.round(amount * 100),
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes,
  });
  return {
    orderId: order.id,
    keyId: key_id,
    amount,
    currency,
  };
}

function verifySignature(
  { razorpayOrderId, razorpayPaymentId, razorpaySignature },
  creds,
) {
  const { key_secret } = resolveCreds(creds);

  const expected = crypto
    .createHmac("sha256", key_secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return expected === razorpaySignature;
}

module.exports = { createOrder, verifySignature };
