import { writePrintDocument } from "./printWindow";
// Printable A4 invoice. Same layout and styling as the NestHR / NestAcademy / NestLeads billing PDF
// (bordered "TAX INVOICE" sheet: title bar, seller + meta header, bill-to row, line table, amount in
// words, totals, HSN tax table, declaration + signature), filled with a clinic invoice instead of a
// subscription receipt. Opened in a print window, so "Save as PDF" gives the file.
import { escapeHtml as esc } from "./escapeHtml";
import type { Invoice } from "@/types/billing";
import type { Doctor, Patient, Tenant } from "@/types";

export function numToWords(n: number): string {
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  if (n === 0) return "Zero Rupees Only";
  const w = (x: number): string => {
    if (x < 20) return a[x] || "";
    if (x < 100) return b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : "");
    if (x < 1000)
      return (
        a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + w(x % 100) : "")
      );
    if (x < 100000)
      return (
        w(Math.floor(x / 1000)) +
        " Thousand" +
        (x % 1000 ? " " + w(x % 1000) : "")
      );
    if (x < 10000000)
      return (
        w(Math.floor(x / 100000)) +
        " Lakh" +
        (x % 100000 ? " " + w(x % 100000) : "")
      );
    return (
      w(Math.floor(x / 10000000)) +
      " Crore" +
      (x % 10000000 ? " " + w(x % 10000000) : "")
    );
  };
  const rupees = Math.floor(n + 0.0001);
  const paise = Math.round((n - rupees) * 100);
  let res = w(rupees) + " Rupees";
  if (paise > 0) res += " and " + w(paise) + " Paise";
  return res + " Only";
}

export const fmt = (n: number) =>
  "Rs. " +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtDate = (v?: string | Date | null) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const ageOf = (dob?: string) => {
  if (!dob) return "";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000);
  return y >= 0 && y < 150 ? `${y} yrs` : "";
};
const obj = <T>(v: unknown): T | undefined =>
  v && typeof v === "object" ? (v as T) : undefined;

