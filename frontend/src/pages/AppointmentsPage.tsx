import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, CalendarDays, Activity, Download, FileText, CreditCard, Pencil, Plus, Receipt, Stethoscope, Trash2, UserX, Video, XCircle } from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { Avatar, PersonCell } from "@/components/Avatar";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches, useDebounced } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { ActionButton, RowActions } from "@/components/RowActions";
import { VitalsDialog } from "@/components/VitalsDialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { openAppointmentReceipt } from "@/lib/buildAppointmentReceipt";
import { ApiError, appointmentsAPI, doctorsAPI, invoicesAPI, patientsAPI, paymentsAPI, slotsAPI, videoAPI } from "@/services/api";
import { runCheckout } from "@/lib/paymentGateway";
import type { Appointment, Doctor, Patient } from "@/types";

const emptyForm = { patientId: "", doctorId: "", date: "", time: "", slot: "", reason: "", type: "in_clinic" };

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fType, setFType] = useState("all");
  const [fDoctor, setFDoctor] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const { data: appointments, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => appointmentsAPI.getAll(),
  });
  const { data: patients } = useQuery({ queryKey: ["patients"], queryFn: () => patientsAPI.getAll() });
  const { data: doctors } = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsAPI.getAll() });

  const { user, tenant } = useAuth();
  const [vitalsFor, setVitalsFor] = useState<{ id: string; name: string } | null>(null);
  const canRecordVitals = ["super_admin", "tenant_owner", "hospital_admin", "doctor", "nurse", "receptionist"].includes(user?.role ?? "");
  const canDelete = ["super_admin", "tenant_owner", "hospital_admin"].includes(user?.role ?? "");

  // ---- edit / reschedule ----
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [ed, setEd] = useState({ date: "", time: "", slot: "", reason: "", notes: "", status: "scheduled" as Appointment["status"] });
  const editDoctorId = editing ? (typeof editing.doctorId === "string" ? editing.doctorId : editing.doctorId._id) : "";
  const editDoctor = doctors?.find((d) => d._id === editDoctorId);
  const editHasSchedule = !!editDoctor?.availability?.length;
  const { data: editSlots } = useQuery({
    queryKey: ["slots", editDoctorId, ed.date],
    queryFn: () => slotsAPI.forDoctor(editDoctorId, ed.date),
    enabled: !!editing && editHasSchedule && !!ed.date,
  });

  const openEdit = (a: Appointment) => {
    setEditing(a);
    setEd({ date: "", time: "", slot: "", reason: a.reason ?? "", notes: a.notes ?? "", status: a.status });
  };

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; payload: Partial<Appointment> }) => appointmentsAPI.update(vars.id, vars.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment updated");
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update appointment"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => appointmentsAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete appointment"),
  });

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const payload: Partial<Appointment> = { reason: ed.reason, notes: ed.notes, status: ed.status };
    // Only send a new time when one was actually chosen; otherwise the visit stays where it is.
    const when = editHasSchedule ? ed.slot : ed.date && ed.time ? new Date(`${ed.date}T${ed.time}`).toISOString() : "";
    if (when) payload.scheduledAt = when;
    updateMutation.mutate({ id: editing._id, payload });
  };

  const doctor = doctors?.find((d) => d._id === form.doctorId);
  const hasSchedule = !!doctor?.availability?.length;
  const { data: slots } = useQuery({
    queryKey: ["slots", form.doctorId, form.date],
    queryFn: () => slotsAPI.forDoctor(form.doctorId, form.date),
    enabled: hasSchedule && !!form.date,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Partial<Appointment>) => appointmentsAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment scheduled");
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to schedule appointment"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      patientId: form.patientId,
      doctorId: form.doctorId,
      // Doctors with a weekly schedule book from server-issued slots; others take a free time.
      scheduledAt: hasSchedule ? form.slot : new Date(`${form.date}T${form.time}`).toISOString(),
      reason: form.reason || undefined,
      type: form.type as Appointment["type"],
    });
  };

  const joinVideo = async (id: string) => {
    try {
      window.open((await videoAPI.link(id)).url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open the call");
    }
  };

  const { data: payStatus } = useQuery({ queryKey: ["payments", "status"], queryFn: paymentsAPI.status });
  const collectOnline = async (a: Appointment) => {
    try {
      const order = await paymentsAPI.order(a._id);
      const paid = await runCheckout(order, "Consultation fee", (extra) => paymentsAPI.verify(a._id, order.orderId, extra));
      if (paid) {
        toast.success("Payment received — invoice updated");
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message || "Payment failed");
    }
  };

  const billVisit = async (id: string) => {
    try {
      const inv = await invoicesAPI.fromAppointment(id);
      toast.success(`Invoice ${inv.number} created — see Invoices`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create invoice");
    }
  };

  const nameOf = (ref: string | Patient | Doctor) =>
    typeof ref === "string" ? ref : ref.name;

  const todayStr = new Date().toDateString();
  const byCard = (appointments ?? []).filter((a) =>
    cardKey === "today" ? new Date(a.scheduledAt).toDateString() === todayStr
    : cardKey === "upcoming" ? a.status === "scheduled" && new Date(a.scheduledAt).getTime() >= Date.now()
    : cardKey === "completed" ? a.status === "completed"
    : cardKey === "cancelled" ? a.status === "cancelled" || a.status === "no_show"
    : true,
  );

  const visible = byCard.filter((x) => (fStatus === "all" || x.status === fStatus) &&
      (fType === "all" || (x.type ?? "in_clinic") === fType) &&
      (fDoctor === "all" || (typeof x.doctorId === "string" ? x.doctorId : x.doctorId._id) === fDoctor) &&
      (!fFrom || x.scheduledAt.slice(0, 10) >= fFrom) &&
      (!fTo || x.scheduledAt.slice(0, 10) <= fTo) &&
      matches(q, nameOf(x.patientId), nameOf(x.doctorId), x.reason, (x.patientId as Patient).patientId));

  return (
    <AppLayout title="Appointments">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">Schedule and track patient appointments.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New appointment
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule appointment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="patientId">Patient</Label>
                <select
                  id="patientId"
                  required
                  value={form.patientId}
                  onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                  className="nb-input flex h-10 w-full px-3 py-2 text-sm"
                >
                  <option value="">Select patient</option>
                  {patients?.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doctorId">Doctor</Label>
                <select
                  id="doctorId"
                  required
                  value={form.doctorId}
                  onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                  className="nb-input flex h-10 w-full px-3 py-2 text-sm"
                >
                  <option value="">Select doctor</option>
                  {doctors?.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitType">Visit type</Label>
                <select
                  id="visitType"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="nb-input flex h-10 w-full px-3 py-2 text-sm"
                >
                  <option value="in_clinic">In clinic</option>
                  {doctor?.consultation?.consultationModes?.includes("video") && <option value="video">Video consult</option>}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, slot: "" })} />
              </div>
              {hasSchedule ? (
                <div className="space-y-1.5">
                  <Label htmlFor="slot">Available slot</Label>
                  <select
                    id="slot"
                    required
                    value={form.slot}
                    onChange={(e) => setForm({ ...form, slot: e.target.value })}
                    className="nb-input flex h-10 w-full px-3 py-2 text-sm"
                  >
                    <option value="">{form.date ? (slots?.length === 0 ? "No free slots" : "Select a slot") : "Pick a date first"}</option>
                    {slots?.map((sl) => (
                      <option key={sl.start} value={sl.start}>
                        {new Date(sl.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="time">Time</Label>
                  <Input id="time" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Scheduling..." : "Schedule"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit appointment</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveEdit} className="space-y-4">
              <p className="text-sm">
                <b>{nameOf(editing.patientId)}</b> with <b>{nameOf(editing.doctorId)}</b> · currently{" "}
                {new Date(editing.scheduledAt).toLocaleString("en-IN")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ed-date">New date (to reschedule)</Label>
                  <Input id="ed-date" type="date" value={ed.date} onChange={(e) => setEd({ ...ed, date: e.target.value, slot: "" })} />
                </div>
                {editHasSchedule ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-slot">Available slot</Label>
                    <select id="ed-slot" value={ed.slot} onChange={(e) => setEd({ ...ed, slot: e.target.value })} className="nb-input flex h-10 w-full px-3 py-2 text-sm">
                      <option value="">{ed.date ? (editSlots?.length === 0 ? "No free slots" : "Keep current time") : "Pick a date first"}</option>
                      {editSlots?.map((sl) => (
                        <option key={sl.start} value={sl.start}>
                          {new Date(sl.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="ed-time">New time</Label>
                    <Input id="ed-time" type="time" value={ed.time} onChange={(e) => setEd({ ...ed, time: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-status">Status</Label>
                <select id="ed-status" value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value as Appointment["status"] })} className="nb-input flex h-10 w-full px-3 py-2 text-sm capitalize">
                  {(["scheduled", "completed", "cancelled", "no_show"] as const).map((st) => (
                    <option key={st} value={st}>{st.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-reason">Reason</Label>
                <Input id="ed-reason" value={ed.reason} onChange={(e) => setEd({ ...ed, reason: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-notes">Notes</Label>
                <Input id="ed-notes" value={ed.notes} onChange={(e) => setEd({ ...ed, notes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <SummaryBar
        cards={[
          { key: "today", label: "Today", value: stat(sm?.appointments.today), icon: CalendarDays, filterable: true },
          { key: "upcoming", label: "Upcoming", value: stat(sm?.appointments.upcoming), icon: CalendarClock, color: "#FA731C", filterable: true },
          { key: "completed", label: "Completed", value: stat(sm?.appointments.completed), icon: CalendarCheck, color: "#00C48C", filterable: true },
          { key: "cancelled", label: "Cancelled / no-show", value: stat(sm ? sm.appointments.cancelled + sm.appointments.noShow : undefined), icon: XCircle, color: "#DC2626", filterable: true },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="appointments"
        exportLabel="Export (30 days)"
        shown={visible.length}
        total={cardKey === "all" ? sm?.appointments.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by patient, doctor or reason…"
        filters={[
          { kind: "select", key: "status", label: "Status", value: fStatus, onChange: setFStatus, options: ["scheduled", "completed", "cancelled", "no_show"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
          { kind: "select", key: "type", label: "Type", value: fType, onChange: setFType, options: ["in_clinic", "video", "walk_in"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
          { kind: "select", key: "doctor", label: "Doctor", value: fDoctor, onChange: setFDoctor, options: (doctors ?? []).map((d) => ({ value: d._id, label: d.name })) },
          { kind: "date", key: "from", label: "From", value: fFrom, onChange: setFFrom },
          { kind: "date", key: "to", label: "To", value: fTo, onChange: setFTo },
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
          ) : !appointments?.length ? (
            <p className="p-6 text-center text-muted-foreground">No appointments scheduled yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date &amp; time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      <PersonCell kind="patient" id={typeof a.patientId === "string" ? a.patientId : a.patientId._id} name={nameOf(a.patientId)} sub={typeof a.patientId === "object" ? (a.patientId as Patient).patientId : undefined} />
                    </TableCell>
                    <TableCell>
                      <PersonCell kind="doctor" id={typeof a.doctorId === "string" ? a.doctorId : a.doctorId._id} name={nameOf(a.doctorId)} />
                    </TableCell>
                    <TableCell>{new Date(a.scheduledAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell>
                      <RowActions>
                        {a.status !== "cancelled" && (
                          <ActionButton label={a.status === "completed" ? "View prescription" : "Start consultation"} icon={a.status === "completed" ? FileText : Stethoscope} to={`/consultation/${a._id}`} />
                        )}
                        {a.type === "video" && a.status === "scheduled" && <ActionButton label="Join video call" icon={Video} onClick={() => joinVideo(a._id)} />}
                        {payStatus?.enabled && a.status !== "cancelled" && a.paymentStatus === "unpaid" && (a.fee ?? 0) > 0 && (
                          <ActionButton label="Collect fee online" icon={CreditCard} onClick={() => collectOnline(a)} />
                        )}
                        {a.status !== "cancelled" && <ActionButton label="Download booking receipt" icon={Download} onClick={() => openAppointmentReceipt(a, tenant) || toast.error("Allow pop-ups to download the receipt")} />}
                        {a.status !== "cancelled" && <ActionButton label="Bill this visit" icon={Receipt} onClick={() => billVisit(a._id)} />}
                        {a.status === "scheduled" && canRecordVitals && (
                          <ActionButton label="Record vitals (intake)" icon={Activity} onClick={() => setVitalsFor({ id: a._id, name: nameOf(a.patientId) })} />
                        )}
                        {a.status === "scheduled" && (
                          <>
                            <ActionButton label="Edit appointment" icon={Pencil} onClick={() => openEdit(a)} />
                            <ActionButton
                              label="Cancel appointment"
                              icon={XCircle}
                              onClick={() => window.confirm("Cancel this appointment?") && updateMutation.mutate({ id: a._id, payload: { status: "cancelled", cancelReason: "Cancelled by clinic" } as Partial<Appointment> })}
                            />
                            <ActionButton label="Mark no-show" icon={UserX} onClick={() => updateMutation.mutate({ id: a._id, payload: { status: "no_show" } })} />
                          </>
                        )}
                        {canDelete && (
                          <ActionButton
                            label="Delete appointment"
                            icon={Trash2}
                            disabled={removeMutation.isPending}
                            onClick={() => window.confirm("Delete this appointment permanently?") && removeMutation.mutate(a._id)}
                          />
                        )}
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <VitalsDialog appointmentId={vitalsFor?.id ?? null} patientName={vitalsFor?.name} onClose={() => setVitalsFor(null)} />
    </AppLayout>
  );
}
