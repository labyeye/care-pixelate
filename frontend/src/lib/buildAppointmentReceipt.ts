import { writePrintDocument } from "./printWindow";
// Printable booking receipt for an appointment. Same bordered look as the invoice PDF; opened in a print
// window so "Save as PDF" gives the file. Used by the clinic (Appointments page) and the patient portal.
import { escapeHtml as esc } from "./escapeHtml";
import type { Appointment, Doctor, Patient, Tenant } from "@/types";

const obj = <T>(v: unknown): T | undefined =>
  v && typeof v === "object" ? (v as T) : undefined;
const inr = (n: number) =>
  "Rs. " +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const when = (v: string) => ({
  date: new Date(v).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }),
  time: new Date(v).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

/** Stable receipt number derived from the booking (no extra field to store): BKG-20260115-A1B2C. */
export const receiptNumber = (
  a: Pick<Appointment, "_id" | "createdAt" | "scheduledAt">,
) =>
  `BKG-${new Date(a.createdAt ?? a.scheduledAt).toISOString().slice(0, 10).replace(/-/g, "")}-${a._id.slice(-5).toUpperCase()}`;

type WithPayment = Appointment & {
  paymentStatus?: "unpaid" | "paid" | "waived";
  payment?: { gateway?: string; paymentId?: string; paidAt?: string };
};

