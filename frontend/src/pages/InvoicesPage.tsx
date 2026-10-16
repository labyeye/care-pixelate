import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Eye, FileDown, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { inr as money, stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { Avatar, PersonCell } from "@/components/Avatar";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches, useDebounced } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { ActionButton, RowActions } from "@/components/RowActions";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { openInvoicePDF } from "@/lib/openInvoice";
import { ApiError, doctorsAPI, invoicesAPI, patientsAPI } from "@/services/api";
import type { Patient } from "@/types";
import type { BillableItem, CatalogItem, Invoice } from "@/types/billing";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const MODES = ["cash", "upi", "card", "bank", "insurance", "other"];
const MODE_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank transfer", insurance: "Insurance", other: "Other" };
const modesOf = (i: Invoice) => [...new Set(i.payments.map((p) => p.mode))];
const personName = (v?: string | { name: string }) => (v && typeof v === "object" ? v.name : "");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const isOverdue = (i: Invoice) => !!i.dueDate && (i.status === "unpaid" || i.status === "partial") && new Date(i.dueDate).getTime() < Date.now() - 86_400_000;

type Line = {
  description: string; qty: string; rate: string; gstRate: string; discountPercent: string; hsnCode: string; unit: string;
  medicineId?: string; stock?: number | null;
  source?: BillableItem["source"]; id?: string; priced?: boolean;
};
const blankLine: Line = { description: "", qty: "1", rate: "", gstRate: "0", discountPercent: "0", hsnCode: "", unit: "" };
const toLine = (it: BillableItem): Line => ({
  id: it.id,
  description: it.description,
  qty: String(it.qty),
  rate: it.rate ? String(it.rate) : "",
  gstRate: String(it.gstRate),
  discountPercent: "0",
  hsnCode: it.hsnCode ?? "",
  unit: it.unit ?? "",
  medicineId: it.medicineId,
  source: it.source,
  priced: it.priced,
});
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const lineAmount = (l: Line) => r2((Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.discountPercent) || 0) / 100));

