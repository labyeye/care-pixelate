// Tax invoice PDF for a NestDoc subscription payment. Same sheet as the NestHR / NestLeads / NestSports
// billing PDF (opened in a print window, "Save as PDF" gives the file), filled from the tenant + subscription invoice.
import { PIXELATE_NEST_LOGO } from "./invoiceLogo";
import { escapeHtml as esc } from "./escapeHtml";

export interface SubscriptionInvoice {
  _id?: string;
  invoiceNumber?: string;
  plan?: string;
  doctors?: number;
  billingCycle?: string;
  subtotal?: number;
  gst?: number;
  amount?: number; // GST-inclusive, rupees
  status?: string;
  paidAt?: string;
  createdAt?: string;
  razorpayPaymentId?: string;
}

export interface InvoiceClient {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
}

function numToWords(n: number): string {
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
  if (n === 0) return "Zero";
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
  const paise = Math.round((n % 1) * 100);
  let res = w(Math.floor(n)) + " Rupees";
  if (paise > 0) res += " and " + w(paise) + " Paise";
  return res + " Only";
}

function fmt(n: number): string {
  return (
    "Rs. " +
    Number(n || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(v: any): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(v);
  }
}

export function buildSubscriptionInvoiceHTML(
  inv: SubscriptionInvoice,
  company: InvoiceClient,
  planName: string,
): string {
  const total = Number(inv.amount || 0);

  const clientState = String(company.state || "")
    .trim()
    .toLowerCase();
  const isInterState = !!clientState && !clientState.includes("bihar");
  // The server stores the taxable value and GST it charged; fall back to reversing 18% for old rows.
  const base = inv.subtotal ? Number(inv.subtotal) : total / 1.18;
  const taxAmt =
    inv.gst !== undefined && inv.subtotal ? Number(inv.gst) : total - base;
  const cgst = isInterState ? 0 : taxAmt / 2;
  const sgst = isInterState ? 0 : taxAmt / 2;
  const igst = isInterState ? taxAmt : 0;

  const doctors = Math.max(1, Number(inv.doctors) || 1);
  const cycle = inv.billingCycle === "yearly" ? "Annual" : "Monthly";
  const description = esc(
    `NestDoc ${planName} — ${doctors} doctor${doctors > 1 ? "s" : ""} — ${cycle} Subscription`,
  );

  const invoiceDate = fmtDate(inv.paidAt || inv.createdAt);
  const invoiceNumber = esc(
    inv.invoiceNumber || inv._id?.toString().slice(-8).toUpperCase() || "—",
  );

  const clientName = esc(company.name || "—");
  const clientAddress = esc(
    [company.address, company.city, company.state, company.pincode]
      .filter(Boolean)
      .join(", "),
  );
  const clientGST = esc(company.gstin || "");
  const clientEmail = esc(company.email || "");
  const clientPhone = esc(company.phone || "");
  const placeOfService = esc(company.state || "Bihar");

  const paid = inv.status === "paid" ? total : 0;
  const rate = base > 0 ? Math.round((taxAmt / base) * 100) : 18;

  const taxRows = isInterState
    ? `<tr><td>998314</td><td style="text-align:right">${fmt(base)}</td><td style="text-align:right">${rate}%</td><td style="text-align:right">${fmt(igst)}</td><td style="text-align:right">${fmt(igst)}</td></tr>`
    : `<tr><td>998314</td><td style="text-align:right">${fmt(base)}</td><td style="text-align:right">${rate / 2}%</td><td style="text-align:right">${fmt(cgst)}</td><td style="text-align:right">${rate / 2}%</td><td style="text-align:right">${fmt(sgst)}</td><td style="text-align:right">${fmt(taxAmt)}</td></tr>`;

  const taxHeader = isInterState
    ? `<tr><th>HSN/SAC</th><th>Taxable Value</th><th>IGST Rate</th><th>IGST Amt</th><th>Total Tax</th></tr>`
    : `<tr><th>HSN/SAC</th><th>Taxable Value</th><th>CGST Rate</th><th>CGST Amt</th><th>SGST Rate</th><th>SGST Amt</th><th>Total Tax</th></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TAX INVOICE ${invoiceNumber}</title>
<style>
@page { margin: 0; size: A4; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { margin: 0; padding: 0; }
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
body { font-family: "DM Sans", Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page-wrap { margin: 10mm; }
.outer { border: 1.5pt solid #222; }
.title-bar { border-bottom: 1.5pt solid #222; padding: 6px; text-align: center; }
.title-bar h1 { font-size: 14pt; letter-spacing: 2px; color: #111; }
.title-bar p { font-size: 7pt; color: #666; margin-top: 2px; }
.header-row { display: flex; border-bottom: 1pt solid #222; }
.company-block { flex: 1; padding: 10px; border-right: 1pt solid #222; }
.company-block img { height: 50px; margin-bottom: 6px; }
.company-block .cname { font-size: 10pt; font-weight: 700; }
.company-block .cline { font-size: 8pt; color: #333; margin-top: 2px; }
.company-block .cgst { font-size: 8pt; font-weight: 700; margin-top: 4px; }
.meta-block { width: 210px; padding: 10px; }
.meta-row { display: flex; margin-bottom: 5px; }
.meta-label { width: 100px; font-size: 8pt; font-weight: 700; color: #444; }
.meta-value { font-size: 8pt; color: #111; flex: 1; }
.party-row { display: flex; border-bottom: 1pt solid #222; }
.party-block { flex: 1; padding: 10px; }
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
.col-hsn { width: 65px; text-align: center; }
.col-qty { width: 35px; text-align: center; }
.col-unit { width: 35px; text-align: center; }
.col-rate { width: 90px; text-align: right; }
.col-amt { width: 100px; text-align: right; font-weight: 600; }
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
.balance-row { display: flex; justify-content: space-between; padding: 6px 12px; background: #f0fdf4; }
.balance-label { font-size: 8pt; font-weight: 700; color: #111; }
.balance-value { font-size: 8pt; font-weight: 700; color: #16a34a; }
.tax-section { border-bottom: 1pt solid #222; }
.tax-section thead tr { background: #ececec; }
.tax-section th, .tax-section td { font-size: 7.5pt; padding: 4px 5px; }
.tax-section tfoot tr { background: #f0f0f0; font-weight: 700; }
.footer-section { display: flex; border-bottom: 1pt solid #222; }
.declaration-block { flex: 1; padding: 10px; border-right: 1pt solid #222; }
.declaration-text { font-size: 7pt; color: #666; line-height: 1.4; margin-top: 3px; }
.signature-block { width: 220px; padding: 10px; display: flex; flex-direction: column; align-items: flex-end; }
.sig-for { font-size: 8pt; color: #555; margin-bottom: 28px; }
.sig-line { width: 160px; border-top: 1pt solid #222; margin-bottom: 4px; }
.sig-name { font-size: 8.5pt; font-weight: 700; color: #111; }
.sig-title { font-size: 7.5pt; color: #666; }
.footer-note { padding: 5px; text-align: center; }
.footer-note p { font-size: 7pt; color: #888; }
</style>
</head>
<body>
<div class="page-wrap">
<div class="outer">

  <div class="title-bar">
    <h1>TAX INVOICE</h1>
    <p>Original for Recipient · NestDoc subscription</p>
  </div>

  <div class="header-row">
    <div class="company-block">
      <img src="${PIXELATE_NEST_LOGO}" alt="Pixelate Nest" />
      <div class="cname">Kalahanu Tech Studios LLP</div>
      <div class="cline">Kala Bhawan, Akharaghat Road, Muzaffarpur, Bihar – 842001</div>
      <div class="cline">Email: support@pixelatenest.com | Phone: +91 84069 12345</div>
      <div class="cline">Website: pixelatenest.com</div>
      <div class="cgst">GSTIN: 10ABFFK0650E1Z2</div>
      <div class="cline">PAN: ABFFK0650E &nbsp;|&nbsp; State: Bihar (Code: 10)</div>
    </div>
    <div class="meta-block">
      <div class="meta-row"><span class="meta-label">Invoice No.</span><span class="meta-value">: ${invoiceNumber}</span></div>
      <div class="meta-row"><span class="meta-label">Invoice Date</span><span class="meta-value">: ${invoiceDate}</span></div>
      <div class="meta-row"><span class="meta-label">Due Date</span><span class="meta-value">: ${invoiceDate}</span></div>
      <div class="meta-row"><span class="meta-label">Place of Service</span><span class="meta-value">: ${placeOfService}</span></div>
      <div class="meta-row"><span class="meta-label">Supply Type</span><span class="meta-value">: ${isInterState ? "Inter-State (IGST)" : "Intra-State (CGST+SGST)"}</span></div>
    </div>
  </div>

  <div class="party-row">
    <div class="party-block">
      <div class="party-label">Bill To</div>
      <div class="party-name">${clientName}</div>
      ${clientAddress ? `<div class="party-line">${clientAddress}</div>` : ""}
      ${clientEmail ? `<div class="party-line">Email: ${clientEmail}</div>` : ""}
      ${clientPhone ? `<div class="party-line">Phone: ${clientPhone}</div>` : ""}
      ${clientGST ? `<div class="party-line" style="font-weight:700">GSTIN: ${clientGST}</div>` : ""}
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="col-sno">S.No</th>
          <th class="col-desc">Description of Services</th>
          <th class="col-hsn">HSN/SAC</th>
          <th class="col-qty">Qty</th>
          <th class="col-unit">Unit</th>
          <th class="col-rate">Rate (Rs.)</th>
          <th class="col-amt">Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="col-sno">1</td>
          <td class="col-desc">${description}</td>
          <td class="col-hsn">998314</td>
          <td class="col-qty">${doctors}</td>
          <td class="col-unit">Dr</td>
          <td class="col-rate">${fmt(base / doctors)}</td>
          <td class="col-amt">${fmt(base)}</td>
        </tr>
        ${Array.from({ length: 5 })
          .map(
            () =>
              `<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </div>

  <div class="amount-words">
    <span class="aw-label">Amount in Words:</span>
    <span class="aw-value">${numToWords(Math.round(total))}</span>
  </div>

  <div class="bottom-section">
    <div class="bottom-left">
      <div class="section-label">Bank Details</div>
      <div class="bank-line">Bank Name &nbsp;&nbsp;&nbsp;: HDFC Bank Pvt. Ltd.</div>
      <div class="bank-line">Account No. &nbsp;: 50200119083987</div>
      <div class="bank-line">Account Name : KALAHANU TECH STUDIOS LLP</div>
      <div class="bank-line">IFSC Code &nbsp;&nbsp;&nbsp;: HDFC0000344</div>
      <div class="bank-line">Branch &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Saraiyaganj, Muzaffarpur, Bihar</div>
      <div class="bank-line">Account Type : Current</div>
      <div class="divider-h"></div>
      <div class="section-label">Terms &amp; Notes</div>
      <div class="notes-text">
        1. Payment is due within 30 days of invoice date.<br/>
        2. Quote invoice number in all payment references.<br/>
        3. Goods/services remain property of Pixelate Nest until paid in full.<br/>
        4. Interest @ 18% p.a. charged on overdue amounts.
      </div>
    </div>
    <div class="bottom-right">
      <div class="total-row"><span class="total-label">Subtotal</span><span class="total-value">${fmt(base)}</span></div>
      <div class="total-row"><span class="total-label">Taxable Amount</span><span class="total-value">${fmt(base)}</span></div>
      ${
        isInterState
          ? `<div class="total-row"><span class="total-label">IGST (${rate}%)</span><span class="total-value">${fmt(igst)}</span></div>`
          : `<div class="total-row"><span class="total-label">CGST (${rate / 2}%)</span><span class="total-value">${fmt(cgst)}</span></div>
           <div class="total-row"><span class="total-label">SGST (${rate / 2}%)</span><span class="total-value">${fmt(sgst)}</span></div>`
      }
      <div class="grand-row"><span class="grand-label">Grand Total</span><span class="grand-value">${fmt(total)}</span></div>
      <div class="total-row"><span class="total-label">(−) Amount Paid</span><span class="total-value">${fmt(paid)}</span></div>
      <div class="balance-row"><span class="balance-label">Balance Due</span><span class="balance-value">${fmt(total - paid)}</span></div>
    </div>
  </div>

  <div class="tax-section">
    <table>
      <thead>${taxHeader}</thead>
      <tbody>${taxRows}</tbody>
      <tfoot>
        ${
          isInterState
            ? `<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmt(base)}</strong></td><td style="text-align:right"></td><td style="text-align:right"><strong>${fmt(igst)}</strong></td><td style="text-align:right"><strong>${fmt(igst)}</strong></td></tr>`
            : `<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmt(base)}</strong></td><td></td><td style="text-align:right"><strong>${fmt(cgst)}</strong></td><td></td><td style="text-align:right"><strong>${fmt(sgst)}</strong></td><td style="text-align:right"><strong>${fmt(taxAmt)}</strong></td></tr>`
        }
      </tfoot>
    </table>
  </div>

  <div class="footer-section">
    <div class="declaration-block">
      <div class="section-label">Declaration</div>
      <div class="declaration-text">
        We declare that this invoice shows the actual price of the goods/services described
        and that all particulars are true and correct.<br/>
        All disputes are subject to Muzaffarpur jurisdiction only.
      </div>
    </div>
    <div class="signature-block">
      <div class="sig-for">For Kalahanu Tech Studios LLP</div>
      <div class="sig-line"></div>
      <div class="sig-name">Authorised Signatory</div>
      <div class="sig-title">Labh Chandra Bothra, Co-Founder</div>
    </div>
  </div>

  <div class="footer-note">
    <p>This is a computer-generated invoice and does not require a physical signature.</p>
  </div>

</div>
</div>
</body>
</html>`;
}
