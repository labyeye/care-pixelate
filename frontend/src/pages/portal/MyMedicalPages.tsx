import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText, FlaskConical, Pill, Printer, Receipt } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { openInvoicePDF } from "@/lib/openInvoice";
import { downloadLabPdf } from "@/lib/labReport";
import { openConsultationPDF } from "@/lib/openInvoice";
import { portalAPI } from "@/services/api";
import type { Consultation } from "@/types";
import type { Invoice, LabOrder } from "@/types/billing";
import { toast } from "sonner";
import { doctorLabel, Empty, fmtDate, fmtDateTime, inr, Intro, specialityOf, useProfiles, WhoTag } from "./shared";

const Loading = () => <Skeleton className="h-32 w-full" />;

/* ------------------------------- Prescriptions ------------------------------- */

export function MyPrescriptionsPage() {
  const { tenant } = useAuth();
  const profiles = useProfiles();
  const q = useQuery({ queryKey: ["portal", "prescriptions"], queryFn: portalAPI.prescriptions });

  const print = (c: Consultation) => openConsultationPDF(c, tenant) || toast.error("Allow pop-ups to print the prescription");

  return (
    <AppLayout title="Prescriptions">
      <Intro>Every signed consultation and prescription from your doctors. Print or save any of them as a PDF.</Intro>
      {q.isLoading ? (
        <Loading />
      ) : !q.data?.length ? (
        <Empty icon={Pill} text="No prescriptions yet. They appear here once your doctor signs a consultation." />
      ) : (
        <div className="space-y-4">
          {q.data.map((c) => (
            <div key={c._id} className="border-2 border-black bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-[#F8FAFF] px-4 py-3">
                <div>
                  <p className="font-bold">
                    {doctorLabel(c.doctorId)} <WhoTag profiles={profiles.data} id={c.patientId} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {specialityOf(c.doctorId) || "General"} · {fmtDate(c.signedAt || c.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => print(c)}>
                  <Printer className="h-4 w-4" /> Print / PDF
                </Button>
              </div>
              <div className="space-y-3 p-4 text-sm">
                {!!c.diagnosis?.length && (
                  <p>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Diagnosis </span>
                    {c.diagnosis.join(", ")}
                  </p>
                )}
                {c.prescription?.items?.length ? (
                  <div className="overflow-auto border-2 border-black">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b-2 border-black bg-[#024BAB]/5 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2">Medicine</th>
                          <th className="px-3 py-2">Dose</th>
                          <th className="px-3 py-2">Frequency</th>
                          <th className="px-3 py-2">Days</th>
                          <th className="px-3 py-2">Instructions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.prescription.items.map((i, n) => (
                          <tr key={n} className="border-b border-black/10 last:border-0">
                            <td className="px-3 py-2 font-bold">{i.drug}</td>
                            <td className="px-3 py-2">{i.dose || "—"}</td>
                            <td className="px-3 py-2">{i.frequency || "—"}</td>
                            <td className="px-3 py-2">{i.days ?? "—"}</td>
                            <td className="px-3 py-2">{i.instructions || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No medicines prescribed.</p>
                )}
                {c.prescription?.advice && (
                  <p>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advice </span>
                    {c.prescription.advice}
                  </p>
                )}
                {c.followUpOn && <p className="font-semibold text-[#024BAB]">Follow-up on {fmtDate(c.followUpOn)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

/* -------------------------------- Lab reports -------------------------------- */

export function MyLabReportsPage() {
  const { tenant } = useAuth();
  const profiles = useProfiles();
  const q = useQuery({ queryKey: ["portal", "labs"], queryFn: portalAPI.labOrders });
  const [view, setView] = useState<LabOrder | null>(null);
  const org = tenant?.branding?.appName || tenant?.name || "NestCare";
  const abnormal = (o: LabOrder) => o.tests.filter((t) => t.flag === "high" || t.flag === "low").length;

  return (
    <AppLayout title="Lab Reports">
      <Intro>Tests ordered by your doctors and their results. Results show up here as soon as the lab reports them.</Intro>
      {q.isLoading ? (
        <Loading />
      ) : !q.data?.length ? (
        <Empty icon={FlaskConical} text="No lab orders yet." />
      ) : (
        <div className="space-y-3">
          {q.data.map((o) => (
            <div key={o._id} className="flex flex-col gap-3 border-2 border-black bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">
                  {o.number} <WhoTag profiles={profiles.data} id={o.patientId} />
                </p>
                <p className="text-sm">{o.tests.map((t) => t.name).join(", ")}</p>
                <p className="text-xs text-muted-foreground">
                  Ordered {fmtDate(o.createdAt)} · {doctorLabel(o.doctorId)}
                  {o.status === "resulted" && abnormal(o) > 0 && <span className="ml-2 font-bold text-red-600">{abnormal(o)} abnormal</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={o.status} />
                <Button size="sm" variant="outline" disabled={o.status !== "resulted"} onClick={() => setView(o)}>
                  <Eye className="h-4 w-4" /> View
                </Button>
                <Button size="sm" variant="outline" disabled={o.status !== "resulted"} onClick={() => downloadLabPdf(o, org)}>
                  <Download className="h-4 w-4" /> PDF
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{view?.number} — results</DialogTitle>
          </DialogHeader>
          {view && (
            <>
              <p className="text-xs text-muted-foreground">Reported {fmtDateTime(view.resultedAt)}</p>
              <div className="overflow-auto border-2 border-black">
                <table className="w-full text-left text-sm">
                  <thead className="border-b-2 border-black bg-[#024BAB]/5 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Test</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.tests.map((t, i) => (
                      <tr key={i} className="border-b border-black/10 last:border-0">
                        <td className="px-3 py-2 font-bold">{t.name}</td>
                        <td className={`px-3 py-2 ${t.flag === "high" || t.flag === "low" ? "font-bold text-red-600" : ""}`}>
                          {t.result || "—"} {t.unit}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{t.refLow != null || t.refHigh != null ? `${t.refLow ?? ""} – ${t.refHigh ?? ""}` : "—"}</td>
                        <td className="px-3 py-2 capitalize">{t.flag || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {view.notes && <p className="border-2 border-black bg-[#F8FAFF] p-3 text-sm">{view.notes}</p>}
              <Button className="self-end" onClick={() => downloadLabPdf(view, org)}>
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/* ---------------------------------- Invoices ---------------------------------- */

export function MyInvoicesPage() {
  const { tenant } = useAuth();
  const profiles = useProfiles();
  const q = useQuery({ queryKey: ["portal", "invoices"], queryFn: portalAPI.invoices });
  const [view, setView] = useState<Invoice | null>(null);

  const due = (i: Invoice) => Math.max(0, Math.round((i.total - (i.paid || 0)) * 100) / 100);
  const totalDue = (q.data ?? []).reduce((s, i) => s + due(i), 0);
  const pdf = (i: Invoice) => openInvoicePDF(i, tenant) || toast.error("Allow pop-ups to download the invoice");

  return (
    <AppLayout title="Invoices">
      <Intro>Your bills from the clinic and what has been paid. Payments for dues are collected at the clinic.</Intro>

      {totalDue > 0 && (
        <div className="mb-4 flex items-center gap-3 border-2 border-[#FA731C] bg-[#FA731C]/5 p-4">
          <Receipt className="h-5 w-5 text-[#FA731C]" />
          <p className="text-sm font-bold text-[#FA731C]">You have {inr(totalDue)} outstanding across your invoices.</p>
        </div>
      )}

      {q.isLoading ? (
        <Loading />
      ) : !q.data?.length ? (
        <Empty icon={FileText} text="No invoices yet." />
      ) : (
        <div className="space-y-3">
          {q.data.map((i) => (
            <div key={i._id} className="flex flex-col gap-3 border-2 border-black bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">
                  {i.number} <WhoTag profiles={profiles.data} id={i.patientId} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(i.createdAt)} · {i.items.map((l) => l.description).slice(0, 2).join(", ")}
                  {i.items.length > 2 ? ` +${i.items.length - 2} more` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-bold">{inr(i.total)}</p>
                  {due(i) > 0 && <p className="text-xs font-bold text-red-600">Due {inr(due(i))}</p>}
                </div>
                <StatusBadge status={i.status} />
                <Button size="sm" variant="outline" onClick={() => setView(i)}>
                  <Eye className="h-4 w-4" /> View
                </Button>
                <Button size="sm" variant="outline" onClick={() => pdf(i)}>
                  <Download className="h-4 w-4" /> PDF
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice {view?.number}</DialogTitle>
          </DialogHeader>
          {view && (
            <>
              <div className="overflow-auto border-2 border-black">
                <table className="w-full text-left text-sm">
                  <thead className="border-b-2 border-black bg-[#024BAB]/5 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.items.map((l, n) => (
                      <tr key={n} className="border-b border-black/10 last:border-0">
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 text-right">{l.qty}</td>
                        <td className="px-3 py-2 text-right">{inr(l.rate)}</td>
                        <td className="px-3 py-2 text-right">{inr(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{inr(view.subtotal)}</span></div>
                {view.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{inr(view.discount)}</span></div>}
                {view.gst > 0 && <div className="flex justify-between"><span>GST</span><span>{inr(view.gst)}</span></div>}
                <div className="flex justify-between border-t-2 border-black pt-1 font-bold"><span>Total</span><span>{inr(view.total)}</span></div>
                <div className="flex justify-between"><span>Paid</span><span>{inr(view.paid)}</span></div>
                <div className="flex justify-between font-bold text-red-600"><span>Balance</span><span>{inr(due(view))}</span></div>
              </div>
              {!!view.payments?.length && (
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payments</p>
                  {view.payments.map((p, n) => (
                    <p key={n} className="text-sm">{fmtDate(p.receivedAt)} · <span className="uppercase">{p.mode}</span> · <b>{inr(p.amount)}</b></p>
                  ))}
                </div>
              )}
              <Button className="self-end" onClick={() => pdf(view)}>
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
