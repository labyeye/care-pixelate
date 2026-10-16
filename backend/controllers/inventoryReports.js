// Medicine-inventory and vendor reports. Same contract as reportController's REPORTS:
// build({ tenantId, query }) -> { columns, rows, totals }. All are point-in-time snapshots (no date range).
// A report's `filters` are rendered by the Reports page; `source` options are filled in by the list endpoint.
const Medicine = require("../models/Medicine");
const Vendor = require("../models/Vendor");

const DAY = 24 * 60 * 60 * 1000;
const MAX_ROWS = 5000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const col = (key, label, numeric = false) => ({ key, label, numeric });
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "");
const daysTo = (d) => (d ? Math.floor((new Date(d).getTime() - Date.now()) / DAY) : null);
const cap = (s) => String(s || "").replace(/_/g, " ");
const sum = (rows, k) => r2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));

const VENDOR_FILTER = { key: "vendor", label: "Vendor", source: "vendors", allLabel: "All vendors", extra: [{ value: "none", label: "No vendor assigned" }] };
const CATEGORY_FILTER = { key: "category", label: "Category", source: "categories", allLabel: "All categories" };

const stockState = (m) => (!m.trackInventory ? "not tracked" : m.stockQty === 0 ? "out" : m.stockQty <= m.reorderLevel ? "low" : "ok");

const POPULATE = "vendorId businessName phone";

// Medicines for this tenant narrowed by the common filters.
async function medicines(tenantId, query, extra = {}) {
  const f = { tenantId, ...extra };
  if (query.vendor === "none") f.vendor = null;
  else if (/^[0-9a-f]{24}$/i.test(String(query.vendor || ""))) f.vendor = String(query.vendor);
  if (query.category) f.category = String(query.category);
  if (query.form) f.dosageForm = String(query.form);
  return Medicine.find(f).populate("vendor", POPULATE).sort({ name: 1, strength: 1 }).limit(MAX_ROWS).lean();
}

const vendorName = (m) => m.vendor?.businessName || "— none —";
const label = (m) => (m.strength ? `${m.name} (${m.strength})` : m.name);

