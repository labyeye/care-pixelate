// Offline check of org payment config + appointment pay/verify (models and gateway stubbed; nothing hits the network or DB).
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};

let tenantPc = {
  provider: "razorpay",
  enabled: true,
  razorpayKeyId: "rzp_test_1",
  razorpayKeySecret: "sec",
};
let appt,
  invoices = [],
  confirmOk = true,
  built = [];
stub("models/Tenant.js", {
  findById: () => ({ select: async () => ({ paymentConfig: tenantPc }) }),
  findByIdAndUpdate: (_id, u) => ({
    select: async () => {
      for (const [k, v] of Object.entries(u.$set))
        tenantPc[k.split(".")[1]] = v;
      return { paymentConfig: tenantPc };
    },
  }),
  updateOne: async () => {},
});
stub("models/Appointment.js", {
  findOne: (f) => {
    const q = {
      select: async () =>
        appt && String(appt._id) === String(f._id) ? appt : null,
      then: (r) => r(appt && String(appt._id) === String(f._id) ? appt : null),
    };
    return q;
  },
  updateOne: async (_f, u) => {
    appt.payment = {
      ...appt.payment,
      gateway: u.$set["payment.gateway"],
      orderId: u.$set["payment.orderId"],
    };
  },
  findOneAndUpdate: async (f, u) => {
    if (appt.paymentStatus !== f.paymentStatus) return null;
    appt.paymentStatus = "paid";
    appt.payment.paymentId = u.$set["payment.paymentId"];
    return appt;
  },
});
stub("models/Invoice.js", {
  findOne: async () => null,
  exists: async () => false,
});
stub("services/paymentGatewayService.js", {
  createOrder: async (g, creds, o) => ({
    gateway: g,
    checkoutMode: "modal",
    orderId: "order_X",
    keyId: creds.keyId,
    amount: o.amount,
  }),
  confirmPayment: async () => ({ isSuccess: confirmOk }),
});
stub("controllers/invoiceController.js", {
  build: async (_r, _s, d) => {
    built.push(d);
  },
});
stub("utils/invoice.js", { statusFor: () => "paid", r2: (x) => x });

const c = require("../controllers/paymentController");
const call = async (fn, req) => {
  const res = {
    code: 200,
    status(x) {
      this.code = x;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  try {
    await fn(
      { tenantId: "t1", user: { _id: "u1" }, params: {}, body: {}, ...req },
      res,
      (e) => {
        throw e;
      },
    );
  } catch (e) {
    res.err = e.message;
  }
  return res;
};

(async () => {
  // config is write-only for secrets
  let r = await call(c.getConfig, {});
  assert.ok(
    r.body.data.razorpayKeySecretSet &&
      !JSON.stringify(r.body).includes('sec"'),
    "secret never returned",
  );
  r = await call(c.updateConfig, {
    body: { provider: "cashfree", enabled: true },
  });
  assert.match(r.err, /Enter all keys/, "cannot enable an incomplete gateway");
  tenantPc = {
    provider: "razorpay",
    enabled: true,
    razorpayKeyId: "rzp_test_1",
    razorpayKeySecret: "sec",
  };

  // order: only for unpaid, fee > 0 appointments, only when the org enabled online payments
  appt = {
    _id: "a1",
    status: "scheduled",
    paymentStatus: "unpaid",
    fee: 500,
    patientId: "p1",
    doctorId: "d1",
    payment: {},
  };
  r = await call(c.staffOrder, { params: { id: "a1" } });
  assert.strictEqual(r.body.data.amount, 500);
  assert.strictEqual(appt.payment.orderId, "order_X");
  tenantPc.enabled = false;
  assert.match(
    (await call(c.staffOrder, { params: { id: "a1" } })).err,
    /not set up/,
  );
  tenantPc.enabled = true;
  appt.paymentStatus = "paid";
  assert.match(
    (await call(c.staffOrder, { params: { id: "a1" } })).err,
    /already settled/,
  );
  appt.paymentStatus = "unpaid";
  appt.fee = 0;
  assert.match(
    (await call(c.staffOrder, { params: { id: "a1" } })).err,
    /no fee/,
  );
  appt.fee = 500;

  // verify: wrong order id rejected; gateway refusal rejected; success flips once and books the invoice
  assert.match(
    (
      await call(c.staffVerify, {
        body: { appointmentId: "a1", orderId: "nope" },
      })
    ).err,
    /not found/,
  );
  confirmOk = false;
  assert.match(
    (
      await call(c.staffVerify, {
        body: { appointmentId: "a1", orderId: "order_X" },
      })
    ).err,
    /could not be verified/,
  );
  confirmOk = true;
  r = await call(c.staffVerify, {
    body: {
      appointmentId: "a1",
      orderId: "order_X",
      razorpayPaymentId: "pay_1",
    },
  });
  assert.strictEqual(appt.paymentStatus, "paid");
  assert.strictEqual(built.length, 1);
  assert.deepStrictEqual(built[0].initialPayment, {
    amount: 500,
    mode: "online",
    reference: "pay_1",
  });
  await call(c.staffVerify, {
    body: { appointmentId: "a1", orderId: "order_X" },
  });
  assert.strictEqual(built.length, 1, "second verify must not double-book");
  console.log("payments ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