export function buildReceiptHTML(
  appt: Appointment,
  tenant: Tenant | null,
  patientFallback?: Patient,
): string {
  const a = appt as WithPayment;
  const patient = obj<Patient>(a.patientId) ?? patientFallback;
  const doctor = obj<Doctor>(a.doctorId);
  const { date, time } = when(a.scheduledAt);
  const fee = a.fee ?? 0;
  const status = a.paymentStatus ?? "unpaid";

  const clinic = esc(tenant?.gstDetails?.legalName || tenant?.name || "Clinic");
  const address = [
    tenant?.contact?.address,
    tenant?.contact?.city,
    tenant?.contact?.state,
    tenant?.contact?.pincode,
  ]
    .filter(Boolean)
    .map(esc)
    .join(", ");
  const contact = [tenant?.contact?.phone, tenant?.contact?.email]
    .filter(Boolean)
    .map(esc)
    .join(" &nbsp;|&nbsp; ");
  const logo =
    tenant?.branding?.logoUrl &&
    /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(
      tenant.branding.logoUrl,
    )
      ? tenant.branding.logoUrl
      : "";
  const speciality = (doctor?.professionalDetails?.specializations ?? []).join(
    ", ",
  );
  const mode =
    a.type === "video"
      ? "Video consultation"
      : a.type === "walk_in"
        ? "Walk-in"
        : "In-clinic visit";

  const payNote =
    status === "paid"
      ? `Paid${a.payment?.paidAt ? " on " + new Date(a.payment.paidAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}${a.payment?.paymentId ? " · Ref " + esc(a.payment.paymentId) : ""}`
      : status === "waived"
        ? "Consultation fee waived"
        : "Payable at the clinic";
  const stamp =
    status === "paid"
      ? "PAID"
      : status === "waived"
        ? "WAIVED"
        : a.status === "cancelled"
          ? "CANCELLED"
          : "CONFIRMED";
  const stampColor =
    a.status === "cancelled"
      ? "#b91c1c"
      : status === "unpaid"
        ? "#024BAB"
        : "#047857";

  const row = (k: string, v: string) =>
    `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Booking receipt ${esc(receiptNumber(a))}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;background:#fff;padding:24px}
  .sheet{max-width:720px;margin:0 auto;border:2px solid #0a0a0a}
  .title{background:#024BAB;color:#fff;text-align:center;font-weight:800;letter-spacing:.12em;padding:10px;font-size:15px}
  .head{display:flex;justify-content:space-between;gap:16px;padding:16px;border-bottom:2px solid #0a0a0a}
  .head img{max-height:56px;margin-bottom:6px;display:block}
  .clinic{font-size:18px;font-weight:800}
  .muted{color:#555;font-size:12px;line-height:1.5}
  .meta{text-align:right;font-size:12px;line-height:1.7}
  .meta b{font-size:13px}
  .stamp{display:inline-block;margin-top:6px;border:2px solid ${stampColor};color:${stampColor};padding:2px 10px;font-weight:800;letter-spacing:.1em;font-size:13px;transform:rotate(-3deg)}
  .grid{display:grid;grid-template-columns:1fr 1fr}
  .box{padding:14px 16px;border-bottom:2px solid #0a0a0a}
  .box + .box{border-left:2px solid #0a0a0a}
  .label{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#024BAB;margin-bottom:6px}
  table{width:100%;border-collapse:collapse}
  td{padding:5px 0;font-size:13px;vertical-align:top}
  td.k{color:#555;width:38%}
  td.v{font-weight:700}
  .when{padding:16px;border-bottom:2px solid #0a0a0a;display:flex;justify-content:space-between;align-items:center;background:#F8FAFF}
  .when .big{font-size:20px;font-weight:800}
  .token{border:2px solid #0a0a0a;padding:6px 14px;text-align:center}
  .token b{display:block;font-size:24px}
  .fee{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0a0a0a}
  .fee .amt{font-size:20px;font-weight:800}
  .notes{padding:14px 16px;font-size:11.5px;line-height:1.7;color:#333}
  .foot{padding:10px 16px;text-align:center;font-size:10.5px;color:#666;border-top:2px solid #0a0a0a}
  @media print{body{padding:0}.sheet{border-width:2px}}
</style></head>
<body><div class="sheet">
  <div class="title">APPOINTMENT BOOKING RECEIPT</div>
  <div class="head">
    <div>
      ${logo ? `<img src="${logo}" alt=""/>` : ""}
      <div class="clinic">${clinic}</div>
      ${address ? `<div class="muted">${address}</div>` : ""}
      ${contact ? `<div class="muted">${contact}</div>` : ""}
      ${tenant?.gstDetails?.gstin ? `<div class="muted">GSTIN: ${esc(tenant.gstDetails.gstin)}</div>` : ""}
    </div>
    <div class="meta">
      Receipt no: <b>${esc(receiptNumber(a))}</b><br/>
      Booked on: <b>${esc(new Date(a.createdAt ?? a.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</b><br/>
      <span class="stamp">${stamp}</span>
    </div>
  </div>

  <div class="when">
    <div>
      <div class="label">Appointment</div>
      <div class="big">${esc(date)} · ${esc(time)}</div>
      <div class="muted">${esc(mode)}</div>
    </div>
    ${a.tokenNo ? `<div class="token"><span class="muted">Token</span><b>${a.tokenNo}</b></div>` : ""}
  </div>

  <div class="grid">
    <div class="box">
      <div class="label">Patient</div>
      <table>
        ${row("Name", esc(patient?.name || "—"))}
        ${patient?.patientId ? row("Patient ID", esc(patient.patientId)) : ""}
        ${patient?.contact?.phone ? row("Phone", esc(patient.contact.phone)) : ""}
      </table>
    </div>
    <div class="box">
      <div class="label">Doctor</div>
      <table>
        ${row("Name", esc(doctor?.name ? "Dr. " + doctor.name.replace(/^Dr\.?\s+/i, "") : "—"))}
        ${speciality ? row("Speciality", esc(speciality)) : ""}
        ${a.reason ? row("Reason", esc(a.reason)) : ""}
      </table>
    </div>
  </div>

  <div class="fee">
    <div>
      <div class="label">Consultation fee</div>
      <div class="muted">${payNote}</div>
    </div>
    <div class="amt">${fee > 0 ? inr(fee) : "—"}</div>
  </div>

  <div class="notes">
    1. Please arrive 10 minutes before your slot and carry this receipt with a photo ID.<br/>
    2. To reschedule or cancel, contact the clinic or use the patient portal in advance.<br/>
    3. Quote the receipt number for any query about this booking.
  </div>
  <div class="foot">This is a computer-generated receipt and does not require a signature.</div>
</div></body></html>`;
}

/** Writes the receipt into a print window (Save as PDF from there). Returns false if the pop-up was blocked. */
export function openAppointmentReceipt(
  appt: Appointment,
  tenant: Tenant | null,
  patientFallback?: Patient,
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  writePrintDocument(w, buildReceiptHTML(appt, tenant, patientFallback), true);
  return true;
}
