// Organisation payment-gateway settings: validation, safe public view, and credential lookup.
// Secrets are write-only: a blank secret on save means "keep the stored one".
const PROVIDERS = ["razorpay", "cashfree", "phonepe", "paytm"];
const SECRETS = [
  "razorpayKeySecret",
  "cashfreeSecretKey",
  "phonepeSaltKey",
  "paytmMerchantKey",
];
const PLAIN = [
  "razorpayKeyId",
  "cashfreeAppId",
  "phonepeMerchantId",
  "phonepeSaltIndex",
  "paytmMerchantId",
];
// Which fields each gateway needs before it can take money.
const NEEDS = {
  razorpay: ["razorpayKeyId", "razorpayKeySecret"],
  cashfree: ["cashfreeAppId", "cashfreeSecretKey"],
  phonepe: ["phonepeMerchantId", "phonepeSaltKey"],
  paytm: ["paytmMerchantId", "paytmMerchantKey"],
};

// -> flat $set ("paymentConfig.provider": ...). Throws a readable Error on bad input.
function sanitizePaymentConfig(body = {}) {
  const set = {};
  if (body.provider !== undefined) {
    if (!PROVIDERS.includes(body.provider))
      throw new Error("Unsupported payment gateway");
    set["paymentConfig.provider"] = body.provider;
  }
  if (typeof body.enabled === "boolean")
    set["paymentConfig.enabled"] = body.enabled;
  for (const k of [...PLAIN, ...SECRETS]) {
    if (typeof body[k] !== "string") continue;
    const v = body[k].trim();
    if (!v && SECRETS.includes(k)) continue; // keep stored secret
    if (v.length > 200 || /\s/.test(v))
      throw new Error("Gateway keys cannot contain spaces");
    set[`paymentConfig.${k}`] = v;
  }
  if (
    set["paymentConfig.razorpayKeyId"] &&
    !/^rzp_(test|live)_\w+$/.test(set["paymentConfig.razorpayKeyId"])
  ) {
    throw new Error(
      "Razorpay Key ID looks like rzp_live_XXXX or rzp_test_XXXX",
    );
  }
  return set;
}

// `t` must have been loaded with the secret fields selected to know "configured".
function isConfigured(pc = {}) {
  return (NEEDS[pc.provider || "razorpay"] || []).every((f) => !!pc[f]);
}

// What the UI may see: ids + booleans, never secrets.
function publicView(pc = {}) {
  const out = {
    provider: pc.provider || "razorpay",
    enabled: !!pc.enabled,
    configured: isConfigured(pc),
    phonepeSaltIndex: pc.phonepeSaltIndex || "1",
  };
  for (const k of PLAIN) if (k !== "phonepeSaltIndex") out[k] = pc[k] || "";
  for (const k of SECRETS) out[k + "Set"] = !!pc[k];
  return out;
}

// -> { gateway, creds } in the shape services/paymentGatewayService expects, or null if online payments are off/incomplete.
function credsOf(pc = {}) {
  if (!pc.enabled || !isConfigured(pc)) return null;
  const g = pc.provider || "razorpay";
  const creds = {
    razorpay: { keyId: pc.razorpayKeyId, keySecret: pc.razorpayKeySecret },
    cashfree: { appId: pc.cashfreeAppId, secretKey: pc.cashfreeSecretKey },
    phonepe: {
      merchantId: pc.phonepeMerchantId,
      saltKey: pc.phonepeSaltKey,
      saltIndex: pc.phonepeSaltIndex,
    },
    paytm: { merchantId: pc.paytmMerchantId, merchantKey: pc.paytmMerchantKey },
  }[g];
  return { gateway: g, creds };
}

const SELECT_SECRETS = SECRETS.map((s) => `+paymentConfig.${s}`).join(" ");
async function credsFor(tenantId) {
  const t = await require("../models/Tenant")
    .findById(tenantId)
    .select(SELECT_SECRETS);
  return credsOf(t?.paymentConfig);
}

module.exports = {
  sanitizePaymentConfig,
  publicView,
  credsOf,
  credsFor,
  isConfigured,
  SELECT_SECRETS,
};

if (require.main === module) {
  const assert = require("assert");
  const s = sanitizePaymentConfig({
    provider: "razorpay",
    enabled: true,
    razorpayKeyId: "rzp_test_abc123",
    razorpayKeySecret: "  ",
    evil: 1,
  });
  assert.deepStrictEqual(
    s,
    {
      "paymentConfig.provider": "razorpay",
      "paymentConfig.enabled": true,
      "paymentConfig.razorpayKeyId": "rzp_test_abc123",
    },
    "blank secret kept, unknown ignored",
  );
  assert.throws(
    () => sanitizePaymentConfig({ provider: "stripe" }),
    /Unsupported/,
  );
  assert.throws(() => sanitizePaymentConfig({ razorpayKeyId: "abc" }), /rzp_/);
  assert.throws(
    () => sanitizePaymentConfig({ paytmMerchantKey: "a b" }),
    /spaces/,
  );
  const pc = {
    provider: "cashfree",
    enabled: true,
    cashfreeAppId: "app",
    cashfreeSecretKey: "shh",
  };
  assert.deepStrictEqual(credsOf(pc), {
    gateway: "cashfree",
    creds: { appId: "app", secretKey: "shh" },
  });
  assert.strictEqual(credsOf({ ...pc, enabled: false }), null);
  assert.strictEqual(credsOf({ ...pc, cashfreeSecretKey: "" }), null);
  const v = publicView(pc);
  assert.ok(
    v.cashfreeSecretKeySet &&
      v.configured &&
      !JSON.stringify(v).includes("shh"),
    "secret never in public view",
  );
  console.log("paymentConfig ok");
}