const REPORTS = {
  "stock-on-hand": {
    title: "Stock on hand",
    category: "inventory",
    desc: "Every medicine with quantity, reorder level, expiry, supplier and stock value at selling price.",
    roles: "inventory",
    snapshot: true,
    filters: [
      { key: "stock", label: "Stock level", options: [{ value: "ok", label: "In stock" }, { value: "low", label: "Low" }, { value: "out", label: "Out of stock" }], allLabel: "All stock levels" },
      VENDOR_FILTER,
      CATEGORY_FILTER,
    ],
    async build({ tenantId, query }) {
      let items = await medicines(tenantId, query);
      if (query.stock) items = items.filter((m) => stockState(m) === query.stock);
      const rows = items.map((m) => ({
        id: m.medicineId, medicine: label(m), category: m.category || "", vendor: vendorName(m),
        qty: m.stockQty, unit: m.unit, reorder: m.reorderLevel, state: stockState(m),
        expiry: day(m.expiryDate), price: r2(m.sellingPrice), value: r2(m.stockQty * m.sellingPrice),
      }));
      return {
        columns: [col("id", "ID"), col("medicine", "Medicine"), col("category", "Category"), col("vendor", "Vendor"), col("qty", "Qty", true), col("unit", "Unit"), col("reorder", "Reorder at", true), col("state", "State"), col("expiry", "Earliest expiry"), col("price", "Price (₹)", true), col("value", "Value (₹)", true)],
        rows,
        totals: { medicine: `${rows.length} medicines`, qty: sum(rows, "qty"), value: sum(rows, "value") },
      };
    },
  },

  "reorder-list": {
    title: "Reorder list",
    category: "inventory",
    desc: "Active medicines at or below their reorder level, grouped by vendor with a suggested order quantity (to twice the reorder level).",
    roles: "inventory",
    snapshot: true,
    filters: [VENDOR_FILTER, CATEGORY_FILTER],
    async build({ tenantId, query }) {
      const items = (await medicines(tenantId, query, { trackInventory: true, isActive: true })).filter((m) => m.stockQty <= m.reorderLevel);
      const rows = items
        .map((m) => {
          const suggest = Math.max(m.reorderLevel * 2 - m.stockQty, 1);
          return {
            vendor: vendorName(m), phone: m.vendor?.phone || "", medicine: label(m), qty: m.stockQty, reorder: m.reorderLevel,
            state: stockState(m), suggest, unit: m.unit, value: r2(suggest * m.sellingPrice),
          };
        })
        .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.medicine.localeCompare(b.medicine));
      return {
        columns: [col("vendor", "Vendor"), col("phone", "Vendor phone"), col("medicine", "Medicine"), col("qty", "On hand", true), col("reorder", "Reorder at", true), col("state", "State"), col("suggest", "Suggested order", true), col("unit", "Unit"), col("value", "Est. value (₹)", true)],
        rows,
        totals: { medicine: `${rows.length} to reorder`, suggest: sum(rows, "suggest"), value: sum(rows, "value") },
      };
    },
  },

  "expiry-tracker": {
    title: "Expiry tracker",
    category: "inventory",
    desc: "Stock already expired or expiring within the chosen window, with the value at risk and the supplier to return it to.",
    roles: "inventory",
    snapshot: true,
    filters: [
      { key: "window", label: "Window", options: [{ value: "0", label: "Expired only" }, { value: "30", label: "Within 30 days" }, { value: "60", label: "Within 60 days" }, { value: "180", label: "Within 180 days" }], allLabel: "Within 90 days" },
      VENDOR_FILTER,
      CATEGORY_FILTER,
    ],
    async build({ tenantId, query }) {
      const win = query.window === undefined || query.window === "" ? 90 : Math.max(0, Math.min(Number(query.window) || 0, 730));
      const items = (await medicines(tenantId, query, { stockQty: { $gt: 0 }, expiryDate: { $ne: null, $lte: new Date(Date.now() + win * DAY) } })).sort(
        (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate),
      );
      const rows = items.map((m) => {
        const left = daysTo(m.expiryDate);
        return {
          medicine: label(m), vendor: vendorName(m), qty: m.stockQty, unit: m.unit, expiry: day(m.expiryDate),
          daysLeft: left, state: left < 0 ? "expired" : "soon", value: r2(m.stockQty * m.sellingPrice),
        };
      });
      const expired = rows.filter((r) => r.state === "expired");
      return {
        columns: [col("medicine", "Medicine"), col("vendor", "Vendor"), col("qty", "Qty", true), col("unit", "Unit"), col("expiry", "Expiry"), col("daysLeft", "Days left", true), col("state", "State"), col("value", "Value at risk (₹)", true)],
        rows,
        totals: { medicine: `${rows.length} lines · ${expired.length} expired`, qty: sum(rows, "qty"), value: sum(rows, "value") },
      };
    },
  },

  "category-summary": {
    title: "Category-wise stock",
    category: "inventory",
    desc: "Medicines, units, stock value and low / out-of-stock counts rolled up by category.",
    roles: "inventory",
    snapshot: true,
    filters: [VENDOR_FILTER],
    async build({ tenantId, query }) {
      const by = new Map();
      for (const m of await medicines(tenantId, query)) {
        const k = m.category || "Uncategorised";
        const g = by.get(k) || { category: k, medicines: 0, units: 0, value: 0, low: 0, out: 0 };
        g.medicines++;
        g.units += m.stockQty;
        g.value += m.stockQty * m.sellingPrice;
        const s = stockState(m);
        if (s === "low") g.low++;
        if (s === "out") g.out++;
        by.set(k, g);
      }
      const rows = [...by.values()].map((g) => ({ ...g, value: r2(g.value) })).sort((a, b) => b.value - a.value);
      return {
        columns: [col("category", "Category"), col("medicines", "Medicines", true), col("units", "Units on hand", true), col("value", "Stock value (₹)", true), col("low", "Low", true), col("out", "Out", true)],
        rows,
        totals: { category: "Total", medicines: sum(rows, "medicines"), units: sum(rows, "units"), value: sum(rows, "value"), low: sum(rows, "low"), out: sum(rows, "out") },
      };
    },
  },

  "price-list": {
    title: "Price list & margins",
    category: "inventory",
    desc: "MRP, selling price, discount off MRP, GST rate and HSN code for every medicine.",
    roles: "inventory",
    snapshot: true,
    filters: [VENDOR_FILTER, CATEGORY_FILTER],
    async build({ tenantId, query }) {
      const rows = (await medicines(tenantId, query)).map((m) => ({
        id: m.medicineId, medicine: label(m), category: m.category || "", vendor: vendorName(m), mrp: r2(m.mrp), price: r2(m.sellingPrice),
        discount: m.mrp ? r2(((m.mrp - m.sellingPrice) / m.mrp) * 100) : 0, gst: m.gstRate, hsn: m.hsnCode || "", rx: m.prescriptionRequired ? "Rx" : "OTC",
      }));
      return {
        columns: [col("id", "ID"), col("medicine", "Medicine"), col("category", "Category"), col("vendor", "Vendor"), col("mrp", "MRP (₹)", true), col("price", "Selling (₹)", true), col("discount", "Discount %", true), col("gst", "GST %", true), col("hsn", "HSN"), col("rx", "Rx")],
        rows,
        totals: { medicine: `${rows.length} medicines` },
      };
    },
  },

  "schedule-summary": {
    title: "Schedule & Rx summary",
    category: "inventory",
    desc: "Medicines grouped by drug schedule (OTC, H, H1, X …) with prescription-only counts and stock — useful for licence inspections.",
    roles: "inventory",
    snapshot: true,
    filters: [VENDOR_FILTER],
    async build({ tenantId, query }) {
      const by = new Map();
      for (const m of await medicines(tenantId, query)) {
        const k = m.scheduleCategory || "Unspecified";
        const g = by.get(k) || { schedule: k, medicines: 0, rx: 0, units: 0, value: 0 };
        g.medicines++;
        if (m.prescriptionRequired) g.rx++;
        g.units += m.stockQty;
        g.value += m.stockQty * m.sellingPrice;
        by.set(k, g);
      }
      const rows = [...by.values()].map((g) => ({ ...g, value: r2(g.value) })).sort((a, b) => a.schedule.localeCompare(b.schedule));
      return {
        columns: [col("schedule", "Schedule"), col("medicines", "Medicines", true), col("rx", "Rx required", true), col("units", "Units on hand", true), col("value", "Stock value (₹)", true)],
        rows,
        totals: { schedule: "Total", medicines: sum(rows, "medicines"), rx: sum(rows, "rx"), units: sum(rows, "units"), value: sum(rows, "value") },
      };
    },
  },

  "vendor-directory": {
    title: "Vendor directory",
    category: "vendors",
    desc: "All vendors with contact person, phone, GSTIN, drug licence, payment terms, credit limit and status.",
    roles: "inventory",
    snapshot: true,
    filters: [
      { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "blocked", label: "Blocked" }], allLabel: "All statuses" },
      { key: "type", label: "Type", options: ["manufacturer", "distributor", "wholesaler", "retailer", "other"].map((v) => ({ value: v, label: v })), allLabel: "All types" },
    ],
    async build({ tenantId, query }) {
      const f = { tenantId };
      if (["active", "inactive", "blocked"].includes(query.status)) f.status = query.status;
      if (query.type) f.vendorType = String(query.type);
      const items = await Vendor.find(f).sort({ businessName: 1 }).limit(MAX_ROWS).lean();
      const rows = items.map((v) => ({
        id: v.vendorId, vendor: v.businessName, type: cap(v.vendorType), contact: v.contactPerson?.name || "", phone: v.phone,
        email: v.email || "", city: v.address?.city || "", gstin: v.gstin || "", licence: v.drugLicenseNumber || "",
        terms: cap(v.paymentTerms), credit: r2(v.creditLimit), status: v.status,
      }));
      return {
        columns: [col("id", "ID"), col("vendor", "Vendor"), col("type", "Type"), col("contact", "Contact"), col("phone", "Phone"), col("email", "Email"), col("city", "City"), col("gstin", "GSTIN"), col("licence", "Drug licence"), col("terms", "Terms"), col("credit", "Credit limit (₹)", true), col("status", "Status")],
        rows,
        totals: { vendor: `${rows.length} vendors`, credit: sum(rows, "credit") },
      };
    },
  },

  "vendor-supply": {
    title: "Vendor-wise supply",
    category: "vendors",
    desc: "Per vendor: how many medicines they supply, units on hand, stock value, and how many lines are low, out of stock or expiring within 90 days.",
    roles: "inventory",
    snapshot: true,
    filters: [],
    async build({ tenantId }) {
      const vendors = await Vendor.find({ tenantId }).select("vendorId businessName status").lean();
      const by = new Map(vendors.map((v) => [String(v._id), { vendor: v.businessName, id: v.vendorId, status: v.status, medicines: 0, units: 0, value: 0, low: 0, out: 0, expiring: 0 }]));
      by.set("none", { vendor: "— No vendor assigned —", id: "", status: "", medicines: 0, units: 0, value: 0, low: 0, out: 0, expiring: 0 });
      const soon = Date.now() + 90 * DAY;
      for (const m of await Medicine.find({ tenantId }).select("vendor stockQty sellingPrice reorderLevel trackInventory expiryDate").limit(MAX_ROWS * 4).lean()) {
        const g = by.get(m.vendor ? String(m.vendor) : "none");
        if (!g) continue;
        g.medicines++;
        g.units += m.stockQty;
        g.value += m.stockQty * m.sellingPrice;
        const s = stockState(m);
        if (s === "low") g.low++;
        if (s === "out") g.out++;
        if (m.stockQty > 0 && m.expiryDate && new Date(m.expiryDate).getTime() <= soon) g.expiring++;
      }
      const rows = [...by.values()]
        .filter((g) => g.medicines > 0 || g.id)
        .map((g) => ({ ...g, value: r2(g.value) }))
        .sort((a, b) => b.value - a.value);
      return {
        columns: [col("vendor", "Vendor"), col("id", "ID"), col("status", "Status"), col("medicines", "Medicines", true), col("units", "Units on hand", true), col("value", "Stock value (₹)", true), col("low", "Low", true), col("out", "Out", true), col("expiring", "Expiring ≤90d", true)],
        rows,
        totals: { vendor: "Total", medicines: sum(rows, "medicines"), units: sum(rows, "units"), value: sum(rows, "value"), low: sum(rows, "low"), out: sum(rows, "out"), expiring: sum(rows, "expiring") },
      };
    },
  },

  "vendor-medicines": {
    title: "Vendor × medicine",
    category: "vendors",
    desc: "Which medicine comes from which vendor, with current stock, price and expiry. Pick a vendor to get their complete catalogue.",
    roles: "inventory",
    snapshot: true,
    filters: [VENDOR_FILTER, CATEGORY_FILTER],
    async build({ tenantId, query }) {
      const items = (await medicines(tenantId, query)).sort((a, b) => vendorName(a).localeCompare(vendorName(b)) || a.name.localeCompare(b.name));
      const rows = items.map((m) => ({
        vendor: vendorName(m), medicine: label(m), category: m.category || "", mfr: m.manufacturer || "", qty: m.stockQty, unit: m.unit,
        price: r2(m.sellingPrice), value: r2(m.stockQty * m.sellingPrice), expiry: day(m.expiryDate), state: stockState(m),
      }));
      return {
        columns: [col("vendor", "Vendor"), col("medicine", "Medicine"), col("category", "Category"), col("mfr", "Manufacturer"), col("qty", "Qty", true), col("unit", "Unit"), col("price", "Price (₹)", true), col("value", "Value (₹)", true), col("expiry", "Expiry"), col("state", "State")],
        rows,
        totals: { vendor: `${rows.length} lines`, qty: sum(rows, "qty"), value: sum(rows, "value") },
      };
    },
  },

  "vendor-licences": {
    title: "Drug licence tracker",
    category: "vendors",
    desc: "Vendor drug-licence numbers and expiry dates, soonest first, flagging expired and due-within-60-days licences.",
    roles: "inventory",
    snapshot: true,
    filters: [],
    async build({ tenantId }) {
      const items = await Vendor.find({ tenantId }).limit(MAX_ROWS).lean();
      const rows = items
        .map((v) => {
          const left = daysTo(v.drugLicenseExpiry);
          return {
            vendor: v.businessName, id: v.vendorId, licence: v.drugLicenseNumber || "", expiry: day(v.drugLicenseExpiry), daysLeft: left ?? "",
            state: left === null ? "missing" : left < 0 ? "expired" : left <= 60 ? "soon" : "ok",
            status: v.status, _sort: left === null ? Infinity : left,
          };
        })
        .sort((a, b) => a._sort - b._sort)
        .map(({ _sort, ...r }) => r);
      return {
        columns: [col("vendor", "Vendor"), col("id", "ID"), col("licence", "Licence no."), col("expiry", "Expiry"), col("daysLeft", "Days left", true), col("state", "Licence"), col("status", "Vendor status")],
        rows,
        totals: { vendor: `${rows.length} vendors · ${rows.filter((r) => r.state === "expired").length} expired · ${rows.filter((r) => r.state === "soon").length} due soon` },
      };
    },
  },

  "vendor-balances": {
    title: "Vendor credit & balances",
    category: "vendors",
    desc: "Payment terms, credit limit, opening balance owed and credit used per vendor, next to the stock value they supply.",
    roles: "inventory",
    snapshot: true,
    filters: [],
    async build({ tenantId }) {
      const vendors = await Vendor.find({ tenantId }).limit(MAX_ROWS).lean();
      const stock = new Map();
      for (const m of await Medicine.find({ tenantId, vendor: { $ne: null } }).select("vendor stockQty sellingPrice").limit(MAX_ROWS * 4).lean()) {
        stock.set(String(m.vendor), (stock.get(String(m.vendor)) || 0) + m.stockQty * m.sellingPrice);
      }
      const rows = vendors
        .map((v) => ({
          vendor: v.businessName, id: v.vendorId, terms: cap(v.paymentTerms), credit: r2(v.creditLimit), balance: r2(v.openingBalance),
          used: v.creditLimit ? r2((v.openingBalance / v.creditLimit) * 100) : "", stockValue: r2(stock.get(String(v._id))), status: v.status,
        }))
        .sort((a, b) => b.balance - a.balance);
      return {
        columns: [col("vendor", "Vendor"), col("id", "ID"), col("terms", "Terms"), col("credit", "Credit limit (₹)", true), col("balance", "Opening balance (₹)", true), col("used", "Credit used %", true), col("stockValue", "Stock supplied (₹)", true), col("status", "Status")],
        rows,
        totals: { vendor: `${rows.length} vendors`, credit: sum(rows, "credit"), balance: sum(rows, "balance"), stockValue: sum(rows, "stockValue") },
      };
    },
  },
};

// Fill `source` filters with this tenant's real options (vendor names, categories).
async function resolveFilters(tenantId, filters = []) {
  let vendors, cats;
  const out = [];
  for (const f of filters) {
    if (f.source === "vendors") {
      vendors ||= await Vendor.find({ tenantId }).select("businessName").sort({ businessName: 1 }).lean();
      out.push({ ...f, options: [...(f.extra || []), ...vendors.map((v) => ({ value: String(v._id), label: v.businessName }))] });
    } else if (f.source === "categories") {
      cats ||= (await Medicine.distinct("category", { tenantId })).filter(Boolean).sort();
      out.push({ ...f, options: cats.map((c) => ({ value: c, label: c })) });
    } else out.push(f);
  }
  return out;
}

module.exports = { INVENTORY_REPORTS: REPORTS, resolveFilters };
