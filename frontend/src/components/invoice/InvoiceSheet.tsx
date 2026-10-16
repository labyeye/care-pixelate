import React from "react";
import { fmt } from "@/lib/buildInvoiceHTML";
import type { SheetData } from "@/lib/invoiceSheetData";
import { fillVars, type Block, type InvoiceTemplate, type VarCtx } from "@/lib/invoiceTemplate";
import { dateStr, makeCore, SheetPage, type BuildOpts, type SheetApi } from "./sheetCore";

export { FAMILY, JUSTIFY, type ImgBoxArgs } from "./sheetCore";

export interface SheetOpts extends BuildOpts {
  template: InvoiceTemplate;
  data: SheetData;
  logo?: string;
}

/**
 * The invoice's blocks (bill-to, items table, words, payments/terms/bank/totals, GST table) on top of the shared
 * core. The Invoice Designer canvas and the printed invoice both use it, so the preview matches the print.
 */
export function makeSheet(o: SheetOpts): SheetApi {
  const { template, data: d } = o;
  const co = d.company;
  const vars: VarCtx = {
    "company.name": co.name,
    "company.phone": co.phone || "",
    "company.email": co.email || "",
    "patient.name": d.patient.name,
    "doctor.name": d.doctor?.name || "",
    "invoice.number": d.invNo,
    "invoice.date": dateStr(d.invDate),
    "invoice.due": dateStr(d.dueDate),
    "invoice.total": fmt(d.total),
    "invoice.balance": fmt(d.balance),
  };
  const core = makeCore({
    ...o,
    company: co,
    title: d.title,
    vars,
    meta: (p) => [
      ["Invoice No.", d.invNo],
      ["Invoice Date", dateStr(d.invDate)],
      ["Due Date", dateStr(d.dueDate)],
      ...(p.showPlace ? ([["Payment Status", d.statusLabel], ...(d.taxAmt > 0 ? [["Supply Type", d.isInterState ? "Inter-State (IGST)" : "Intra-State (CGST+SGST)"]] : [])] as [string, string][]) : []),
    ],
    signatory: { name: co.signatoryName !== "Authorised Signatory" ? co.signatoryName : undefined, title: co.signatoryTitle },
    declaration: "We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.",
  });
  const { T, px, full, H, V, soft, fs, bold, text, sec } = core;
  const ctx = vars;
  const taxHalf = d.taxAmt / 2;

  const renderBlock = (b: Block): React.ReactNode => {
    const p = b.props;
    switch (b.type) {
      case "parties":
        return (
          <div style={{ padding: px(8), borderBottom: H(1) }}>
            <div style={text(7, { fontWeight: bold, color: T.muted, textTransform: "uppercase", marginBottom: px(3), letterSpacing: px(0.5) })}>{p.label}</div>
            <div style={text(10, { fontWeight: bold, marginBottom: px(2) })}>{d.patient.name}</div>
            {p.showGst && d.patient.idLine ? <div style={text(8, { color: T.muted })}>{d.patient.idLine}</div> : null}
            {d.patient.address ? <div style={text(8, { color: T.muted })}>{d.patient.address}</div> : null}
            {p.showEmail && d.patient.email ? <div style={text(8, { color: T.muted })}>Email: {d.patient.email}</div> : null}
            {p.showPhone && d.patient.phone ? <div style={text(8, { color: T.muted })}>Phone: {d.patient.phone}</div> : null}
            {p.showDoctor && d.doctor ? (
              <div style={text(8, { color: T.muted, marginTop: px(3) })}>
                Treated by <b style={{ color: T.text }}>{d.doctor.name}</b>
                {d.doctor.spec ? ` · ${d.doctor.spec}` : ""}
                {d.doctor.reg ? ` · Reg. No: ${d.doctor.reg}` : ""}
              </div>
            ) : null}
          </div>
        );

      case "items": {
        const cols = [
          p.sno && ["sno", 24, "center", "S.No"],
          ["desc", 0, "left", p.descLabel],
          p.hsn && ["hsn", 52, "center", "HSN/SAC"],
          p.qty && ["qty", 32, "center", "Qty"],
          p.unit && ["unit", 36, "center", "Unit"],
          p.rate && ["rate", 60, "right", "Rate (Rs.)"],
          p.discount && ["dis", 36, "right", "Disc."],
          p.gst && ["gst", 40, "right", "GST"],
          p.amount && ["amt", 70, "right", "Amount (Rs.)"],
        ].filter(Boolean) as [string, number, "left" | "center" | "right", string][];
        const cellStyle = (w: number, align: string, size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
          ...(w ? { width: px(w), flex: "none" } : { flex: 1 }),
          padding: `0 ${px(4)}px`,
          textAlign: align as any,
          fontSize: fs(size),
          ...extra,
        });
        const empty = Math.max(0, (Number(p.minRows) || 0) - d.items.length);
        return (
          <div style={{ borderBottom: H(1) }}>
            <div style={{ display: "flex", padding: `${px(5)}px 0`, background: p.accentHeader ? T.primary : T.headerBg, borderBottom: H(1) }}>
              {cols.map(([key, w, align, label]) => (
                <div key={key} style={cellStyle(w, align, 7.5, { fontWeight: bold, color: p.accentHeader ? "#fff" : T.text })}>{label}</div>
              ))}
            </div>
            {d.items.map((it, i) => {
              const val: Record<string, React.ReactNode> = {
                sno: i + 1,
                hsn: it.hsn || "—",
                qty: it.qty,
                unit: it.unit,
                rate: fmt(it.rate),
                dis: it.disc > 0 ? `${it.disc}%` : "—",
                gst: it.gstRate ? `${it.gstRate}%` : "Exempt",
                amt: fmt(it.amt),
              };
              return (
                <div key={i} style={{ display: "flex", padding: `${px(5)}px 0`, minHeight: px(22), borderBottom: soft, background: p.zebra && i % 2 ? "#fafafa" : undefined, breakInside: "avoid" }}>
                  {cols.map(([key, w, align]) =>
                    key === "desc" ? (
                      <div key={key} style={cellStyle(0, "left", 8)}>{it.description}</div>
                    ) : (
                      <div key={key} style={cellStyle(w, align, 8)}>{val[key]}</div>
                    ),
                  )}
                </div>
              );
            })}
            {Array.from({ length: empty }).map((_, i) => (
              <div key={`e${i}`} style={{ height: px(18), borderBottom: soft }} />
            ))}
          </div>
        );
      }

      case "words":
        return (
          <div style={{ display: "flex", padding: `${px(5)}px ${px(8)}px`, borderBottom: H(1), background: p.tint ? "#f9f9f9" : undefined }}>
            <span style={text(7.5, { fontWeight: bold, color: T.muted, marginRight: px(6) })}>{p.label}</span>
            <span style={text(7.5, { flex: 1 })}>{d.words}</span>
          </div>
        );

      case "summary": {
        const left = p.showBank || p.showTerms || p.showPayments;
        const row = (label: string, value: string, extra: React.CSSProperties = {}) => (
          <div key={label} style={{ display: "flex", padding: `${px(4)}px ${px(10)}px`, borderBottom: soft, ...extra }}>
            <span style={text(8, { flex: 1, color: T.muted })}>{label}</span>
            <span style={text(8, { width: px(85), textAlign: "right" })}>{value}</span>
          </div>
        );
        const sec = (t: string) => <div style={text(7.5, { fontWeight: bold, color: T.muted, textTransform: "uppercase", marginBottom: px(4), letterSpacing: px(0.5) })}>{t}</div>;
        const sep = <div style={{ borderBottom: soft, margin: `${px(6)}px 0` }} />;
        const termsText = fillVars([...co.terms.map((t, i) => `${i + 1}. ${t}`), ...(d.notes ? [d.notes] : [])].join("\n"), ctx);
        const sections: React.ReactNode[] = [];
        if (p.showPayments) {
          sections.push(
            <div key="pay">
              {sec("Payments Received")}
              {d.payments.length ? (
                d.payments.map((x, i) => (
                  <div key={i} style={text(8, { marginBottom: px(2) })}>
                    {dateStr(x.date)} · {x.mode}
                    {x.reference ? ` · ${x.reference}` : ""} · <b>{fmt(x.amount)}</b>
                  </div>
                ))
              ) : (
                <div style={text(8, { color: T.muted })}>No payment received yet</div>
              )}
            </div>,
          );
        }
        if (p.showTerms) {
          sections.push(
            <div key="terms">
              {sec(p.termsLabel)}
              <div style={text(7.5, { color: T.muted, lineHeight: 1.4, whiteSpace: "pre-line" })}>{termsText}</div>
            </div>,
          );
        }
        if (p.showBank && co.bank.length) {
          sections.push(
            <div key="bank">
              {sec("Bank Details")}
              {co.bank.map((r) => (
                <div key={r.label} style={text(8, { marginBottom: px(2) })}>{r.label}: <b>{r.value}</b></div>
              ))}
            </div>,
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: p.totalsSide === "left" ? "row-reverse" : "row", borderBottom: H(1), breakInside: "avoid" }}>
            {left ? (
              <div style={{ flex: 1, padding: px(8), borderRight: p.showTotals && p.totalsSide !== "left" ? V(1) : undefined, borderLeft: p.showTotals && p.totalsSide === "left" ? V(1) : undefined }}>
                {sections.map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 ? sep : null}
                    {s}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {p.showTotals ? (
              <div style={{ width: px(215) }}>
                {row("Subtotal (after line discounts)", fmt(d.subtotal))}
                {d.discount > 0 && row("Additional Discount", `- ${fmt(d.discount)}`)}
                {d.taxAmt > 0 && (d.isInterState ? row("IGST", fmt(d.taxAmt)) : <>{row("CGST", fmt(taxHalf))}{row("SGST", fmt(taxHalf))}</>)}
                {row("Grand Total", fmt(d.total), { background: "#f0f0f0", fontWeight: bold })}
                {row("(−) Amount Paid", fmt(d.paid))}
                {row("Balance Due", fmt(d.balance), { background: d.balance > 0 ? "#fff5f5" : "#f0fdf4", fontWeight: bold })}
              </div>
            ) : null}
          </div>
        );
      }

      case "taxSummary": {
        if (!(d.taxAmt > 0) || !d.taxRows.length) {
          return d.taxAmt > 0 ? null : <div style={text(7.5, { color: T.muted, padding: `${px(5)}px ${px(8)}px`, borderBottom: H(1) })}>Healthcare services on this invoice are exempt from GST.</div>;
        }
        const cell = (v: string, b = false) => <div style={{ flex: 1, textAlign: "right", fontSize: fs(7.5), fontWeight: b ? bold : 400 }}>{v}</div>;
        const first = (v: string, b = false) => <div style={{ width: px(90), fontSize: fs(7.5), fontWeight: b ? bold : 400 }}>{v}</div>;
        const total = d.taxRows.reduce((s, r) => ({ taxable: s.taxable + r.taxable, tax: s.tax + r.tax }), { taxable: 0, tax: 0 });
        return (
          <div style={{ borderBottom: H(1), breakInside: "avoid" }}>
            <div style={{ display: "flex", padding: px(4), background: T.headerBg, borderBottom: H(0.5) }}>
              {first("HSN / SAC", true)}{cell("Taxable Value", true)}
              {d.isInterState ? <>{cell("IGST Rate", true)}{cell("IGST Amt", true)}</> : <>{cell("CGST Rate", true)}{cell("CGST Amt", true)}{cell("SGST Rate", true)}{cell("SGST Amt", true)}</>}
              {cell("Total Tax", true)}
            </div>
            {d.taxRows.map((r, i) => (
              <div key={i} style={{ display: "flex", padding: px(4), borderBottom: soft }}>
                {first(r.hsn)}{cell(fmt(r.taxable))}
                {d.isInterState ? <>{cell(`${r.rate}%`)}{cell(fmt(r.tax))}</> : <>{cell(`${r.rate / 2}%`)}{cell(fmt(r.tax / 2))}{cell(`${r.rate / 2}%`)}{cell(fmt(r.tax / 2))}</>}
                {cell(fmt(r.tax))}
              </div>
            ))}
            <div style={{ display: "flex", padding: px(4), background: "#f0f0f0" }}>
              {first("Total", true)}{cell(fmt(total.taxable), true)}
              {d.isInterState ? <>{cell(" ", true)}{cell(fmt(total.tax), true)}</> : <>{cell(" ", true)}{cell(fmt(total.tax / 2), true)}{cell(" ", true)}{cell(fmt(total.tax / 2), true)}</>}
              {cell(fmt(total.tax), true)}
            </div>
          </div>
        );
      }

    }
    return core.renderCommon(b);
  };

  return { renderBlock, renderStaticFloat: core.renderStaticFloat, ctx, px, H, V, full };
}

/** The printable invoice page (A4) for a saved design. */
export function InvoiceSheetPage({ template, data, logo }: { template: InvoiceTemplate; data: SheetData; logo?: string }) {
  return <SheetPage template={template} sheet={makeSheet({ template, data, logo, k: 96 / 72 })} />;
}
