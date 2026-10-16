import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ClipboardList, FileDown, FlaskConical, Pencil, Plus, TestTube, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { Avatar, PersonCell } from "@/components/Avatar";
import { Suggest } from "@/components/forms/Suggest";
import { categoryOf, findCatalogTest, LAB_CATALOG, LAB_CATEGORIES } from "@/lib/labCatalog";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches, useDebounced } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { downloadLabPdf, whatsappUrl } from "@/lib/labReport";
import { ApiError, doctorsAPI, labAPI, patientsAPI } from "@/services/api";
import type { Patient } from "@/types";
import type { LabOrder, LabStaffRef, LabStage } from "@/types/billing";

const FLAG_CLS: Record<string, string> = { high: "text-red-700 font-bold", low: "text-amber-700 font-bold", normal: "", "": "" };

const blankTest = { category: "", name: "", unit: "", refLow: "", refHigh: "" };
const ALL_TESTS = Object.values(LAB_CATALOG).flatMap((c) => c.map((x) => x.name));

const WhatsAppIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2a9.9 9.9 0 0 0-8.43 15.1L2 22l5.04-1.58A9.9 9.9 0 1 0 12.04 2Zm0 18.1c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3 .94.98-2.92-.2-.31A8.1 8.1 0 1 1 12.04 20.1Zm4.45-6.06c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.45-1.35-1.69-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.47-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
  </svg>
);

const staffRef = (v: LabOrder["assignedTo"]): LabStaffRef | null => (v && typeof v === "object" ? v : null);
const roleLabel = (r?: string) => (r ? r.replace(/_/g, " ") : "");
const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const STAGE_META: Record<LabStage["status"], { label: string; icon: typeof TestTube; tone: string }> = {
  ordered: { label: "Ordered", icon: ClipboardList, tone: "bg-[#FA731C] text-white" },
  collected: { label: "Sample collected", icon: TestTube, tone: "bg-[#024BAB] text-white" },
  resulted: { label: "Results entered", icon: CircleCheck, tone: "bg-[#00C48C] text-black" },
  cancelled: { label: "Cancelled", icon: XCircle, tone: "bg-gray-300 text-black" },
};

/** Vertical timeline of every stage the order went through, with who did it and when. */
function StageTimeline({ stages, status }: { stages: LabStage[]; status: LabOrder["status"] }) {
  const pending: LabStage["status"][] =
    status === "ordered" ? ["collected", "resulted"] : status === "collected" ? ["resulted"] : [];
  return (
    <ol className="ml-2 space-y-3 border-l-2 border-black pl-5">
      {stages.map((s, i) => {
        const m = STAGE_META[s.status];
        const Icon = m.icon;
        return (
          <li key={s._id ?? i} className="relative">
            <span className={`absolute -left-[31px] flex h-5 w-5 items-center justify-center border-2 border-black ${m.tone}`}>
              <Icon className="h-3 w-3" />
            </span>
            <p className="text-sm font-bold">{m.label}</p>
            <p className="text-xs text-muted-foreground">
              {fmt(s.at)}
              {s.byName ? ` · ${s.byName}${s.byRole ? ` (${roleLabel(s.byRole)})` : ""}` : ""}
            </p>
            {s.note && <p className="text-xs">{s.note}</p>}
          </li>
        );
      })}
      {pending.map((p) => (
        <li key={p} className="relative opacity-50">
          <span className="absolute -left-[31px] h-5 w-5 border-2 border-dashed border-black bg-white" />
          <p className="text-sm font-bold">{STAGE_META[p].label}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </li>
      ))}
    </ol>
  );
}