export function buildInvoiceHTML(inv: Invoice, tenant: Tenant | null): string {
  const patient = obj<Patient>(inv.patientId);
  const doctor = obj<Doctor>(
    (inv as unknown as { doctorId?: unknown }).doctorId,
  );
  const dueDate = (inv as unknown as { dueDate?: string }).dueDate;

  const items = inv.items.map((l) => ({
    ...l,
    hsn: (l as unknown as { hsnCode?: string }).hsnCode || "",
    unit: (l as unknown as { unit?: string }).unit || "Nos",
    disc: (l as unknown as { discountPercent?: number }).discountPercent || 0,
    taxable: l.amount, // after the line discount, before GST
  }));
  const lineTaxable = items.reduce((s, l) => s + l.taxable, 0);
  const gst = inv.gst || 0;
  const hasGst = gst > 0;
  const total = inv.total;
  const paid = inv.paid || 0;
  const balance =
    inv.status === "void"
      ? 0
      : Math.max(0, Math.round((total - paid) * 100) / 100);

  // Same state -> CGST + SGST; different states -> IGST. Unknown state is treated as the clinic's own.
  const sellerState = (tenant?.contact?.state || "").trim().toLowerCase();
  const buyerState = (patient?.address?.state || "").trim().toLowerCase();
  const interState =
    !!sellerState && !!buyerState && sellerState !== buyerState;

  // HSN-wise tax table: group lines by (HSN, GST rate)
  const groups = new Map<
    string,
    { hsn: string; rate: number; taxable: number; tax: number }
  >();
  for (const l of items) {
    if (!(l.gstRate > 0)) continue;
    const k = `${l.hsn}|${l.gstRate}`;
    const g = groups.get(k) ?? {
      hsn: l.hsn || "—",
      rate: l.gstRate,
      taxable: 0,
      tax: 0,
    };
    g.taxable += l.taxable;
    g.tax += Math.round(l.taxable * l.gstRate) / 100;
    groups.set(k, g);
  }
  const taxRows = [...groups.values()];
  const cgst = interState ? 0 : gst / 2;
  const sgst = interState ? 0 : gst / 2;
  const igst = interState ? gst : 0;

  const sellerName = esc(
    tenant?.gstDetails?.legalName || tenant?.name || "Clinic",
  );
  const sellerAddress = [
    tenant?.contact?.address,
    tenant?.contact?.city,
    tenant?.contact?.state,
    tenant?.contact?.pincode,
  ]
    .filter(Boolean)
    .map(esc)
    .join(", ");
  const is = tenant?.invoiceSettings;
  const termLines = (is?.terms || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const termsHtml = (
    termLines.length
      ? termLines
      : [
          "Please quote the invoice number in all payment references.",
          "Medicines once dispensed cannot be returned or exchanged.",
          "Keep this invoice for insurance / reimbursement claims.",
        ]
  )
    .map((l, i) => `${i + 1}. ${esc(l)}`)
    .join("<br/>");
  const bk = tenant?.bank;
  const bankRows = [
    ["A/c Name", bk?.accountHolder],
    ["Bank", [bk?.bankName, bk?.branch].filter(Boolean).join(", ")],
    ["A/c No.", bk?.accountNumber],
    ["IFSC", bk?.ifsc],
    ["UPI", bk?.upiId],
  ].filter(([, v]) => v);
  const bankHtml =
    is?.showBank !== false && bankRows.length
      ? `<div class="divider-h"></div><div class="section-label">Bank Details</div>${bankRows.map(([k, v]) => `<div class="bank-line">${k}: <strong>${esc(String(v))}</strong></div>`).join("")}`
      : "";
  const logo =
    tenant?.branding?.logoUrl &&
    /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(
      tenant.branding.logoUrl,
    )
      ? tenant.branding.logoUrl
      : "";

  const patientName = esc(patient?.name || "—");
  const patientAddress = [
    patient?.address?.street,
    patient?.address?.city,
    patient?.address?.state,
    patient?.address?.pincode,
  ]
    .filter(Boolean)
    .map(esc)
    .join(", ");
  const patientLine = [
    patient?.patientId && `Patient ID: ${patient.patientId}`,
    ageOf(patient?.dateOfBirth),
    patient?.gender,
  ]
    .filter(Boolean)
    .map((x) => esc(x))
    .join(" &nbsp;|&nbsp; ");

  const rowsHtml = items
    .map(
      (l, i) => `<tr>
          <td class="col-sno">${i + 1}</td>
          <td class="col-desc">${esc(l.description)}</td>
          <td class="col-hsn">${esc(l.hsn || "—")}</td>
          <td class="col-qty">${l.qty}</td>
          <td class="col-unit">${esc(l.unit)}</td>
          <td class="col-rate">${fmt(l.rate)}</td>
          <td class="col-disc">${l.disc ? l.disc + "%" : "—"}</td>
          <td class="col-gst">${l.gstRate ? l.gstRate + "%" : "Exempt"}</td>
          <td class="col-amt">${fmt(l.taxable)}</td>
        </tr>`,
    )
    .join("");
  const emptyRows = Array.from({ length: Math.max(0, 6 - items.length) })
    .map(
      () =>
        `<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
    )
    .join("");

  const paymentsHtml = inv.payments.length
    ? inv.payments
        .map(
          (p) =>
            `<div class="bank-line">${esc(fmtDate(p.receivedAt))} &nbsp;·&nbsp; ${esc(String(p.mode).toUpperCase())}${p.reference ? " · " + esc(p.reference) : ""} &nbsp;·&nbsp; <strong>${fmt(p.amount)}</strong></div>`,
        )
        .join("")
    : `<div class="bank-line" style="color:#888">No payment received yet</div>`;

  const taxHeader = interState
    ? `<tr><th>HSN/SAC</th><th>Taxable Value</th><th>IGST Rate</th><th>IGST Amt</th><th>Total Tax</th></tr>`
    : `<tr><th>HSN/SAC</th><th>Taxable Value</th><th>CGST Rate</th><th>CGST Amt</th><th>SGST Rate</th><th>SGST Amt</th><th>Total Tax</th></tr>`;
  const taxBody = taxRows
    .map((g) =>
      interState
        ? `<tr><td>${esc(g.hsn)}</td><td style="text-align:right">${fmt(g.taxable)}</td><td style="text-align:right">${g.rate}%</td><td style="text-align:right">${fmt(g.tax)}</td><td style="text-align:right">${fmt(g.tax)}</td></tr>`
        : `<tr><td>${esc(g.hsn)}</td><td style="text-align:right">${fmt(g.taxable)}</td><td style="text-align:right">${g.rate / 2}%</td><td style="text-align:right">${fmt(g.tax / 2)}</td><td style="text-align:right">${g.rate / 2}%</td><td style="text-align:right">${fmt(g.tax / 2)}</td><td style="text-align:right">${fmt(g.tax)}</td></tr>`,
    )
    .join("");
  const taxFoot = interState
    ? `<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmt(lineTaxable)}</strong></td><td></td><td style="text-align:right"><strong>${fmt(igst)}</strong></td><td style="text-align:right"><strong>${fmt(gst)}</strong></td></tr>`
    : `<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmt(lineTaxable)}</strong></td><td></td><td style="text-align:right"><strong>${fmt(cgst)}</strong></td><td></td><td style="text-align:right"><strong>${fmt(sgst)}</strong></td><td style="text-align:right"><strong>${fmt(gst)}</strong></td></tr>`;

  const title = hasGst ? "TAX INVOICE" : "INVOICE";
  const statusText =
    inv.status === "paid"
      ? "PAID"
      : inv.status === "partial"
        ? "PART PAID"
        : inv.status === "void"
          ? "VOID"
          : "UNPAID";
  const noteLines = (inv as unknown as { notes?: string }).notes
    ? `<br/>${esc((inv as unknown as { notes?: string }).notes)}`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} ${esc(inv.number)}</title>
<style>
@page { margin: 0; size: A4; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "DM Sans", Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page-wrap { margin: 10mm; }
.outer { border: 1.5pt solid #222; position: relative; }
.title-bar { border-bottom: 1.5pt solid #222; padding: 6px; text-align: center; }
.title-bar h1 { font-size: 14pt; letter-spacing: 2px; color: #111; }
.title-bar p { font-size: 7pt; color: #666; margin-top: 2px; }
.header-row { display: flex; border-bottom: 1pt solid #222; }
.company-block { flex: 1; padding: 10px; border-right: 1pt solid #222; }
.company-block img { height: 50px; margin-bottom: 6px; max-width: 200px; object-fit: contain; }
.company-block .cname { font-size: 10pt; font-weight: 700; }
.company-block .cline { font-size: 8pt; color: #333; margin-top: 2px; }
.company-block .cgst { font-size: 8pt; font-weight: 700; margin-top: 4px; }
.meta-block { width: 210px; padding: 10px; }
.meta-row { display: flex; margin-bottom: 5px; }
.meta-label { width: 100px; font-size: 8pt; font-weight: 700; color: #444; }
.meta-value { font-size: 8pt; color: #111; flex: 1; }
.party-row { display: flex; border-bottom: 1pt solid #222; }
.party-block { flex: 1; padding: 10px; }
.party-block.right { border-left: 1pt solid #222; }
.party-label { font-size: 7pt; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.party-name { font-size: 11pt; font-weight: 700; color: #111; margin-bottom: 3px; }
.party-line { font-size: 8pt; color: #333; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; }
.table-wrap { border-bottom: 1pt solid #222; }
thead tr { background: #ececec; border-bottom: 1pt solid #222; }
th { padding: 6px 5px; font-size: 8pt; font-weight: 700; color: #333; }
td { padding: 7px 5px; font-size: 8pt; color: #111; border-bottom: 0.5pt solid #ddd; }
.col-sno { width: 28px; text-align: center; }
.col-desc { }
.col-hsn { width: 62px; text-align: center; }
.col-qty { width: 34px; text-align: center; }
.col-unit { width: 40px; text-align: center; }
.col-rate { width: 80px; text-align: right; }
.col-disc { width: 42px; text-align: center; }
.col-gst { width: 48px; text-align: center; }
.col-amt { width: 90px; text-align: right; font-weight: 600; }
.empty-row td { height: 20px; border-bottom: 0.5pt solid #ddd; }
.amount-words { display: flex; padding: 6px 10px; border-bottom: 1pt solid #222; background: #f9f9f9; }
.aw-label { font-size: 8pt; font-weight: 700; color: #444; margin-right: 8px; white-space: nowrap; }
.aw-value { font-size: 8pt; color: #111; }
.bottom-section { display: flex; border-bottom: 1pt solid #222; }
.bottom-left { flex: 1; padding: 10px; border-right: 1pt solid #222; }
.section-label { font-size: 7.5pt; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
.bank-line { font-size: 8pt; color: #111; margin-bottom: 3px; }
.notes-text { font-size: 7.5pt; color: #666; line-height: 1.5; }
.divider-h { border-top: 0.5pt solid #ddd; margin: 8px 0; }
.bottom-right { width: 225px; }
.total-row { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 0.5pt solid #ddd; }
.total-label { font-size: 8pt; color: #555; }
.total-value { font-size: 8pt; color: #111; text-align: right; }
.grand-row { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 0.5pt solid #222; background: #f0f0f0; }
.grand-label { font-size: 9pt; font-weight: 700; color: #111; }
.grand-value { font-size: 9pt; font-weight: 700; color: #111; }
.balance-row { display: flex; justify-content: space-between; padding: 6px 12px; background: ${balance > 0 ? "#fef2f2" : "#f0fdf4"}; }
.balance-label { font-size: 8pt; font-weight: 700; color: #111; }
.balance-value { font-size: 8pt; font-weight: 700; color: ${balance > 0 ? "#dc2626" : "#16a34a"}; }
.tax-section { border-bottom: 1pt solid #222; }
.tax-section thead tr { background: #ececec; }
.tax-section th, .tax-section td { font-size: 7.5pt; padding: 4px 5px; }
.tax-section tfoot tr { background: #f0f0f0; font-weight: 700; }
.exempt-note { padding: 6px 10px; font-size: 7.5pt; color: #555; border-bottom: 1pt solid #222; }
.footer-section { display: flex; border-bottom: 1pt solid #222; }
.declaration-block { flex: 1; padding: 10px; border-right: 1pt solid #222; }
.declaration-text { font-size: 7pt; color: #666; line-height: 1.4; margin-top: 3px; }
.signature-block { width: 220px; padding: 10px; display: flex; flex-direction: column; align-items: flex-end; }
.sig-for { font-size: 8pt; color: #555; margin-bottom: 28px; text-align: right; }
.sig-line { width: 160px; border-top: 1pt solid #222; margin-bottom: 4px; }
.sig-name { font-size: 8.5pt; font-weight: 700; color: #111; }
.sig-title { font-size: 7.5pt; color: #666; }
.footer-note { padding: 5px; text-align: center; }
.footer-note p { font-size: 7pt; color: #888; }
.stamp { position: absolute; top: 70px; right: 28px; transform: rotate(-12deg); border: 2pt solid ${inv.status === "paid" ? "#16a34a" : inv.status === "void" ? "#6b7280" : "#dc2626"}; color: ${inv.status === "paid" ? "#16a34a" : inv.status === "void" ? "#6b7280" : "#dc2626"}; font-weight: 700; font-size: 14pt; letter-spacing: 2px; padding: 2px 12px; opacity: 0.55; }
</style>
</head>
<body>
<div class="page-wrap">
<div class="outer">

  <div class="stamp">${statusText}</div>

  <div class="title-bar">
    <h1>${title}</h1>
    <p>Original for Recipient</p>
  </div>

  <div class="header-row">
    <div class="company-block">
      ${logo ? `<img src="${esc(logo)}" alt="${sellerName}" />` : ""}
      <div class="cname">${sellerName}</div>
      ${sellerAddress ? `<div class="cline">${sellerAddress}</div>` : ""}
      ${tenant?.contact?.email || tenant?.contact?.phone ? `<div class="cline">${[tenant?.contact?.email && "Email: " + esc(tenant.contact.email), tenant?.contact?.phone && "Phone: " + esc(tenant.contact.phone)].filter(Boolean).join(" | ")}</div>` : ""}
      ${tenant?.gstDetails?.gstin || tenant?.gstDetails?.pan ? `<div class="cgst">${[tenant?.gstDetails?.gstin && "GSTIN: " + esc(tenant.gstDetails.gstin), tenant?.gstDetails?.pan && "PAN: " + esc(tenant.gstDetails.pan)].filter(Boolean).join(" | ")}</div>` : ""}
    </div>
    <div class="meta-block">
      <div class="meta-row"><span class="meta-label">Invoice No.</span><span class="meta-value">: ${esc(inv.number)}</span></div>
      <div class="meta-row"><span class="meta-label">Invoice Date</span><span class="meta-value">: ${fmtDate(inv.createdAt)}</span></div>
      <div class="meta-row"><span class="meta-label">Due Date</span><span class="meta-value">: ${fmtDate(dueDate || inv.createdAt)}</span></div>
      <div class="meta-row"><span class="meta-label">Payment Status</span><span class="meta-value">: ${statusText}</span></div>
      ${hasGst ? `<div class="meta-row"><span class="meta-label">Supply Type</span><span class="meta-value">: ${interState ? "Inter-State (IGST)" : "Intra-State (CGST+SGST)"}</span></div>` : ""}
    </div>
  </div>

  <div class="party-row">
    <div class="party-block">
      <div class="party-label">Bill To (Patient)</div>
      <div class="party-name">${patientName}</div>
      ${patientLine ? `<div class="party-line">${patientLine}</div>` : ""}
      ${patientAddress ? `<div class="party-line">${patientAddress}</div>` : ""}
      ${patient?.contact?.phone ? `<div class="party-line">Phone: ${esc(patient.contact.phone)}</div>` : ""}
      ${patient?.contact?.email ? `<div class="party-line">Email: ${esc(patient.contact.email)}</div>` : ""}
    </div>
    <div class="party-block right">
      <div class="party-label">Treated By</div>
      <div class="party-name">${esc(doctor?.name || "—")}</div>
      ${doctor?.professionalDetails?.specializations?.length ? `<div class="party-line">${esc(doctor.professionalDetails.specializations.join(", "))}</div>` : ""}
      ${doctor?.professionalDetails?.registrationNumber ? `<div class="party-line">Reg. No: ${esc(doctor.professionalDetails.registrationNumber)}</div>` : ""}
      <div class="party-line" style="margin-top:8px;font-size:7.5pt;color:#888">(Healthcare services delivered at the clinic)</div>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="col-sno">S.No</th>
          <th class="col-desc">Description</th>
          <th class="col-hsn">HSN/SAC</th>
          <th class="col-qty">Qty</th>
          <th class="col-unit">Unit</th>
          <th class="col-rate">Rate (Rs.)</th>
          <th class="col-disc">Disc.</th>
          <th class="col-gst">GST</th>
          <th class="col-amt">Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${emptyRows}
      </tbody>
    </table>
  </div>

  <div class="amount-words">
    <span class="aw-label">Amount in Words:</span>
    <span class="aw-value">${numToWords(total)}</span>
  </div>

  <div class="bottom-section">
    <div class="bottom-left">
      <div class="section-label">Payments Received</div>
      ${paymentsHtml}
      <div class="divider-h"></div>
      <div class="section-label">Terms &amp; Notes</div>
      <div class="notes-text">
        ${termsHtml}${noteLines}
      </div>
      ${bankHtml}
    </div>
    <div class="bottom-right">
      <div class="total-row"><span class="total-label">Subtotal (after line discounts)</span><span class="total-value">${fmt(lineTaxable)}</span></div>
      ${inv.discount > 0 ? `<div class="total-row"><span class="total-label">Additional Discount</span><span class="total-value">- ${fmt(inv.discount)}</span></div>` : ""}
      ${
        hasGst
          ? interState
            ? `<div class="total-row"><span class="total-label">IGST</span><span class="total-value">${fmt(igst)}</span></div>`
            : `<div class="total-row"><span class="total-label">CGST</span><span class="total-value">${fmt(cgst)}</span></div>
               <div class="total-row"><span class="total-label">SGST</span><span class="total-value">${fmt(sgst)}</span></div>`
          : ""
      }
      <div class="grand-row"><span class="grand-label">Grand Total</span><span class="grand-value">${fmt(total)}</span></div>
      <div class="total-row"><span class="total-label">(−) Amount Paid</span><span class="total-value">${fmt(paid)}</span></div>
      <div class="balance-row"><span class="balance-label">Balance Due</span><span class="balance-value">${fmt(balance)}</span></div>
    </div>
  </div>

  ${
    hasGst
      ? `<div class="tax-section">
    <table>
      <thead>${taxHeader}</thead>
      <tbody>${taxBody}</tbody>
      <tfoot>${taxFoot}</tfoot>
    </table>
  </div>`
      : `<div class="exempt-note">Healthcare services on this invoice are exempt from GST.</div>`
  }

  <div class="footer-section">
    <div class="declaration-block">
      <div class="section-label">Declaration</div>
      <div class="declaration-text">
        We declare that this invoice shows the actual price of the goods/services described
        and that all particulars are true and correct.
      </div>
    </div>
    <div class="signature-block">
      <div class="sig-for">For ${sellerName}</div>
      <div class="sig-line"></div>
      <div class="sig-name">${esc(tenant?.invoiceSettings?.signatoryName || "Authorised Signatory")}</div>
      ${tenant?.invoiceSettings?.signatoryTitle ? `<div class="sig-title">${esc(tenant.invoiceSettings.signatoryTitle)}</div>` : ""}
      ${doctor?.name ? `<div class="sig-title">${esc(doctor.name)}</div>` : ""}
    </div>
  </div>

  <div class="footer-note">
    ${tenant?.invoiceSettings?.footerNote ? `<p><strong>${esc(tenant.invoiceSettings.footerNote)}</strong></p>` : ""}
    <p>This is a computer-generated invoice and does not require a physical signature.</p>
  </div>

</div>
</div>
</body>
</html>`;
}

/**
 * Writes the invoice into a print window (Save as PDF from there). Pass a window opened synchronously in the
 * click handler when the invoice has to be fetched first, so the browser does not treat it as a blocked pop-up.
 */
export function openInvoicePDF(
  inv: Invoice,
  tenant: Tenant | null,
  win?: Window | null,
): boolean {
  const w = win ?? window.open("", "_blank");
  if (!w) return false;
  writePrintDocument(w, buildInvoiceHTML(inv, tenant), true);
  return true;
}
