// Opens a clean printable copy of a report in a new tab (same idea as NestHR's report print view).
// Every cell is HTML-escaped: patient/doctor names are user input and this document is written verbatim.
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function printReport(opts: {
  title: string;
  period: string;
  orgName: string;
  category: string;
  headers: string[];
  rows: string[][];
  numericCols?: Set<number>;
}) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const num = opts.numericCols ?? new Set<number>();
  const head = opts.headers.map((h, i) => `<th style="${num.has(i) ? "text-align:right" : ""}">${esc(h)}</th>`).join("");
  const body = opts.rows
    .map((r, i) => `<tr class="${i % 2 ? "alt" : ""}">${r.map((c, j) => `<td style="${num.has(j) ? "text-align:right" : ""}">${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  body{font-family:Inter,Arial,sans-serif;margin:24px;color:#000}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000;padding-bottom:10px;margin-bottom:14px}
  h1{font-size:20px;margin:0} .meta{font-size:12px;color:#555;margin-top:4px}
  .tag{display:inline-block;background:#024BAB;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 8px;border:1px solid #000}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#EAF1FB;text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.05em;padding:8px;border-bottom:2px solid #000;white-space:nowrap}
  td{padding:6px 8px;border-bottom:1px solid #ddd}
  tr.alt td{background:#F8FAFF}
  .foot{margin-top:14px;font-size:10px;color:#777}
  @media print{body{margin:10mm}}
</style></head><body>
<div class="top"><div><h1>${esc(opts.orgName)}</h1><div class="meta">${esc(opts.title)} · ${esc(opts.period)}</div></div>
<div><span class="tag">${esc(opts.category)}</span></div></div>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<div class="foot">Generated ${esc(new Date().toLocaleString("en-IN"))} · NestCare</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`);
  win.document.close();
  return true;
}
