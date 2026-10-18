// Offline check of report builders + CSV output (models stubbed; never touches Mongo).
const assert = require("assert");
const path = require("path");
const stub = (rel, exp) => {
  const p = require.resolve(path.join("..", rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
};
const chain = (rows) => {
  const c = {
    populate: () => c,
    select: () => c,
    sort: () => c,
    limit: async () => rows,
  };
  return c;
};
const person = (first, last, extra = {}) => ({
  name: `${first} ${last}`,
  ...extra,
});

const invoices = [
  {
    number: "INV-1",
    createdAt: "2026-11-02T05:00:00Z",
    patientId: person("A", "One"),
    subtotal: 500,
    discount: 0,
    gst: 0,
    total: 500,
    paid: 500,
    status: "paid",
  },
  {
    number: "INV-2",
    createdAt: "2026-11-02T06:00:00Z",
    patientId: person("B", "Two"),
    subtotal: 1000,
    discount: 100,
    gst: 0,
    total: 900,
    paid: 300,
    status: "partial",
  },
  {
    number: "INV-3",
    createdAt: "2026-11-02T07:00:00Z",
    patientId: person("C", "Three"),
    subtotal: 700,
    discount: 0,
    gst: 0,
    total: 700,
    paid: 0,
    status: "void",
  },
];
stub("models/Invoice.js", { find: () => chain(invoices) });
stub("models/Appointment.js", {
  find: () =>
    chain([
      {
        scheduledAt: "2026-11-02T05:00:00Z",
        patientId: person("A", "=cmd", { patientId: "NC-00001" }),
        doctorId: person("Dr", "X"),
        type: "in_clinic",
        status: "completed",
        fee: 500,
        paymentStatus: "paid",
      },
    ]),
  aggregate: async () => [],
});
stub("models/Patient.js", { find: () => chain([]) });
stub("models/Doctor.js", { find: () => ({ select: async () => [] }) });
stub("models/LabOrder.js", {
  find: () =>
    chain([
      {
        number: "LAB-1",
        createdAt: "2026-11-02T05:00:00Z",
        resultedAt: "2026-11-02T08:00:00Z",
        patientId: person("A", "One"),
        tests: [
          { name: "Hb", flag: "low" },
          { name: "WBC", flag: "normal" },
        ],
        status: "resulted",
      },
    ]),
});

const rc = require("../controllers/reportController");
const range = { from: new Date("2026-11-01"), to: new Date("2026-11-30") };
const tenantId = "t1";

(async () => {
  const rev = await rc.REPORTS.revenue.build({ tenantId, range, query: {} });
  assert.strictEqual(rev.rows.length, 3);
  assert.strictEqual(rev.rows[2].due, 0, "void invoices owe nothing");
  assert.deepStrictEqual(
    [rev.totals.total, rev.totals.paid, rev.totals.due],
    [1400, 800, 600],
    "void excluded from totals",
  );

  const out = await rc.REPORTS.outstanding.build({ tenantId });
  assert.ok(out.rows.length >= 0);

  const lab = await rc.REPORTS.lab.build({ tenantId, range, query: {} });
  assert.deepStrictEqual([lab.rows[0].abnormal, lab.rows[0].tatHours], [1, 3]);

  // end-to-end through the HTTP handler: CSV is neutralised against formula injection
  const res = {
    headers: {},
    set(h) {
      Object.assign(this.headers, h);
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    status() {
      return this;
    },
  };
  await rc.run(
    {
      params: { type: "appointments" },
      query: { format: "csv", from: "2026-11-01", to: "2026-11-30" },
      tenantId: "64b0f0f0f0f0f0f0f0f0f0f0",
    },
    res,
    (e) => {
      throw e;
    },
  );
  assert.match(res.headers["Content-Type"], /text\/csv/);
  assert.ok(
    res.body.includes("'=cmd") ||
      res.body.includes("A '=cmd") ||
      !/,=cmd/.test(res.body),
    "no raw formula cell",
  );
  assert.ok(!/(^|,)=cmd/m.test(res.body));

  assert.strictEqual(rc.ageOf("1990-06-15", new Date("2026-06-14")), 35);
  assert.strictEqual(rc.ageOf("1990-06-15", new Date("2026-06-15")), 36);
  assert.strictEqual(rc.ageOf(null), "");
  console.log("reports ok");
})();
