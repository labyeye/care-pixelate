import { writePrintDocument } from "./printWindow";
// Printable prescription for the patient portal. Opens a print window (Save as PDF from there),
// same approach as the invoice PDF. All interpolated values are escaped.
import { escapeHtml as esc } from "./escapeHtml";
import type { Consultation, Doctor, Patient, Tenant } from "@/types";

const obj = <T>(v: unknown): T | undefined =>
  v && typeof v === "object" ? (v as T) : undefined;
const date = (v?: string) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const age = (dob?: string) => {
  if (!dob) return "";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000);
  return y >= 0 && y < 150 ? `${y} yrs` : "";
};

export function buildPrescriptionHTML(
  c: Consultation,
  tenant: Tenant | null,
): string {
  const p = obj<Patient>(c.patientId);
  const d = obj<Doctor>(c.doctorId);
  const org = esc(tenant?.gstDetails?.legalName || tenant?.name || "Clinic");
  const addr = [
    tenant?.contact?.address,
    tenant?.contact?.city,
    tenant?.contact?.state,
    tenant?.contact?.pincode,
  ]
    .filter(Boolean)
    .map(esc)
    .join(", ");
  const items = c.prescription?.items ?? [];
  const rows = items
    .map(
      (i, n) =>
        `<tr><td>${n + 1}</td><td><b>${esc(i.drug)}</b></td><td>${esc(i.dose || "—")}</td><td>${esc(i.frequency || "—")}</td><td>${i.days ? esc(i.days) + " days" : "—"}</td><td>${esc(i.instructions || "")}</td></tr>`,
    )
    .join("");
  const spec = (d?.professionalDetails?.specializations ?? []).join(", ");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Prescription ${esc(date(c.signedAt))}</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { border: 1.5pt solid #222; }
.head { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1.5pt solid #222; background: #F0F6FF; }
.head h1 { font-size: 15pt; color: #024BAB; } .head p { font-size: 8.5pt; color: #444; margin-top: 2px; }
.rx { font-size: 22pt; font-weight: 700; color: #024BAB; }
.row { display: flex; border-bottom: 1pt solid #222; } .row > div { flex: 1; padding: 8px 12px; } .row > div + div { border-left: 1pt solid #222; }
.lbl { font-size: 7.5pt; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
.sec { padding: 10px 12px; border-bottom: 1pt solid #222; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th { background: #ececec; text-align: left; font-size: 8.5pt; padding: 5px; border-bottom: 1pt solid #222; }
td { padding: 6px 5px; border-bottom: .5pt solid #ddd; font-size: 9pt; vertical-align: top; }
.foot { display: flex; justify-content: space-between; align-items: flex-end; padding: 12px; min-height: 70px; }
.sig { text-align: right; font-size: 9pt; } .sig .line { width: 170px; border-top: 1pt solid #222; margin: 28px 0 3px auto; }
.note { text-align: center; font-size: 7.5pt; color: #888; padding: 6px; border-top: 1pt solid #222; }
</style></head><body><div class="sheet">
<div class="head"><div><h1>${org}</h1>${addr ? `<p>${addr}</p>` : ""}${tenant?.contact?.phone ? `<p>Phone: ${esc(tenant.contact.phone)}</p>` : ""}</div><div class="rx">℞</div></div>
<div class="row">
  <div><div class="lbl">Patient</div><b>${esc(p?.name || "—")}</b><br/>${esc([p?.patientId, age(p?.dateOfBirth), p?.gender].filter(Boolean).join(" · "))}</div>
  <div><div class="lbl">Doctor</div><b>Dr. ${esc((d?.name || "—").replace(/^Dr\.?\s+/i, ""))}</b><br/>${esc(spec)}${d?.professionalDetails?.registrationNumber ? `<br/>Reg. No: ${esc(d.professionalDetails.registrationNumber)}` : ""}</div>
  <div><div class="lbl">Date</div><b>${esc(date(c.signedAt || c.createdAt))}</b>${c.followUpOn ? `<br/>Follow-up: ${esc(date(c.followUpOn))}` : ""}</div>
</div>
${c.complaints ? `<div class="sec"><div class="lbl">Complaints</div>${esc(c.complaints)}</div>` : ""}
${c.diagnosis?.length ? `<div class="sec"><div class="lbl">Diagnosis</div>${esc(c.diagnosis.join(", "))}</div>` : ""}
<div class="sec"><div class="lbl">Medicines</div>
${items.length ? `<table><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>${rows}</tbody></table>` : "<i>No medicines prescribed.</i>"}
</div>
${c.prescription?.advice ? `<div class="sec"><div class="lbl">Advice</div>${esc(c.prescription.advice)}</div>` : ""}
<div class="foot"><div style="font-size:8pt;color:#666">Digitally issued via NestCare</div><div class="sig"><div class="line"></div><b>Dr. ${esc((d?.name || "").replace(/^Dr\.?\s+/i, ""))}</b></div></div>
<div class="note">This is a computer-generated prescription. Take medicines only as advised by your doctor.</div>
</div></body></html>`;
}

export function printPrescription(
  c: Consultation,
  tenant: Tenant | null,
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  writePrintDocument(w, buildPrescriptionHTML(c, tenant), true);
  return true;
}
