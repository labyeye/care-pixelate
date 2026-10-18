import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardPlus,
  FileText,
  Footprints,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { PersonCell } from "@/components/Avatar";
import { FilterBar, useDebounced } from "@/components/FilterBar";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionButton, RowActions } from "@/components/RowActions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import {
  ApiError,
  appointmentsAPI,
  consultationsAPI,
  doctorsAPI,
  patientsAPI,
} from "@/services/api";
import type { Consultation, Doctor, Patient } from "@/types";

const WALK_IN = "__walk_in__";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // yyyy-mm-dd in the browser's (clinic's) zone
const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const obj = <T,>(v: string | T): T | null =>
  v && typeof v === "object" ? (v as T) : null;

/** Doctor's home for consultations: start a new one, resume a draft, reopen a signed one. */
export default function ConsultationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const summary = useSummary();
  const sm = summary.data?.consultations;

  // list filters (server-side for status / doctor / dates / patient search, so it covers the whole history)
  const [cardKey, setCardKey] = useState("all");
  const [q, setQ] = useState("");
  const [fDoctor, setFDoctor] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const dq = useDebounced(q);
  const status =
    cardKey === "draft" || cardKey === "signed" ? cardKey : undefined;

  const list = useQuery({
    queryKey: ["consultations", dq, status, fDoctor, fFrom, fTo],
    queryFn: () =>
      consultationsAPI.getAll({
        q: dq || undefined,
        status,
        doctorId: fDoctor === "all" ? undefined : fDoctor,
        from: fFrom || undefined,
        to: fTo || undefined,
        limit: "100",
      }),
  });
  const doctors = useQuery({
    queryKey: ["doctors", "all"],
    queryFn: () => doctorsAPI.getAll(undefined, { limit: "200" }),
  });

  const todayK = dayKey(new Date());
  const weekEnd = Date.now() + 8 * 86_400_000;
  const rows = useMemo(
    () =>
      (list.data ?? []).filter((c) => {
        if (cardKey === "today")
          return dayKey(new Date(c.createdAt ?? Date.now())) === todayK;
        if (cardKey === "followups")
          return (
            !!c.followUpOn &&
            c.status === "signed" &&
            new Date(c.followUpOn).getTime() >= new Date(todayK).getTime() &&
            new Date(c.followUpOn).getTime() <= weekEnd
          );
        return true;
      }),
    [list.data, cardKey, todayK, weekEnd],
  );

  // ---- new consultation ----
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [visit, setVisit] = useState(WALK_IN);
  const [busy, setBusy] = useState(false);

  const patients = useQuery({
    queryKey: ["patients", "pick"],
    queryFn: () => patientsAPI.getAll(undefined, { limit: "200" }),
    enabled: open,
  });
  const myDoctor = doctors.data?.find(
    (d) => d.userId && d.userId === (user?.id ?? user?._id),
  );
  const todays = useQuery({
    queryKey: ["appointments", "patient-today", patientId],
    queryFn: () =>
      appointmentsAPI.getAll(undefined, { patientId, status: "scheduled" }),
    enabled: open && !!patientId,
  });
  const todaysVisits = (todays.data ?? []).filter(
    (a) => dayKey(new Date(a.scheduledAt)) === todayK,
  );

  const openNew = () => {
    setPatientId("");
    setVisit(WALK_IN);
    setDoctorId(myDoctor?._id ?? "");
    setOpen(true);
  };

  const start = async () => {
    if (!patientId) return toast.error("Choose a patient");
    setBusy(true);
    try {
      let appointmentId = visit;
      if (visit === WALK_IN) {
        if (!doctorId) {
          toast.error("Choose the doctor for this walk-in");
          return;
        }
        const a = await appointmentsAPI.create({
          patientId,
          doctorId,
          type: "walk_in",
        });
        appointmentId = a._id;
      }
      navigate(`/consultation/${appointmentId}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not start the consultation",
      );
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (d: string | Doctor | Patient) =>
    typeof d === "string" ? "" : d.name;
  const diag = (c: Consultation) =>
    c.diagnosis?.length ? c.diagnosis.join(", ") : c.complaints || "—";

  return (
    <AppLayout title="Consultations">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          See patients, write prescriptions and pick up where you left off.
        </p>
        <Button onClick={openNew}>
          <ClipboardPlus className="h-4 w-4" /> New consultation
        </Button>
      </div>

      <SummaryBar
        cards={[
          {
            key: "today",
            label: "Today",
            value: stat(sm?.today),
            icon: Stethoscope,
            filterable: true,
          },
          {
            key: "draft",
            label: "In progress",
            value: stat(sm?.drafts),
            icon: ClipboardEdit,
            color: "#FA731C",
            filterable: true,
          },
          {
            key: "signed",
            label: "Completed",
            value: stat(sm?.signed),
            icon: ClipboardCheck,
            color: "#00C48C",
            filterable: true,
          },
          {
            key: "followups",
            label: "Follow-ups this week",
            value: stat(sm?.followUpsThisWeek),
            icon: CalendarClock,
            color: "#7C3AED",
            filterable: true,
          },
        ]}
        active={cardKey}
        onPick={setCardKey}
        shown={rows.length}
        total={cardKey === "all" ? list.data?.length : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by patient name or ID…"
        filters={[
          {
            kind: "select",
            key: "doctor",
            label: "Doctor",
            value: fDoctor,
            onChange: setFDoctor,
            options: (doctors.data ?? []).map((d) => ({
              value: d._id,
              label: d.name,
            })),
          },
          {
            kind: "date",
            key: "from",
            label: "From",
            value: fFrom,
            onChange: setFFrom,
          },
          {
            kind: "date",
            key: "to",
            label: "To",
            value: fTo,
            onChange: setFTo,
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !rows.length ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-black/20" />
              <p className="font-semibold">No consultations yet</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Start one from here or from a patient's appointment.
              </p>
              <Button onClick={openNew}>
                <ClipboardPlus className="h-4 w-4" /> New consultation
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Seen on</TableHead>
                  <TableHead>Diagnosis / complaint</TableHead>
                  <TableHead>Rx</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const p = obj<Patient>(c.patientId);
                  const d = obj<Doctor>(c.doctorId);
                  const overdue =
                    c.status === "signed" &&
                    !!c.followUpOn &&
                    new Date(c.followUpOn).getTime() <
                      new Date(todayK).getTime();
                  const meds = c.prescription?.items?.length ?? 0;
                  return (
                    <TableRow
                      key={c._id}
                      className="cursor-pointer"
                      onClick={() =>
                        c.appointmentId &&
                        navigate(`/consultation/${c.appointmentId}`)
                      }
                    >
                      <TableCell>
                        <PersonCell
                          kind="patient"
                          id={p?._id}
                          name={p ? nameOf(p) : "Patient"}
                          sub={p?.patientId}
                        />
                      </TableCell>
                      <TableCell>
                        {d ? (
                          <PersonCell
                            kind="doctor"
                            id={d._id}
                            name={nameOf(d)}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {when(c.signedAt ?? c.createdAt)}
                      </TableCell>
                      <TableCell
                        className="max-w-[240px] truncate"
                        title={diag(c)}
                      >
                        {diag(c)}
                      </TableCell>
                      <TableCell>
                        {meds ? `${meds} medicine${meds > 1 ? "s" : ""}` : "—"}
                      </TableCell>
                      <TableCell
                        className={overdue ? "font-bold text-red-700" : ""}
                      >
                        {c.followUpOn
                          ? new Date(c.followUpOn).toLocaleDateString("en-IN")
                          : "—"}
                        {overdue && (
                          <span className="ml-1 text-[10px] uppercase">
                            overdue
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={
                            c.status === "draft" ? "pending" : "completed"
                          }
                          label={
                            c.status === "draft" ? "In progress" : "Signed"
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          <ActionButton
                            label={
                              c.status === "draft"
                                ? "Continue consultation"
                                : "Open consultation"
                            }
                            icon={
                              c.status === "draft" ? ClipboardEdit : FileText
                            }
                            disabled={!c.appointmentId}
                            to={
                              c.appointmentId
                                ? `/consultation/${c.appointmentId}`
                                : undefined
                            }
                          />
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New consultation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nc-patient">Patient</Label>
              <select
                id="nc-patient"
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setVisit(WALK_IN);
                }}
                className="nb-input flex h-10 w-full px-3 py-2 text-sm"
              >
                <option value="">
                  {patients.isLoading ? "Loading…" : "Select patient"}
                </option>
                {patients.data?.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.patientId ? `(${p.patientId})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {patientId && (
              <div className="space-y-1.5">
                <Label>Which visit?</Label>
                <div className="border-2 border-black">
                  {todaysVisits.map((a) => (
                    <label
                      key={a._id}
                      className="flex cursor-pointer items-center gap-2 border-b border-black/10 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="visit"
                        checked={visit === a._id}
                        onChange={() => setVisit(a._id)}
                        className="accent-[#024BAB]"
                      />
                      <CalendarClock className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">
                        Today{" "}
                        {new Date(a.scheduledAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {nameOf(a.doctorId)}
                      </span>
                      <StatusBadge status={a.status} />
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                    <input
                      type="radio"
                      name="visit"
                      checked={visit === WALK_IN}
                      onChange={() => setVisit(WALK_IN)}
                      className="accent-[#024BAB]"
                    />
                    <Footprints className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">
                      Walk-in: start a new visit now
                    </span>
                  </label>
                </div>
              </div>
            )}

            {patientId && visit === WALK_IN && (
              <div className="space-y-1.5">
                <Label htmlFor="nc-doctor">Doctor</Label>
                <select
                  id="nc-doctor"
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  className="nb-input flex h-10 w-full px-3 py-2 text-sm"
                >
                  <option value="">Select doctor</option>
                  {doctors.data
                    ?.filter((d) => d.accountStatus === "active")
                    .map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={start} disabled={busy || !patientId}>
              {busy ? "Starting…" : "Start consultation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
