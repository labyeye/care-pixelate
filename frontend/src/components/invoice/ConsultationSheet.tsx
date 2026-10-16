import React from "react";
import type { ConsultSheetData } from "@/lib/consultationSheetData";
import { type Block, type InvoiceTemplate, type VarCtx } from "@/lib/invoiceTemplate";
import { dateStr, makeCore, SheetPage, type BuildOpts, type SheetApi } from "./sheetCore";

export interface ConsultSheetOpts extends BuildOpts {
  template: InvoiceTemplate;
  data: ConsultSheetData;
  logo?: string;
}

/**
 * The consultation / prescription as a designed document: clinic header, patient & doctor, vitals, complaints &
 * diagnosis, the ℞ medicine table, advice and follow-up, then the shared declaration + signature.
 * Used for the Consultation Designer preview and for the printed prescription of a completed consultation.
 */
export function makeConsultSheet(o: ConsultSheetOpts): SheetApi {
  const { template, data: d } = o;
  const vars: VarCtx = {
    "company.name": d.company.name,
    "company.phone": d.company.phone || "",
    "company.email": d.company.email || "",
    "patient.name": d.patient.name,
    "doctor.name": d.doctor.name,
    "consultation.date": dateStr(d.date),
    "consultation.followup": d.followUp ? dateStr(d.followUp) : "",
  };
  const core = makeCore({
    ...o,
    company: d.company,
    title: d.title,
    vars,
    meta: (p) => [["Date", dateStr(d.date)], ["Doctor", d.doctor.name], ...(d.followUp ? ([["Follow-up", dateStr(d.followUp)]] as [string, string][]) : []), ...(p.showPlace ? ([["Status", "Signed"]] as [string, string][]) : [])],
    signatory: { name: d.doctor.name, title: d.doctor.spec },
    declaration: "This prescription is issued after consultation. Take the medicines only as advised by your doctor.",
  });
  const { T, px, full, H, V, soft, fs, bold, text, sec } = core;

  const renderBlock = (b: Block): React.ReactNode => {
    const p = b.props;
    switch (b.type) {
      case "patientInfo":
        return (
          <div style={{ display: "flex", borderBottom: H(1) }}>
            <div style={{ flex: 1, padding: px(8), borderRight: p.showDoctor ? V(1) : undefined }}>
              <div style={text(7, { fontWeight: bold, color: T.muted, textTransform: "uppercase", marginBottom: px(3), letterSpacing: px(0.5) })}>{p.label}</div>
              <div style={text(10, { fontWeight: bold, marginBottom: px(2) })}>{d.patient.name}</div>
              {d.patient.idLine ? <div style={text(8, { color: T.muted })}>{d.patient.idLine}</div> : null}
              {p.showContact && d.patient.phone ? <div style={text(8, { color: T.muted })}>Phone: {d.patient.phone}</div> : null}
              {p.showContact && d.patient.address ? <div style={text(8, { color: T.muted })}>{d.patient.address}</div> : null}
              {p.showAllergies && d.patient.allergies.length ? <div style={text(8, { color: "#b91c1c", fontWeight: bold, marginTop: px(2) })}>Allergies: {d.patient.allergies.join(", ")}</div> : null}
            </div>
            {p.showDoctor ? (
              <div style={{ flex: 1, padding: px(8) }}>
                <div style={text(7, { fontWeight: bold, color: T.muted, textTransform: "uppercase", marginBottom: px(3), letterSpacing: px(0.5) })}>{p.doctorLabel}</div>
                <div style={text(10, { fontWeight: bold, marginBottom: px(2) })}>{d.doctor.name}</div>
                {d.doctor.spec ? <div style={text(8, { color: T.muted })}>{d.doctor.spec}</div> : null}
                {d.doctor.reg ? <div style={text(8, { color: T.muted })}>Reg. No: {d.doctor.reg}</div> : null}
              </div>
            ) : null}
          </div>
        );

      case "vitals": {
        const v = d.vitals;
        const cells = [
          v.bp && ["BP", `${v.bp} mmHg`],
          v.pulse != null && ["Pulse", `${v.pulse} bpm`],
          v.tempC != null && ["Temp", `${v.tempC} °C`],
          v.spo2 != null && ["SpO₂", `${v.spo2} %`],
          v.weightKg != null && ["Weight", `${v.weightKg} kg`],
          v.heightCm != null && ["Height", `${v.heightCm} cm`],
        ].filter(Boolean) as [string, string][];
        if (!cells.length) return null;
        return (
          <div style={{ padding: `${px(5)}px ${px(8)}px`, borderBottom: H(1) }}>
            {sec(p.label)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: `${px(2)}px ${px(16)}px` }}>
              {cells.map(([k, val]) => (
                <div key={k} style={text(8)}><span style={{ color: T.muted, fontWeight: bold }}>{k}: </span>{val}</div>
              ))}
            </div>
          </div>
        );
      }

      case "clinical": {
        const parts: [string, React.ReactNode][] = [
          ...(p.showComplaints && d.complaints ? ([[p.complaintsLabel, d.complaints]] as [string, React.ReactNode][]) : []),
          ...(p.showDiagnosis && d.diagnosis.length ? ([[p.diagnosisLabel, <b key="d">{d.diagnosis.join(", ")}</b>]] as [string, React.ReactNode][]) : []),
          ...(p.showNotes && d.notes ? ([[p.notesLabel, d.notes]] as [string, React.ReactNode][]) : []),
        ];
        if (!parts.length) return null;
        return (
          <div style={{ padding: `${px(5)}px ${px(8)}px`, borderBottom: H(1) }}>
            {parts.map(([label, body], i) => (
              <div key={label} style={{ marginTop: i ? px(5) : 0 }}>
                {sec(label)}
                <div style={text(8.5, { whiteSpace: "pre-line" })}>{body}</div>
              </div>
            ))}
          </div>
        );
      }

      case "medicines": {
        const cols = [
          p.sno && ["sno", 24, "center", "#"],
          ["drug", 0, "left", "Medicine"],
          p.dose && ["dose", 70, "left", "Dose"],
          p.frequency && ["freq", 70, "left", "Frequency"],
          p.days && ["days", 44, "center", "Days"],
          p.instructions && ["ins", 120, "left", "Instructions"],
        ].filter(Boolean) as [string, number, "left" | "center" | "right", string][];
        const cell = (w: number, align: string, size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
          ...(w ? { width: px(w), flex: "none" } : { flex: 1 }),
          padding: `0 ${px(4)}px`,
          textAlign: align as any,
          fontSize: fs(size),
          ...extra,
        });
        const empty = Math.max(0, (Number(p.minRows) || 0) - d.items.length);
        return (
          <div style={{ borderBottom: H(1) }}>
            {p.label ? <div style={{ padding: `${px(5)}px ${px(8)}px 0`, ...text(13, { fontWeight: bold, color: T.primary }) }}>{p.label}</div> : null}
            <div style={{ display: "flex", padding: `${px(5)}px 0`, marginTop: px(3), background: p.accentHeader ? T.primary : T.headerBg, borderBottom: H(1) }}>
              {cols.map(([key, w, align, label]) => (
                <div key={key} style={cell(w, align, 7.5, { fontWeight: bold, color: p.accentHeader ? "#fff" : T.text })}>{label}</div>
              ))}
            </div>
            {d.items.map((it, i) => {
              const val: Record<string, React.ReactNode> = { sno: i + 1, drug: <b>{it.drug}</b>, dose: it.dose || "—", freq: it.frequency || "—", days: it.days ?? "—", ins: it.instructions || "—" };
              return (
                <div key={i} style={{ display: "flex", padding: `${px(5)}px 0`, minHeight: px(20), borderBottom: soft, background: p.zebra && i % 2 ? "#fafafa" : undefined, breakInside: "avoid" }}>
                  {cols.map(([key, w, align]) => (
                    <div key={key} style={cell(w, align, 8)}>{val[key]}</div>
                  ))}
                </div>
              );
            })}
            {!d.items.length ? <div style={{ padding: px(8), ...text(8, { color: T.muted }) }}>No medicines prescribed.</div> : null}
            {Array.from({ length: empty }).map((_, i) => (
              <div key={`e${i}`} style={{ height: px(16), borderBottom: soft }} />
            ))}
          </div>
        );
      }

      case "advice": {
        const showAdvice = p.showAdvice && d.advice;
        const showFollow = p.showFollowUp && d.followUp;
        if (!showAdvice && !showFollow) return null;
        return (
          <div style={{ padding: `${px(5)}px ${px(8)}px`, borderBottom: H(1) }}>
            {showAdvice ? (
              <div>
                {sec(p.adviceLabel)}
                <div style={text(8.5, { whiteSpace: "pre-line" })}>{d.advice}</div>
              </div>
            ) : null}
            {showFollow ? (
              <div style={text(9, { marginTop: showAdvice ? px(5) : 0, fontWeight: bold, color: T.primary })}>
                {p.followUpLabel}: {dateStr(d.followUp!)}
              </div>
            ) : null}
          </div>
        );
      }
    }
    return core.renderCommon(b) ?? null;
  };

  return { renderBlock, renderStaticFloat: core.renderStaticFloat, ctx: vars, px, H, V, full };
}

export function ConsultationSheetPage({ template, data, logo }: { template: InvoiceTemplate; data: ConsultSheetData; logo?: string }) {
  return <SheetPage template={template} sheet={makeConsultSheet({ template, data, logo, k: 96 / 72 })} />;
}