/** Description box that suggests inventory medicines / price-list items and fills the whole row on pick. */
function CatalogInput({ value, onType, onPick, readOnly }: { value: string; onType: (v: string) => void; onPick: (it: CatalogItem) => void; readOnly?: boolean }) {
  const [focus, setFocus] = useState(false);
  const dq = useDebounced(value.replace(/^(Medicine|Lab|Service):\s*/i, ""), 250);
  const { data } = useQuery({
    queryKey: ["invoice-catalog", dq],
    queryFn: () => invoicesAPI.catalog(dq),
    enabled: focus && !readOnly && dq.trim().length >= 2,
    staleTime: 30_000,
  });
  const show = focus && !readOnly && !!data?.length;
  return (
    <div className="relative">
      <Input
        required
        readOnly={readOnly}
        className={readOnly ? "bg-muted" : ""}
        title={readOnly ? "Linked to the patient's record" : undefined}
        placeholder="Type a medicine, test or service…"
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        autoComplete="off"
      />
      {show && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-[26rem] max-w-[90vw] overflow-auto border-2 border-black bg-white shadow-lg">
          {data!.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#024BAB]/10"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus so the pick lands before blur
                  onPick(it);
                  setFocus(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{it.label}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">{it.kind}</span>
                <span className="shrink-0 text-xs font-bold">₹{it.rate}</span>
                {it.gstRate > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">GST {it.gstRate}%</span>}
                {it.stock !== null && <span className={`shrink-0 text-[10px] font-bold ${it.stock <= 0 ? "text-red-700" : "text-muted-foreground"}`}>{it.stock <= 0 ? "out of stock" : `stock ${it.stock}`}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  const qc = useQueryClient();
  const { tenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [patientId, setPatientId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState<Line[]>([{ ...blankLine }]);
  const [remember, setRemember] = useState(true);
  const [doctorId, setDoctorId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [advance, setAdvance] = useState({ amount: "", mode: "cash", reference: "" });
  const [viewId, setViewId] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [fMode, setFMode] = useState("all");

  const { data: invoices, isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => invoicesAPI.getAll() });
  const { data: patients } = useQuery({ queryKey: ["patients"], queryFn: () => patientsAPI.getAll() });
  const view = invoices?.find((i) => i._id === viewId) ?? null;
  const { data: doctors } = useQuery({ queryKey: ["doctors", "invoice"], queryFn: () => doctorsAPI.getAll(undefined, { limit: "200" }), enabled: open, staleTime: 60_000 });

  // Everything about the chosen patient that can be billed and isn't yet (visits, lab tests, medicines).
  const { data: billable, isFetching: loadingBillable } = useQuery({
    queryKey: ["billable", patientId],
    queryFn: () => invoicesAPI.billable(patientId),
    enabled: open && !!patientId,
  });
  const picked = new Set(lines.filter((l) => l.id).map((l) => l.id as string));
  const withoutBlank = (ls: Line[]) => ls.filter((l) => l.description.trim() || l.rate); // drop the untouched blank row
  const toggleItem = (it: BillableItem) =>
    setLines((ls) => (ls.some((l) => l.id === it.id) ? ls.filter((l) => l.id !== it.id) : [...withoutBlank(ls), toLine(it)]));
  const toggleGroup = (items: BillableItem[]) =>
    setLines((ls) => {
      if (items.every((it) => ls.some((l) => l.id === it.id))) return ls.filter((l) => !items.some((it) => it.id === l.id));
      const base = withoutBlank(ls);
      return [...base, ...items.filter((it) => !base.some((l) => l.id === it.id)).map(toLine)];
    });

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Request failed");
  const refresh = () => qc.invalidateQueries({ queryKey: ["invoices"] });

  const create = useMutation({
    mutationFn: () =>
      invoicesAPI.create({
        patientId,
        discount: Number(discount) || 0,
        rememberPrices: remember,
        doctorId: doctorId || undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        initialPayment: Number(advance.amount) > 0 ? { amount: Number(advance.amount), mode: advance.mode, reference: advance.reference.trim() || undefined } : undefined,
        items: lines.map((l) => ({
          description: l.description,
          qty: Number(l.qty) || 1,
          rate: Number(l.rate) || 0,
          gstRate: Number(l.gstRate) || 0,
          discountPercent: Number(l.discountPercent) || 0,
          hsnCode: l.hsnCode.trim() || undefined,
          unit: l.unit.trim() || undefined,
          medicineId: l.medicineId,
          ...(l.source ? { source: l.source } : {}),
        })),
      }),
    onSuccess: (inv) => {
      refresh();
      qc.invalidateQueries({ queryKey: ["billable"] });
      toast.success(`Invoice ${inv.number} created`);
      setOpen(false);
      setPatientId("");
      setDiscount("0");
      setLines([{ ...blankLine }]);
      setDoctorId("");
      setDueDate("");
      setNotes("");
      setAdvance({ amount: "", mode: "cash", reference: "" });
    },
    onError,
  });

  const pay = useMutation({
    mutationFn: () => invoicesAPI.pay(viewId!, { amount: Number(payAmt), mode: payMode, reference: payRef.trim() || undefined }),
    onSuccess: () => {
      refresh();
      setPayAmt("");
      setPayRef("");
      toast.success("Payment recorded");
    },
    onError,
  });

  const voidIt = useMutation({
    mutationFn: () => invoicesAPI.void(viewId!),
    onSuccess: () => {
      refresh();
      toast.success("Invoice voided");
    },
    onError,
  });

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  // picking a catalog entry fills the whole row: description, rate, GST, HSN, unit (and the inventory link)
  const pickCatalog = (i: number, it: CatalogItem) =>
    setLine(i, { description: it.description, rate: String(it.rate), gstRate: String(it.gstRate), hsnCode: it.hsnCode, unit: it.unit, medicineId: it.medicineId, stock: it.stock, priced: true });

  const taxable = r2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const gstTotal = r2(lines.reduce((s, l) => s + (lineAmount(l) * (Number(l.gstRate) || 0)) / 100, 0));
  const flatDisc = Math.min(Number(discount) || 0, taxable);
  const grand = r2(taxable - flatDisc + gstTotal);
  const advanceAmt = Number(advance.amount) || 0;

  // Fetch the full invoice (patient address, doctor) and print it in the billing-sheet design.
  // The window opens synchronously so the browser doesn't block it.
  const printInvoice = async (id: string) => {
    const win = window.open("", "_blank");
    if (!win) return toast.error("Allow pop-ups to print the invoice");
    try {
      openInvoicePDF(await invoicesAPI.getOne(id), tenant, win);
    } catch (err) {
      win.close();
      onError(err);
    }
  };
  const pName = (p: string | Patient) => (typeof p === "string" ? p : p.name);
  const due = view ? Math.round((view.total - view.paid) * 100) / 100 : 0;

  const byCard = (invoices ?? []).filter((i) =>
    cardKey === "unpaid" ? i.status === "unpaid"
    : cardKey === "due" ? i.status === "unpaid" || i.status === "partial"
    : cardKey === "paid" ? i.status === "paid"
    : true,
  );
  const inv = sm?.invoices;

  const visible = byCard.filter((x) => (fStatus === "all" || x.status === fStatus) &&
      (!fFrom || x.createdAt.slice(0, 10) >= fFrom) &&
      (!fTo || x.createdAt.slice(0, 10) <= fTo) &&
      (fMode === "all" || modesOf(x).includes(fMode)) &&
      matches(q, x.number, pName(x.patientId), typeof x.patientId === "string" ? "" : x.patientId.patientId));

  return (
    <AppLayout title="Invoices">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-muted-foreground">Bills, payments and receipts.</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </div>

      <SummaryBar
        cards={[
          { key: "all", label: "Invoices", value: stat(inv?.count), icon: Receipt, sub: inv ? `${money(inv.billed)} billed` : undefined, filterable: true },
          { key: "paid", label: "Collected", value: money(inv?.collected), icon: CheckCircle2, color: "#00C48C", sub: inv ? `${inv.paid} fully paid` : undefined, filterable: true },
          { key: "due", label: "Outstanding", value: money(inv?.outstanding), icon: Wallet, color: "#DC2626", sub: inv ? `${inv.unpaid + inv.partial} open` : undefined, filterable: true },
          { key: "unpaid", label: "Unpaid (no payment)", value: stat(inv?.unpaid), icon: AlertCircle, color: "#FA731C", filterable: true },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="revenue"
        exportLabel="Revenue report"
        shown={visible.length}
        total={cardKey === "all" ? inv?.count : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by invoice number or patient…"
        filters={[
          { kind: "select", key: "status", label: "Status", value: fStatus, onChange: setFStatus, options: ["unpaid", "partial", "paid", "void"].map((v) => ({ value: v, label: v })) },
          { kind: "select", key: "mode", label: "Payment method", value: fMode, onChange: setFMode, options: MODES.map((v) => ({ value: v, label: MODE_LABEL[v] })) },
          { kind: "date", key: "from", label: "From", value: fFrom, onChange: setFFrom },
          { kind: "date", key: "to", label: "To", value: fTo, onChange: setFTo },
        ]}
      />

      <Card className="print:hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !invoices?.length ? (
            <p className="p-6 text-center text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Payment method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((i) => (
                  <TableRow key={i._id} className="cursor-pointer" onClick={() => setViewId(i._id)}>
                    <TableCell className="font-bold">{i.number}</TableCell>
                    <TableCell><PersonCell kind="patient" id={typeof i.patientId === "string" ? i.patientId : i.patientId._id} name={pName(i.patientId)} /></TableCell>
                    <TableCell>{typeof i.doctorId === "object" && i.doctorId ? i.doctorId.name : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(i.createdAt).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className={`whitespace-nowrap ${isOverdue(i) ? "font-bold text-red-600" : ""}`}>
                      {i.dueDate ? fmtDate(i.dueDate) : "—"}{isOverdue(i) ? " · overdue" : ""}
                    </TableCell>
                    <TableCell title={i.items.map((it) => it.description).join(", ")}>{i.items.length}</TableCell>
                    <TableCell>{inr(i.total)}</TableCell>
                    <TableCell>{inr(i.paid)}</TableCell>
                    <TableCell className={i.status === "void" ? "text-muted-foreground" : i.total - i.paid > 0.005 ? "font-bold text-red-600" : ""}>
                      {i.status === "void" ? "—" : inr(Math.max(0, Math.round((i.total - i.paid) * 100) / 100))}
                    </TableCell>
                    <TableCell>
                      {modesOf(i).length ? modesOf(i).map((m) => (
                        <StatusBadge key={m} status={m} label={MODE_LABEL[m] ?? m} />
                      )) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={i.status} />
                    </TableCell>
                    <TableCell>
                      <RowActions>
                        <ActionButton label={`View ${i.number}`} icon={Eye} onClick={() => setViewId(i._id)} />
                        <ActionButton label={`Download PDF ${i.number}`} icon={FileDown} onClick={() => printInvoice(i._id)} />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            {/* header: who, which doctor, when due */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="inv-patient">Patient</Label>
                <select id="inv-patient" required value={patientId} onChange={(e) => { setPatientId(e.target.value); setLines([{ ...blankLine }]); }} className="nb-input flex h-10 w-full px-3 py-2 text-sm">
                  <option value="">Select patient</option>
                  {patients?.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} {p.patientId ? `(${p.patientId})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-doctor">Doctor</Label>
                <select id="inv-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="nb-input flex h-10 w-full px-3 py-2 text-sm">
                  <option value="">Not specified</option>
                  {doctors?.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-due">Due date</Label>
                <Input id="inv-due" type="date" min={new Date().toISOString().slice(0, 10)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            {patientId && (
              <div className="border-2 border-black">
                <div className="flex items-center justify-between border-b-2 border-black bg-[#024BAB]/5 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-wider">From this patient&apos;s records</p>
                  {loadingBillable && <span className="text-xs text-muted-foreground">Loading…</span>}
                </div>
                {!loadingBillable && !billable?.length ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    Nothing unbilled. Completed visits, lab tests and prescribed medicines appear here automatically; you can still add lines below.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-auto">
                    {["Consultations", "Lab tests", "Medicines"].map((g) => {
                      const items = (billable ?? []).filter((it) => it.group === g);
                      if (!items.length) return null;
                      const allOn = items.every((it) => picked.has(it.id));
                      return (
                        <div key={g} className="border-b border-black/10 last:border-b-0">
                          <label className="flex cursor-pointer items-center gap-2 bg-gray-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider">
                            <input type="checkbox" checked={allOn} onChange={() => toggleGroup(items)} className="accent-[#024BAB]" />
                            {g} ({items.length})
                          </label>
                          {items.map((it) => (
                            <label key={it.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                              <input type="checkbox" checked={picked.has(it.id)} onChange={() => toggleItem(it)} className="accent-[#024BAB]" />
                              <span className="min-w-0 flex-1 truncate">{it.description}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{it.groupLabel}</span>
                              {it.kind === "medicine" && it.qty > 1 && <span className="shrink-0 text-xs text-muted-foreground">×{it.qty}</span>}
                              <span className={"shrink-0 text-xs font-bold " + (it.priced ? "" : "text-[#FA731C]")}>{it.priced ? "₹" + it.rate : "set price"}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* line items */}
            <div className="overflow-x-auto">
              <div className="min-w-[760px] space-y-2">
                <div className="grid grid-cols-[minmax(0,3fr)_1fr_0.8fr_1fr_1.2fr_0.9fr_0.9fr_1.2fr_36px] gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Item</span><span>HSN/SAC</span><span>Qty</span><span>Unit</span><span>Rate (₹)</span><span>Disc %</span><span>GST %</span><span className="text-right">Amount</span><span />
                </div>
                {lines.map((l, i) => (
                  <div key={i}>
                    <div className="grid grid-cols-[minmax(0,3fr)_1fr_0.8fr_1fr_1.2fr_0.9fr_0.9fr_1.2fr_36px] items-start gap-2">
                      <CatalogInput value={l.description} readOnly={!!l.source} onType={(v) => setLine(i, { description: v, medicineId: undefined, stock: undefined })} onPick={(it) => pickCatalog(i, it)} />
                      <Input placeholder="HSN" value={l.hsnCode} onChange={(e) => setLine(i, { hsnCode: e.target.value })} />
                      <Input type="number" min={0.01} step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                      <Input placeholder="unit" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                      <Input type="number" min={0} step="any" required placeholder="0.00" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className={l.source && !(Number(l.rate) > 0) ? "border-[#FA731C] bg-orange-50" : ""} />
                      <Input type="number" min={0} max={100} step="any" value={l.discountPercent} onChange={(e) => setLine(i, { discountPercent: e.target.value })} />
                      <Input type="number" min={0} max={28} step="any" value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })} />
                      <p className="flex h-10 items-center justify-end text-sm font-bold">{inr(lineAmount(l))}</p>
                      <Button type="button" variant="outline" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : [{ ...blankLine }]))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {l.medicineId && l.stock !== undefined && l.stock !== null && (
                      <p className={`mt-0.5 text-[11px] font-semibold ${l.stock <= 0 ? "text-red-700" : Number(l.qty) > l.stock ? "text-[#FA731C]" : "text-muted-foreground"}`}>
                        {l.stock <= 0 ? "Out of stock" : Number(l.qty) > l.stock ? `Only ${l.stock} in stock` : `${l.stock} in stock`}
                      </p>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { ...blankLine }])}>
                  <Plus className="h-4 w-4" /> Add line
                </Button>
              </div>
            </div>

            {/* bottom: notes + payment on the left, totals on the right */}
            <div className="grid gap-4 md:grid-cols-[1fr_300px]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-notes">Notes (printed on the invoice)</Label>
                  <Input id="inv-notes" maxLength={500} placeholder="e.g. Insurance claim ref, advised review in 7 days" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-adv">Received now (₹)</Label>
                    <div className="flex gap-1">
                      <Input id="inv-adv" type="number" min={0} step="any" max={grand || undefined} placeholder="0" value={advance.amount} onChange={(e) => setAdvance({ ...advance, amount: e.target.value })} />
                      <button type="button" title="Mark as fully paid" className="border-2 border-black bg-white px-2 text-xs font-bold hover:bg-[#024BAB] hover:text-white" onClick={() => setAdvance({ ...advance, amount: String(grand) })}>Full</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-mode">Payment method</Label>
                    <select id="inv-mode" value={advance.mode} onChange={(e) => setAdvance({ ...advance, mode: e.target.value })} className="nb-input flex h-10 w-full px-2 py-2 text-sm capitalize">
                      {MODES.map((m) => (
                        <option key={m} value={m}>{MODE_LABEL[m]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-ref">Reference / txn id</Label>
                    <Input id="inv-ref" placeholder="UPI / txn id" value={advance.reference} onChange={(e) => setAdvance({ ...advance, reference: e.target.value })} />
                  </div>
                </div>
                {lines.some((l) => l.source && !(Number(l.rate) > 0)) && (
                  <p className="text-xs font-semibold text-[#FA731C]">Some linked items have no price yet. Enter the rate once and it is remembered for next time.</p>
                )}
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[#024BAB]" />
                  Remember these prices for lab tests and services
                </label>
              </div>

              <div className="space-y-1 border-2 border-black bg-[#F8FAFF] p-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{inr(taxable)}</span></div>
                <div className="flex items-center justify-between gap-2">
                  <span>Extra discount (₹)</span>
                  <Input type="number" min={0} step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-8 w-24 text-right" />
                </div>
                <div className="flex justify-between"><span>GST</span><span>{inr(gstTotal)}</span></div>
                <div className="flex justify-between border-t-2 border-black pt-1 text-base font-bold"><span>Total</span><span>{inr(grand)}</span></div>
                {advanceAmt > 0 && <div className="flex justify-between"><span>Received</span><span>− {inr(Math.min(advanceAmt, grand))}</span></div>}
                <div className={`flex justify-between font-bold ${grand - advanceAmt > 0.005 ? "text-red-700" : "text-green-700"}`}>
                  <span>Balance due</span><span>{inr(Math.max(0, r2(grand - advanceAmt)))}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating..." : "Create invoice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View / pay / print */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent>
          {view && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {view.number} <StatusBadge status={view.status} />
                </DialogTitle>
              </DialogHeader>
              <div id="invoice-print" className="space-y-2 text-sm">
                <p className="font-display text-lg font-bold">{tenant?.branding?.appName || tenant?.name}</p>
                {tenant?.gstDetails?.gstin && <p className="text-xs">GSTIN: {tenant.gstDetails.gstin}</p>}
                <p>
                  <b>Patient:</b> {pName(view.patientId)} · {new Date(view.createdAt).toLocaleDateString("en-IN")}
                </p>
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th>Item</th><th>Qty</th><th>Rate</th><th>GST</th><th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.items.map((it, i) => (
                      <tr key={i} className="border-b">
                        <td>{it.description}</td><td>{it.qty}</td><td>{inr(it.rate)}</td><td>{it.gstRate}%</td><td className="text-right">{inr(it.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right">
                  <p>Subtotal: {inr(view.subtotal)}</p>
                  {view.discount > 0 && <p>Discount: −{inr(view.discount)}</p>}
                  {view.gst > 0 && <p>GST: {inr(view.gst)}</p>}
                  <p className="font-bold">Total: {inr(view.total)}</p>
                  <p>Paid: {inr(view.paid)}</p>
                  {due > 0 && view.status !== "void" && <p className="font-bold text-red-700">Due: {inr(due)}</p>}
                </div>
                {(view.dueDate || personName(view.createdBy)) && (
                  <p className="text-xs text-muted-foreground">
                    {view.dueDate && <>Due by {fmtDate(view.dueDate)}. </>}
                    {personName(view.createdBy) && <>Billed by {personName(view.createdBy)}.</>}
                  </p>
                )}
              </div>

              <div className="print:hidden">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payments</p>
                {view.payments.length ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left"><th>Date</th><th>Method</th><th>Reference</th><th>Received by</th><th className="text-right">Amount</th></tr>
                    </thead>
                    <tbody>
                      {view.payments.map((p, k) => (
                        <tr key={k} className="border-b">
                          <td>{new Date(p.receivedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="font-bold">{MODE_LABEL[p.mode] ?? p.mode}</td>
                          <td>{p.reference || "—"}</td>
                          <td>{personName(p.receivedBy) || "—"}</td>
                          <td className="text-right font-bold">{inr(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-xs text-muted-foreground">No payment recorded yet.</p>}
              </div>

              {due > 0 && view.status !== "void" && (
                <div className="flex flex-wrap items-end gap-2 print:hidden">
                  <div className="min-w-[120px] flex-1 space-y-1.5">
                    <Label htmlFor="pay-amt">Receive payment</Label>
                    <div className="flex gap-1">
                      <Input id="pay-amt" type="number" min={0.01} step="any" max={due} placeholder={`Up to ${due}`} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                      <button type="button" title="Full balance" className="border-2 border-black bg-white px-2 text-xs font-bold hover:bg-[#024BAB] hover:text-white" onClick={() => setPayAmt(String(due))}>Full</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pay-mode">Method</Label>
                    <select id="pay-mode" value={payMode} onChange={(e) => setPayMode(e.target.value)} className="nb-input h-10 px-2 text-sm">
                      {MODES.map((m) => (
                        <option key={m} value={m}>{MODE_LABEL[m]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-36 space-y-1.5">
                    <Label htmlFor="pay-ref">Reference</Label>
                    <Input id="pay-ref" placeholder="UPI / txn id" maxLength={100} value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  </div>
                  <Button disabled={pay.isPending || !payAmt} onClick={() => pay.mutate()}>
                    Record
                  </Button>
                </div>
              )}
              <DialogFooter className="print:hidden">
                {view.status !== "void" && view.paid === 0 && (
                  <Button variant="outline" disabled={voidIt.isPending} onClick={() => confirm("Void this invoice?") && voidIt.mutate()}>
                    Void
                  </Button>
                )}
                <Button variant="outline" onClick={() => printInvoice(view._id)}>
                  <FileDown className="h-4 w-4" /> Print / PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
