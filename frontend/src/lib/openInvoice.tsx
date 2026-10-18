import { writePrintDocument } from "./printWindow";
// Opens a printable invoice (Save as PDF from the print dialog). When the clinic saved a design in
// Settings -> Invoice Designer, that design is rendered; otherwise the classic invoice is used.
import { renderToStaticMarkup } from "react-dom/server";
import { ConsultationSheetPage } from "@/components/invoice/ConsultationSheet";
import { InvoiceSheetPage } from "@/components/invoice/InvoiceSheet";
import { buildInvoiceHTML } from "@/lib/buildInvoiceHTML";
import {
  sheetFromConsultation,
  type ConsultSheetData,
} from "@/lib/consultationSheetData";
import { printPrescription } from "@/lib/prescriptionPrint";
import { sheetFromInvoice, type SheetData } from "@/lib/invoiceSheetData";
import { normalizeTemplate, type InvoiceTemplate } from "@/lib/invoiceTemplate";
import type { Consultation, Tenant } from "@/types";
import type { Invoice } from "@/types/billing";

const logoOf = (t: Tenant | null | undefined) =>
  t?.branding?.logoUrl &&
  /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(t.branding.logoUrl)
    ? t.branding.logoUrl
    : undefined;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const wrapDocument = (
  title: string,
  body: string,
) => `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
@page { margin: 0; size: A4; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${body}</body></html>`;

/** A full HTML document of one invoice sheet drawn from `template`. */
export function sheetDocument(
  template: InvoiceTemplate,
  data: SheetData,
  logo?: string,
): string {
  return wrapDocument(
    `${data.title} ${data.invNo}`,
    renderToStaticMarkup(
      <InvoiceSheetPage template={template} data={data} logo={logo} />,
    ),
  );
}

/** The consultation / prescription drawn from the clinic's Consultation Designer template. */
export function consultationDocument(
  template: InvoiceTemplate,
  data: ConsultSheetData,
  logo?: string,
): string {
  return wrapDocument(
    `${data.title} — ${data.patient.name}`,
    renderToStaticMarkup(
      <ConsultationSheetPage template={template} data={data} logo={logo} />,
    ),
  );
}

const write = (w: Window, html: string) => {
  writePrintDocument(w, html, true);
};

/** Pass a window opened synchronously in the click handler when the invoice has to be fetched first. */
export function openInvoicePDF(
  inv: Invoice,
  tenant: Tenant | null,
  win?: Window | null,
): boolean {
  const w = win ?? window.open("", "_blank");
  if (!w) return false;
  const saved = tenant?.invoiceTemplate;
  write(
    w,
    saved
      ? sheetDocument(
          normalizeTemplate(saved),
          sheetFromInvoice(inv, tenant),
          logoOf(tenant),
        )
      : buildInvoiceHTML(inv, tenant),
  );
  return true;
}

/**
 * Prints a completed consultation: with the clinic's Consultation Designer template when one is saved,
 * otherwise the classic prescription. Pass a window opened synchronously in the click handler.
 */
export function openConsultationPDF(
  c: Consultation,
  tenant: Tenant | null,
  win?: Window | null,
): boolean {
  const saved = tenant?.consultationTemplate;
  if (!saved) {
    if (win) win.close();
    return printPrescription(c, tenant);
  }
  const w = win ?? window.open("", "_blank");
  if (!w) return false;
  write(
    w,
    consultationDocument(
      normalizeTemplate(saved, "consultation"),
      sheetFromConsultation(c, tenant),
      logoOf(tenant),
    ),
  );
  return true;
}

/** Designer "Preview PDF" for the consultation design. */
export function previewConsultationDesign(
  template: InvoiceTemplate,
  data: ConsultSheetData,
  tenant: Tenant | null,
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  write(w, consultationDocument(template, data, logoOf(tenant)));
  return true;
}

/** Designer "Preview PDF": the unsaved design with sample data. */
export function previewDesign(
  template: InvoiceTemplate,
  data: SheetData,
  tenant: Tenant | null,
): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  write(w, sheetDocument(template, data, logoOf(tenant)));
  return true;
}

export { logoOf };
