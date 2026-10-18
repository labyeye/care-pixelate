// Validates a Designer template (Tenant.invoiceTemplate / Tenant.consultationTemplate) before it is stored. The shape
// mirrors frontend/src/lib/invoiceTemplate.ts. Anything unknown is dropped, numbers are clamped,
// colours must be #rrggbb and images must be small PNG/JPEG data URLs, so a tenant can't store
// arbitrary HTML/URLs or an oversized blob that every PDF render then has to load.

const MAX_BLOCKS = 40;
const MAX_FLOATS = 30;
const MAX_IMAGE_CHARS = 600000;
const MAX_TOTAL_CHARS = 3000000; // under the 5mb JSON body limit with room for the rest of Settings
const MAX_TEXT = 1000;

const ALIGN = ["left", "center", "right"];
// "b" boolean, "s" text, "c" #rrggbb or empty, "i" image data URL or empty,
// ["a","b"] one of these strings, [min, max] a number in range.
const BLOCKS = {
  title: { text: "s", subtitle: "s", align: ALIGN, filled: "b" },
  header: {
    layout: ["split", "stacked"],
    swap: "b",
    logoAlign: ALIGN,
    logoWidth: [40, 300],
    logoHeight: [10, 200],
    logoSrc: "i",
    showLogo: "b",
    showAddress: "b",
    showContact: "b",
    showTaxIds: "b",
    showMeta: "b",
    showPlace: "b",
  },
  parties: {
    label: "s",
    showEmail: "b",
    showPhone: "b",
    showGst: "b",
    showDoctor: "b",
  },
  items: {
    sno: "b",
    hsn: "b",
    qty: "b",
    unit: "b",
    rate: "b",
    discount: "b",
    gst: "b",
    amount: "b",
    details: "b",
    zebra: "b",
    minRows: [0, 20],
    accentHeader: "b",
    descLabel: "s",
  },
  words: { label: "s", tint: "b" },
  summary: {
    showBank: "b",
    showTerms: "b",
    showTotals: "b",
    showPayments: "b",
    totalsSide: ["left", "right"],
    termsLabel: "s",
  },
  taxSummary: {},
  footer: {
    showDeclaration: "b",
    declaration: "s",
    showSignature: "b",
    signatoryLabel: "s",
    signatureSrc: "i",
    signatureWidth: [30, 300],
    signatureHeight: [10, 150],
  },
  note: {
    text: "s",
    size: [6, 30],
    align: ALIGN,
    bold: "b",
    color: "c",
    fill: "c",
  },
  image: { src: "i", width: [20, 500], height: [10, 400], align: ALIGN },
  spacer: { height: [2, 200] },
  divider: { thickness: [0.5, 8], color: "c" },
  // consultation (prescription) blocks
  patientInfo: {
    label: "s",
    doctorLabel: "s",
    showContact: "b",
    showDoctor: "b",
    showAllergies: "b",
  },
  vitals: { label: "s" },
  clinical: {
    showComplaints: "b",
    showDiagnosis: "b",
    showNotes: "b",
    complaintsLabel: "s",
    diagnosisLabel: "s",
    notesLabel: "s",
  },
  medicines: {
    label: "s",
    sno: "b",
    dose: "b",
    frequency: "b",
    days: "b",
    instructions: "b",
    zebra: "b",
    accentHeader: "b",
    minRows: [0, 20],
  },
  advice: {
    showAdvice: "b",
    showFollowUp: "b",
    adviceLabel: "s",
    followUpLabel: "s",
  },
};