export default function LabOrdersPage() {
  const qc = useQueryClient();
  const { user, tenant } = useAuth();
  const isAdmin = ["super_admin", "tenant_owner", "hospital_admin"].includes(user?.role ?? "");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [tests, setTests] = useState([{ ...blankTest }]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, string>>({});
  const [assignedTo, setAssignedTo] = useState("");
  const [stageNote, setStageNote] = useState("");

  const { data: orders, isLoading } = useQuery({ queryKey: ["lab-orders"], queryFn: () => labAPI.getAll() });
  const { data: patients } = useQuery({ queryKey: ["patients"], queryFn: () => patientsAPI.getAll() });
  const { data: doctors } = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsAPI.getAll() });
  const { data: technicians } = useQuery({ queryKey: ["lab-technicians"], queryFn: () => labAPI.technicians() });
  const view = orders?.find((o) => o._id === viewId) ?? null;

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Request failed");
  const refresh = () => qc.invalidateQueries({ queryKey: ["lab-orders"] });

  const closeForm = () => {
    setOpen(false);
    setEditId(null);
    setPatientId("");
    setDoctorId("");
    setAssignedTo("");
    setTests([{ ...blankTest }]);
  };

  const editing = orders?.find((o) => o._id === editId) ?? null;
  const testsLocked = !!editing && (editing.status === "resulted" || editing.tests.some((t) => t.result));
  const idOf = (v: unknown) => (v && typeof v === "object" ? (v as { _id: string })._id : ((v as string) ?? ""));

  const openEdit = (o: LabOrder) => {
    setEditId(o._id);
    setPatientId(idOf(o.patientId));
    setDoctorId(idOf(o.doctorId));
    setAssignedTo(idOf(o.assignedTo));
    setTests(o.tests.map((t) => ({ category: "", name: t.name, unit: t.unit ?? "", refLow: t.refLow != null ? String(t.refLow) : "", refHigh: t.refHigh != null ? String(t.refHigh) : "" })));
    setOpen(true);
  };

  const saveEdit = useMutation({
    mutationFn: () =>
      labAPI.updateDetails(editId!, {
        doctorId: doctorId || null,
        assignedTo: assignedTo || null,
        ...(testsLocked ? {} : { tests: tests.map((t) => ({ name: t.name, unit: t.unit, refLow: t.refLow, refHigh: t.refHigh })) }),
      }),
    onSuccess: (o) => {
      refresh();
      toast.success(`Order ${o.number} updated`);
      closeForm();
    },
    onError,
  });

  const deleteOrder = useMutation({
    mutationFn: (id: string) => labAPI.remove(id),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Lab order deleted");
      setViewId(null);
    },
    onError,
  });

  const sendWhatsApp = (o: LabOrder) => {
    const url = whatsappUrl(o, tenant?.branding?.appName || tenant?.name || "NestCare");
    if (!url) return toast.error("This patient has no mobile number on file");
    window.open(url, "_blank", "noopener");
  };

  const create = useMutation({
    mutationFn: () =>
      labAPI.create({
        patientId,
        doctorId: doctorId || undefined,
        assignedTo: assignedTo || undefined,
        tests: tests.map((t) => ({ name: t.name, unit: t.unit, refLow: t.refLow, refHigh: t.refHigh })),
      }),
    onSuccess: (o) => {
      refresh();
      toast.success(`Order ${o.number} placed`);
      closeForm();
    },
    onError,
  });

  const saveResults = useMutation({
    mutationFn: () =>
      labAPI.update(viewId!, {
        tests: view!.tests.map((t, i) => ({ ...t, result: results[i] ?? t.result })),
        note: stageNote || undefined,
      }),
    onSuccess: () => {
      refresh();
      setStageNote("");
      toast.success("Results saved");
    },
    onError,
  });

  const cancelOrder = useMutation({
    mutationFn: () => labAPI.update(viewId!, { status: "cancelled", note: stageNote || undefined }),
    onSuccess: () => {
      refresh();
      toast.success("Order cancelled");
      setViewId(null);
    },
    onError,
  });

  const collect = useMutation({
    mutationFn: () => labAPI.update(viewId!, { status: "collected", note: stageNote || undefined }),
    onSuccess: () => {
      refresh();
      setStageNote("");
    },
    onError,
  });

  const pName = (p: string | Patient) => (typeof p === "string" ? p : p.name);
  const setTest = (i: number, patch: Partial<typeof blankTest>) => setTests((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  // Typing/picking a known test fills its category, unit and reference range; edits stay free-text.
  const pickTest = (i: number, name: string) =>
    setTests((ts) =>
      ts.map((t, idx) => {
        if (idx !== i) return t;
        const hit = findCatalogTest(name, t.category || undefined) ?? findCatalogTest(name);
        if (!hit) return { ...t, name };
        return {
          ...t,
          name,
          category: t.category || categoryOf(name) || "",
          unit: hit.unit ?? "",
          refLow: hit.low != null ? String(hit.low) : "",
          refHigh: hit.high != null ? String(hit.high) : "",
        };
      }),
    );

  const byCard = (orders ?? []).filter((o) =>
    cardKey === "ordered" || cardKey === "collected" || cardKey === "resulted" ? o.status === cardKey
    : cardKey === "abnormal" ? o.status === "resulted" && o.tests.some((t) => t.flag === "high" || t.flag === "low")
    : true,
  );

  const reassign = useMutation({
    mutationFn: (id: string) => labAPI.update(viewId!, { assignedTo: id || null }),
    onSuccess: () => {
      refresh();
      toast.success("Assignment updated");
    },
    onError,
  });

  const visible = byCard.filter((x) => (fStatus === "all" || x.status === fStatus) && matches(q, x.number, pName(x.patientId), x.tests.map((t) => t.name).join(" ")));

  return (
    <AppLayout title="Lab Orders">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">Order tests, mark samples collected and enter results.</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New order
        </Button>
      </div>

      <SummaryBar
        cards={[
          { key: "ordered", label: "Awaiting sample", value: stat(sm?.lab.ordered), icon: ClipboardList, color: "#FA731C", filterable: true },
          { key: "collected", label: "Sample collected", value: stat(sm?.lab.collected), icon: TestTube, color: "#024BAB", filterable: true },
          { key: "resulted", label: "Resulted", value: stat(sm?.lab.resulted), icon: FlaskConical, color: "#00C48C", filterable: true },
          { key: "abnormal", label: "Abnormal results", value: stat(sm?.lab.abnormal), icon: TriangleAlert, color: "#DC2626", filterable: true },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="lab"
        exportLabel="Export (30 days)"
        shown={visible.length}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by order number, patient or test…"
        filters={[
          { kind: "select", key: "status", label: "Status", value: fStatus, onChange: setFStatus, options: ["ordered", "collected", "resulted", "cancelled"].map((v) => ({ value: v, label: v })) },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !orders?.length ? (
            <p className="p-6 text-center text-muted-foreground">No lab orders yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Resulted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((o) => (
                  <TableRow
                    key={o._id}
                    className="cursor-pointer"
                    onClick={() => {
                      setViewId(o._id);
                      setResults({});
                      setStageNote("");
                    }}
                  >
                    <TableCell className="font-bold">{o.number}</TableCell>
                    <TableCell><PersonCell kind="patient" id={typeof o.patientId === "string" ? o.patientId : o.patientId._id} name={pName(o.patientId)} /></TableCell>
                    <TableCell>{o.tests.map((t) => t.name).join(", ")}</TableCell>
                    <TableCell>{staffRef(o.assignedTo)?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmt(o.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {o.resultedAt ? fmt(o.resultedAt) : <span className="text-muted-foreground">{o.status === "cancelled" ? "—" : "Pending"}</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" title="Edit order" aria-label="Edit order" disabled={o.status === "cancelled"} onClick={() => openEdit(o)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" title="Download PDF" aria-label="Download PDF" onClick={() => downloadLabPdf(o, tenant?.branding?.appName || tenant?.name || "NestCare")}>
                          <FileDown className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="text-[#128C7E]" title="Send on WhatsApp" aria-label="Send on WhatsApp" onClick={() => sendWhatsApp(o)}>
                          <WhatsAppIcon />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="icon"
                            
                            title="Delete order"
                            aria-label="Delete order"
                            disabled={deleteOrder.isPending}
                            onClick={() => window.confirm(`Delete ${o.number}? This removes the order and its timeline permanently.`) && deleteOrder.mutate(o._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeForm())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.number}` : "New lab order"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) saveEdit.mutate();
              else create.mutate();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lab-patient">Patient</Label>
                <select id="lab-patient" required disabled={!!editing} value={patientId} onChange={(e) => setPatientId(e.target.value)} className="nb-input flex h-10 w-full px-3 py-2 text-sm">
                  <option value="">Select patient</option>
                  {patients?.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lab-doctor">Ordering doctor</Label>
                <select id="lab-doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="nb-input flex h-10 w-full px-3 py-2 text-sm">
                  <option value="">—</option>
                  {doctors?.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-assignee">Assign to (staff performing the test)</Label>
              <select id="lab-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="nb-input flex h-10 w-full px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {technicians?.map((u) => (
                  <option key={u._id} value={u._id}>{u.name} — {roleLabel(u.role)}</option>
                ))}
              </select>
            </div>
            {tests.map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 border-b border-dashed border-black/30 pb-3">
                <select
                  aria-label="Test category"
                  value={t.category}
                  onChange={(e) => setTest(i, { category: e.target.value })}
                  className="nb-input col-span-4 flex h-10 w-full px-2 py-2 text-sm"
                >
                  <option value="">All categories</option>
                  {LAB_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="col-span-7">
                  <Suggest
                    required
                    disabled={testsLocked}
                    placeholder="Search test (e.g. Hemoglobin, Ultrasound, X-Ray)"
                    value={t.name}
                    presets={t.category ? LAB_CATALOG[t.category].map((x) => x.name) : ALL_TESTS}
                    onChange={(v) => pickTest(i, v)}
                  />
                </div>
                <Button type="button" variant="outline" size="icon" className="col-span-1" disabled={testsLocked} aria-label="Remove test" onClick={() => setTests((ts) => (ts.length > 1 ? ts.filter((_, idx) => idx !== i) : ts))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Input className="col-span-4" disabled={testsLocked} placeholder="Unit" value={t.unit} onChange={(e) => setTest(i, { unit: e.target.value })} />
                <Input className="col-span-4" disabled={testsLocked} type="number" step="any" placeholder="Ref. low" value={t.refLow} onChange={(e) => setTest(i, { refLow: e.target.value })} />
                <Input className="col-span-4" disabled={testsLocked} type="number" step="any" placeholder="Ref. high" value={t.refHigh} onChange={(e) => setTest(i, { refHigh: e.target.value })} />
              </div>
            ))}
            {testsLocked ? (
              <p className="text-xs text-muted-foreground">Results are already entered, so the test list is locked. Doctor and performer can still be changed.</p>
            ) : (
              <Button type="button" variant="outline" onClick={() => setTests((ts) => [...ts, { ...blankTest }])}>
                <Plus className="h-4 w-4" /> Add test
              </Button>
            )}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || saveEdit.isPending}>
                {editing ? (saveEdit.isPending ? "Saving..." : "Save changes") : create.isPending ? "Placing..." : "Place order"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent>
          {view && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {view.number} <StatusBadge status={view.status} />
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm">
                <b>Patient:</b> {pName(view.patientId)}
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="lab-performer">Performed by</Label>
                  <select
                    id="lab-performer"
                    value={staffRef(view.assignedTo)?._id ?? ""}
                    disabled={view.status === "resulted" || view.status === "cancelled" || reassign.isPending}
                    onChange={(e) => reassign.mutate(e.target.value)}
                    className="nb-input flex h-9 w-full px-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {technicians?.map((u) => (
                      <option key={u._id} value={u._id}>{u.name} — {roleLabel(u.role)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-0.5 text-xs">
                  <p><b>Sample collected by:</b> {staffRef(view.collectedBy)?.name ?? "—"}{view.collectedAt ? ` · ${fmt(view.collectedAt)}` : ""}</p>
                  <p><b>Result entered by:</b> {staffRef(view.resultedBy)?.name ?? "—"}{view.resultedAt ? ` · ${fmt(view.resultedAt)}` : ""}</p>
                </div>
              </div>
              <div className="space-y-2">
                {view.tests.map((t, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2 text-sm">
                    <span className="col-span-4 font-bold">{t.name}</span>
                    <Input
                      className="col-span-3"
                      disabled={view.status === "resulted" || view.status === "cancelled"}
                      placeholder="Result"
                      value={results[i] ?? t.result}
                      onChange={(e) => setResults((r) => ({ ...r, [i]: e.target.value }))}
                    />
                    <span className="col-span-2 text-muted-foreground">{t.unit}</span>
                    <span className="col-span-2 text-xs text-muted-foreground">
                      {t.refLow != null || t.refHigh != null ? `${t.refLow ?? ""}–${t.refHigh ?? ""}` : ""}
                    </span>
                    <span className={`col-span-1 text-xs uppercase ${FLAG_CLS[t.flag ?? ""]}`}>{t.flag}</span>
                  </div>
                ))}
              </div>
              {(view.status === "ordered" || view.status === "collected") && (
                <div className="space-y-1">
                  <Label htmlFor="lab-note">Note for this step (sample type, remarks, cancel reason)</Label>
                  <Input id="lab-note" value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="e.g. Venous blood, EDTA tube" />
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Progress</p>
                <StageTimeline
                  status={view.status}
                  stages={view.stages?.length ? view.stages : [{ status: "ordered", at: view.createdAt } as LabStage]}
                />
              </div>
              <DialogFooter>
                {(view.status === "ordered" || view.status === "collected") && (
                  <Button variant="outline" disabled={cancelOrder.isPending} onClick={() => window.confirm("Cancel this lab order?") && cancelOrder.mutate()}>
                    Cancel order
                  </Button>
                )}
                <Button variant="outline" onClick={() => downloadLabPdf(view, tenant?.branding?.appName || tenant?.name || "NestCare")}>
                  <FileDown className="h-4 w-4" /> PDF
                </Button>
                <Button variant="outline" onClick={() => sendWhatsApp(view)}>
                  <WhatsAppIcon /> WhatsApp
                </Button>
                {view.status === "ordered" && (
                  <Button variant="outline" disabled={collect.isPending} onClick={() => collect.mutate()}>
                    Mark collected
                  </Button>
                )}
                {(view.status === "ordered" || view.status === "collected") && (
                  <Button disabled={saveResults.isPending} onClick={() => saveResults.mutate()}>
                    Save results
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
