// Validation for Settings -> organisation details. Turns the request body into a flat Mongo $set
// ("contact.phone": "...") and throws a readable Error on the first bad field. Unknown keys are ignored.
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Colombo", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"];
const CURRENCIES = ["INR", "USD", "AED", "GBP", "EUR", "SGD", "AUD", "NPR", "BDT", "LKR"];
const LANGUAGES = ["en", "hi", "mr", "gu", "ta", "te", "kn", "ml", "bn", "pa"];

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LOGO = /^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https:\/\/\S+)$/;

const fail = (msg) => {
  throw new Error(msg);
};

function sanitizeSettings(body = {}) {
  const set = {};
  const str = (path, v, max, label) => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if (t.length > max) fail(`${label} is too long (max ${max} characters)`);
    set[path] = t;
    return t;
  };
  const check = (path, v, re, label, example, transform = (x) => x) => {
    if (typeof v !== "string") return;
    const t = transform(v.trim());
    if (t && !re.test(t)) fail(`${label} looks like ${example}`);
    set[path] = t;
  };
  const oneOf = (path, v, list, label) => {
    if (typeof v !== "string") return;
    if (!list.includes(v)) fail(`${label} is not supported`);
    set[path] = v;
  };

  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (n.length < 2 || n.length > 120) fail("Organisation name must be 2-120 characters");
    set.name = n;
  }

  const b = body.branding || {};
  str("branding.appName", b.appName, 60, "Display name");
  for (const k of ["primaryColor", "secondaryColor"]) check(`branding.${k}`, b[k], /^#[0-9a-f]{6}$/i, "Colour", "#024BAB");
  if (typeof b.logoUrl === "string") {
    const l = b.logoUrl.trim();
    if (l && (l.length > 350_000 || !LOGO.test(l))) fail("Logo must be a PNG/JPEG/WebP image under about 250 KB");
    set["branding.logoUrl"] = l;
  }

  const c = body.contact || {};
  check("contact.email", c.email, EMAIL, "Email", "name@clinic.com");
  if (typeof c.phone === "string") {
    const d = c.phone.replace(/\D/g, "").slice(-10);
    if (d && d.length !== 10) fail("Phone must be a 10-digit number");
    set["contact.phone"] = d;
  }
  check("contact.website", c.website, /^https?:\/\/\S+\.\S+$/i, "Website", "https://clinic.com");
  str("contact.address", c.address, 300, "Address");
  str("contact.city", c.city, 80, "City");
  str("contact.state", c.state, 80, "State");
  check("contact.pincode", c.pincode, /^\d{6}$/, "Pincode", "411001");
  oneOf("contact.timezone", c.timezone, TIMEZONES, "That timezone");
  oneOf("contact.currency", c.currency, CURRENCIES, "That currency");
  oneOf("contact.language", c.language, LANGUAGES, "That language");

  const g = body.gstDetails || {};
  check("gstDetails.gstin", g.gstin, GSTIN, "GSTIN", "27ABCDE1234F1Z5", (x) => x.toUpperCase());
  check("gstDetails.pan", g.pan, PAN, "PAN", "ABCDE1234F", (x) => x.toUpperCase());
  str("gstDetails.legalName", g.legalName, 120, "Legal name");

  const k = body.bank || {};
  str("bank.accountHolder", k.accountHolder, 100, "Account holder");
  str("bank.bankName", k.bankName, 100, "Bank name");
  str("bank.branch", k.branch, 100, "Branch");
  check("bank.accountNumber", k.accountNumber, /^\d{9,18}$/, "Account number", "9-18 digits", (x) => x.replace(/\s/g, ""));
  check("bank.ifsc", k.ifsc, IFSC, "IFSC", "SBIN0001234", (x) => x.toUpperCase());
  if (typeof k.accountType === "string") oneOf("bank.accountType", k.accountType || "current", ["current", "savings"], "Account type");
  check("bank.upiId", k.upiId, UPI, "UPI ID", "clinic@bank");

  const inv = body.invoiceSettings || {};
  str("invoiceSettings.terms", inv.terms, 1000, "Terms");
  str("invoiceSettings.footerNote", inv.footerNote, 200, "Footer note");
  str("invoiceSettings.signatoryName", inv.signatoryName, 80, "Signatory name");
  str("invoiceSettings.signatoryTitle", inv.signatoryTitle, 80, "Signatory title");
  if (typeof inv.showBank === "boolean") set["invoiceSettings.showBank"] = inv.showBank;

  return set;
}

module.exports = { sanitizeSettings, TIMEZONES, CURRENCIES, LANGUAGES };

if (require.main === module) {
  const assert = require("assert");
  const ok = sanitizeSettings({
    name: " Sharma Clinic ",
    contact: { phone: "+91 98765 43210", pincode: "411001", currency: "INR", website: "https://sharma.in" },
    gstDetails: { gstin: "27abcde1234f1z5", pan: "abcde1234f" },
    bank: { ifsc: "sbin0001234", accountNumber: "1234 5678 9012", upiId: "clinic@okhdfc", accountType: "savings" },
    invoiceSettings: { showBank: false, terms: "Pay within 7 days" },
    branding: { primaryColor: "#024BAB", logoUrl: "data:image/png;base64,iVBORw0KGgo=" },
  });
  assert.strictEqual(ok.name, "Sharma Clinic");
  assert.strictEqual(ok["contact.phone"], "9876543210");
  assert.strictEqual(ok["gstDetails.gstin"], "27ABCDE1234F1Z5");
  assert.strictEqual(ok["bank.ifsc"], "SBIN0001234");
  assert.strictEqual(ok["bank.accountNumber"], "123456789012");
  assert.strictEqual(ok["invoiceSettings.showBank"], false);
  assert.deepStrictEqual(sanitizeSettings({ contact: { email: "" } }), { "contact.email": "" }, "clearing a field is allowed");
  assert.deepStrictEqual(sanitizeSettings({ evil: { $where: "x" }, bank: { notAField: 1 } }), {}, "unknown keys ignored");
  assert.throws(() => sanitizeSettings({ gstDetails: { gstin: "123" } }), /GSTIN/);
  assert.throws(() => sanitizeSettings({ bank: { ifsc: "BAD" } }), /IFSC/);
  assert.throws(() => sanitizeSettings({ bank: { accountNumber: "12" } }), /Account number/);
  assert.throws(() => sanitizeSettings({ branding: { logoUrl: "javascript:alert(1)" } }), /Logo/);
  assert.throws(() => sanitizeSettings({ branding: { logoUrl: "data:image/svg+xml;base64,PHN2Zz4=" } }), /Logo/);
  assert.throws(() => sanitizeSettings({ contact: { currency: "XYZ" } }), /currency/);
  assert.throws(() => sanitizeSettings({ contact: { phone: "123" } }), /10-digit/);
  assert.throws(() => sanitizeSettings({ name: "x" }), /Organisation name/);
  console.log("tenantSettings ok");
}
