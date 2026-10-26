import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Doctor, Patient } from "@/types";
import type { LabOrder, LabStaffRef } from "@/types/billing";

const stamp = (d?: string) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const person = (v: LabOrder["assignedTo"]) =>
  v && typeof v === "object" ? (v as LabStaffRef).name : "";
const patientOf = (o: LabOrder) =>
  typeof o.patientId === "object" ? (o.patientId as Patient) : null;
const doctorOf = (o: LabOrder) =>
  o.doctorId && typeof o.doctorId === "object" ? (o.doctorId as Doctor) : null;

const ageOf = (dob?: string) =>
  dob
    ? `${Math.max(0, Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000))} y`
    : "";

const range = (t: LabOrder["tests"][number]) =>
  t.refLow != null || t.refHigh != null
    ? `${t.refLow ?? ""} – ${t.refHigh ?? ""}`
    : "";

/** Builds and downloads a lab report PDF (client-side, no server round trip). */
export function downloadLabPdf(o: LabOrder, orgName: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const p = patientOf(o);
  const d = doctorOf(o);

  doc
    .setFont("helvetica", "bold")
    .setFontSize(18)
    .text(orgName || "NestDoc", 40, 48);
  doc
    .setFontSize(11)
    .setFont("helvetica", "normal")
    .text("Laboratory Report", 40, 66);
  doc
    .setFont("helvetica", "bold")
    .text(o.number, W - 40, 48, { align: "right" });
  doc
    .setFont("helvetica", "normal")
    .setFontSize(10)
    .text(o.status.toUpperCase(), W - 40, 66, { align: "right" });
  doc
    .setDrawColor(0)
    .setLineWidth(1.5)
    .line(40, 78, W - 40, 78);

  const left = [
    ["Patient", p ? p.name : "—"],
    ["Patient ID", p?.patientId ?? "—"],
    [
      "Age / Gender",
      p ? `${ageOf(p.dateOfBirth)}${p.gender ? ` · ${p.gender}` : ""}` : "—",
    ],
    ["Ordered by", d ? `Dr. ${d.name}` : "—"],
  ];
  const right = [
    ["Ordered", stamp(o.createdAt)],
    [
      "Sample collected",
      `${stamp(o.collectedAt)}${person(o.collectedBy) ? ` · ${person(o.collectedBy)}` : ""}`,
    ],
    [
      "Reported",
      `${stamp(o.resultedAt)}${person(o.resultedBy) ? ` · ${person(o.resultedBy)}` : ""}`,
    ],
    ["Performed by", person(o.assignedTo) || "—"],
  ];
  doc.setFontSize(9.5);
  left.forEach(([k, v], i) => {
    doc.setFont("helvetica", "bold").text(`${k}:`, 40, 100 + i * 15);
    doc.setFont("helvetica", "normal").text(String(v), 120, 100 + i * 15);
  });
  right.forEach(([k, v], i) => {
    doc.setFont("helvetica", "bold").text(`${k}:`, 300, 100 + i * 15);
    doc
      .setFont("helvetica", "normal")
      .text(String(v), 390, 100 + i * 15, { maxWidth: W - 430 });
  });

  autoTable(doc, {
    startY: 175,
    head: [["Test", "Result", "Unit", "Reference range", "Flag"]],
    body: o.tests.map((t) => [
      t.name,
      t.result || "—",
      t.unit || "",
      range(t),
      (t.flag || "").toUpperCase(),
    ]),
    styles: {
      fontSize: 10,
      cellPadding: 6,
      lineColor: [0, 0, 0],
      lineWidth: 0.4,
    },
    headStyles: { fillColor: [2, 75, 171], textColor: 255 },
    didParseCell: (h) => {
      if (h.section === "body" && h.column.index === 4) {
        const f = String(h.cell.raw);
        if (f === "HIGH") h.cell.styles.textColor = [185, 28, 28];
        if (f === "LOW") h.cell.styles.textColor = [180, 83, 9];
        h.cell.styles.fontStyle = "bold";
      }
    },
  });

  const y =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 300) + 24;
  if (o.notes) {
    doc.setFont("helvetica", "bold").setFontSize(10).text("Remarks", 40, y);
    doc
      .setFont("helvetica", "normal")
      .text(doc.splitTextToSize(o.notes, W - 80), 40, y + 14);
  }
  doc
    .setFontSize(8)
    .setTextColor(120)
    .text(
      `Generated ${stamp(new Date().toISOString())} · NestDoc`,
      40,
      doc.internal.pageSize.getHeight() - 28,
    );

  doc.save(`${o.number}.pdf`);
}

/** wa.me click-to-chat link prefilled with the report summary (patient's number, India default). */
export function whatsappUrl(o: LabOrder, orgName: string): string | null {
  const p = patientOf(o);
  const digits = (p?.contact?.phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const phone = digits.length === 10 ? `91${digits}` : digits;
  const lines = [
    `*${orgName || "NestDoc"} — Lab report*`,
    `Order: ${o.number}`,
    p ? `Patient: ${p.name}${p.patientId ? ` (${p.patientId})` : ""}` : "",
    `Ordered: ${stamp(o.createdAt)}`,
    o.status === "resulted"
      ? `Reported: ${stamp(o.resultedAt)}`
      : `Status: ${o.status}`,
    "",
    ...(o.status === "resulted"
      ? o.tests.map(
          (t) =>
            `• ${t.name}: ${t.result}${t.unit ? ` ${t.unit}` : ""}${range(t) ? ` (ref ${range(t)})` : ""}${t.flag && t.flag !== "normal" ? ` — ${t.flag.toUpperCase()}` : ""}`,
        )
      : o.tests.map((t) => `• ${t.name}`)),
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}