// Width (% of the row) and minimum height (pt) for every block; the items table and tax summary
// keep the full width, so only their height is allowed.
for (const [type, spec] of Object.entries(BLOCKS)) {
  if (type !== "items" && type !== "taxSummary" && type !== "medicines")
    spec.w = [10, 100];
  spec.h = [0, 800];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const IMG = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

const fail = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  throw err;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const id = (v, i) =>
  typeof v === "string" && /^[\w-]{1,40}$/.test(v)
    ? v
    : `x${Date.now().toString(36)}${i}`;

function image(v) {
  if (v === "" || v == null) return "";
  if (typeof v !== "string" || !IMG.test(v))
    fail("Images must be PNG or JPEG.");
  if (v.length > MAX_IMAGE_CHARS)
    fail("One of the images is too large. Use a smaller one.");
  return v;
}

function prop(spec, v) {
  if (spec === "b") return typeof v === "boolean" ? v : undefined;
  if (spec === "s")
    return typeof v === "string" ? v.slice(0, MAX_TEXT) : undefined;
  if (spec === "c")
    return v === "" || (typeof v === "string" && HEX.test(v)) ? v : "";
  if (spec === "i") return image(v);
  if (typeof spec[0] === "string") return spec.includes(v) ? v : undefined;
  return isNum(v) ? clamp(v, spec[0], spec[1]) : undefined;
}

function sanitizeInvoiceTemplate(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks))
    fail("Invalid invoice template.");
  if (raw.blocks.length > MAX_BLOCKS) fail(`At most ${MAX_BLOCKS} blocks.`);
  const rawFloats = Array.isArray(raw.floats) ? raw.floats : [];
  if (rawFloats.length > MAX_FLOATS)
    fail(`At most ${MAX_FLOATS} images/text boxes.`);

  const th = raw.theme || {};
  const color = (v, d) => (typeof v === "string" && HEX.test(v) ? v : d);
  const theme = {
    primary: color(th.primary, "#024BAB"),
    text: color(th.text, "#111111"),
    muted: color(th.muted, "#666666"),
    border: color(th.border, "#222222"),
    headerBg: color(th.headerBg, "#ececec"),
    font: ["Helvetica", "Times", "Courier"].includes(th.font)
      ? th.font
      : "Helvetica",
    scale: isNum(th.scale) ? clamp(th.scale, 0.8, 1.3) : 1,
    borders: ["full", "lines", "none"].includes(th.borders)
      ? th.borders
      : "full",
    margin: isNum(th.margin) ? clamp(th.margin, 8, 60) : 22,
  };

  const blocks = raw.blocks
    .filter(
      (b) =>
        b &&
        typeof b === "object" &&
        Object.prototype.hasOwnProperty.call(BLOCKS, b.type),
    )
    .map((b, i) => {
      const props = {};
      for (const [key, spec] of Object.entries(BLOCKS[b.type])) {
        const v = prop(spec, (b.props || {})[key]);
        if (v !== undefined) props[key] = v;
      }
      return {
        id: id(b.id, i),
        type: b.type,
        visible: b.visible !== false,
        props,
      };
    });

  const floats = rawFloats
    .filter((f) => f && (f.kind === "image" || f.kind === "text"))
    .map((f, i) => {
      const n = (v, lo, hi, d) => (isNum(v) ? clamp(v, lo, hi) : d);
      return {
        id: id(f.id, i),
        kind: f.kind,
        visible: f.visible !== false,
        x: n(f.x, 0, 100, 0),
        y: n(f.y, 0, 100, 0),
        w: n(f.w, 1, 100, 20),
        h: n(f.h, 1, 100, 10),
        src: f.kind === "image" ? image(f.src) : "",
        text:
          f.kind === "text" && typeof f.text === "string"
            ? f.text.slice(0, 500)
            : "",
        size: n(f.size, 6, 80, 12),
        color: color(f.color, "#111111"),
        bold: f.bold === true,
        align: ALIGN.includes(f.align) ? f.align : "left",
        opacity: n(f.opacity, 0.05, 1, 1),
        back: f.back === true,
        allPages: f.allPages === true,
      };
    });

  const clean = { v: 1, theme, blocks, floats };
  if (JSON.stringify(clean).length > MAX_TOTAL_CHARS)
    fail("The design is too large. Remove or shrink some images.");
  return clean;
}

module.exports = { sanitizeInvoiceTemplate };
