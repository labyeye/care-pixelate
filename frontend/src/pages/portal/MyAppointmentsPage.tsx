import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus, CheckCircle2, Clock, CreditCard, Download, Video, X } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { inputCls } from "@/components/forms/WizardModal";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { openAppointmentReceipt, receiptNumber } from "@/lib/buildAppointmentReceipt";
import { ApiError, portalAPI } from "@/services/api";
import { runCheckout } from "@/lib/paymentGateway";
import type { Appointment, Doctor } from "@/types";
import { doctorLabel, Empty, fmtDateTime, inr, Intro, specialityOf, useProfiles, WhoTag } from "./shared";

const today = () => new Date().toISOString().slice(0, 10);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export default function MyAppointmentsPage() {
  const qc = useQueryClient();
  const { tenant } = useAuth();
  const profiles = useProfiles();
  const appts = useQuery({ queryKey: ["portal", "appointments"], queryFn: portalAPI.appointments });
  const payStatus = useQuery({ queryKey: ["portal", "pay-status"], queryFn: portalAPI.payStatus });
  const doctors = useQuery({ queryKey: ["portal", "doctors"], queryFn: portalAPI.doctors });

  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState("");
  const [manual, setManual] = useState("");
  const [mode, setMode] = useState<"in_clinic" | "video">("in_clinic");
  const [reason, setReason] = useState("");
  const [bookedSeed, setBookedSeed] = useState<Appointment | null>(null); // just-booked appointment, shown as the confirmation + receipt

  const doctor = doctors.data?.find((d) => d._id === doctorId);
  const slots = useQuery({
    queryKey: ["portal", "slots", doctorId, date],
    queryFn: () => portalAPI.slots(doctorId, date),
    enabled: open && !!doctorId && !!date,
  });
  // Doctors with no weekly schedule accept any time; let the patient type one.
  const noSchedule = !!doctor && !doctor.availability?.length;
  const chosen = noSchedule ? (manual ? new Date(manual).toISOString() : "") : slot;

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Something went wrong");
  const refresh = () => qc.invalidateQueries({ queryKey: ["portal"] });

  const book = useMutation({
    mutationFn: () => portalAPI.book({ patientId: profileId || profiles.data![0]._id, doctorId, scheduledAt: chosen, reason: reason.trim() || undefined, type: mode }),
    onSuccess: (appt) => {
      refresh();
      toast.success("Appointment booked");
      setOpen(false);
      // the API returns bare ids; fill in the names the receipt prints until the refreshed list replaces this
      setBookedSeed({ ...appt, doctorId: doctor ?? appt.doctorId, patientId: profiles.data?.find((p) => p._id === (profileId || profiles.data![0]._id)) ?? appt.patientId });
      if (payStatus.data?.enabled && (appt.fee ?? 0) > 0 && window.confirm(`Pay the consultation fee ${inr(appt.fee!)} now?`)) pay(appt);
    },
    onError,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => portalAPI.cancel(id),
    onSuccess: () => {
      refresh();
      toast.success("Appointment cancelled");
    },
    onError,
  });

  const pay = async (a: Appointment) => {
    try {
      const order = await portalAPI.payOrder(a._id);
      if (await runCheckout(order, "Consultation fee", (extra) => portalAPI.payVerify(a._id, order.orderId, extra))) {
        toast.success("Payment received");
        refresh();
      }
    } catch (err) {
      onError(err);
    }
  };

  const join = async (id: string) => {
    try {
      const { url } = await portalAPI.videoLink(id);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      onError(err);
    }
  };

  const openBook = () => {
    setProfileId(profiles.data?.[0]?._id ?? "");
    setDoctorId("");
    setDate(today());
    setSlot("");
    setManual("");
    setReason("");
    setMode("in_clinic");
    setOpen(true);
  };

  const now = Date.now();
  const all = appts.data ?? [];
  const upcoming = all.filter((a) => a.status === "scheduled" && new Date(a.scheduledAt).getTime() > now - 60 * 60_000).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const past = all.filter((a) => !upcoming.includes(a));

  // prefer the refreshed copy (carries paid status and populated names)
  const booked = bookedSeed ? (appts.data?.find((a) => a._id === bookedSeed._id) ?? bookedSeed) : null;
  const receipt = (a: Appointment) =>
    openAppointmentReceipt(a, tenant, profiles.data?.find((p) => p._id === a.patientId)) || toast.error("Allow pop-ups to download the receipt");

  const card = (a: Appointment, canAct: boolean) => (
    <div key={a._id} className="flex flex-col gap-3 border-2 border-black bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-[#024BAB]">
          {a.type === "video" ? <Video className="h-5 w-5 text-white" /> : <Clock className="h-5 w-5 text-white" />}
        </div>
        <div>
          <p className="font-bold">{doctorLabel(a.doctorId)} <WhoTag profiles={profiles.data} id={a.patientId} /></p>
          <p className="text-xs text-muted-foreground">{specialityOf(a.doctorId) || "General"} · {a.type === "video" ? "Video consult" : "In clinic"}</p>
          <p className="mt-1 text-sm font-semibold">{fmtDateTime(a.scheduledAt)}</p>
          {a.reason && <p className="text-xs text-muted-foreground">Reason: {a.reason}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={a.status} />
        {a.status === "scheduled" && a.paymentStatus === "paid" && <StatusBadge status="paid" />}
        {a.status !== "cancelled" && (
          <Button size="sm" variant="outline" onClick={() => receipt(a)}>
            <Download className="h-4 w-4" /> Receipt
          </Button>
        )}
        {canAct && payStatus.data?.enabled && a.paymentStatus === "unpaid" && (a.fee ?? 0) > 0 && (
          <Button size="sm" onClick={() => pay(a)}>
            <CreditCard className="h-4 w-4" /> Pay {inr(a.fee!)}
          </Button>
        )}
        {canAct && a.type === "video" && (
          <Button size="sm" onClick={() => join(a._id)}>
            <Video className="h-4 w-4" /> Join
          </Button>
        )}
        {canAct && (
          <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => window.confirm("Cancel this appointment?") && cancel.mutate(a._id)}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout title="My Appointments">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Intro>Book visits with your clinic's doctors and keep track of upcoming and past appointments.</Intro>
        <Button onClick={openBook} disabled={!profiles.data?.length}>
          <CalendarPlus className="h-4 w-4" /> Book appointment
        </Button>
      </div>

      {appts.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !all.length ? (
        <Empty icon={CalendarCheck} text="No appointments yet — book your first visit." />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Upcoming ({upcoming.length})</h2>
            <div className="space-y-3">{upcoming.length ? upcoming.map((a) => card(a, true)) : <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}</div>
          </section>
          {!!past.length && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Past & cancelled ({past.length})</h2>
              <div className="space-y-3 opacity-90">{past.map((a) => card(a, false))}</div>
            </section>
          )}
        </div>
      )}

      <Dialog open={!!booked} onOpenChange={(o) => !o && setBookedSeed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[#00C48C]" /> Booking confirmed</DialogTitle>
          </DialogHeader>
          {booked && (
            <div className="space-y-1 border-2 border-black bg-[#F8FAFF] p-3 text-sm">
              <p><b>{doctorLabel(booked.doctorId)}</b>{specialityOf(booked.doctorId) ? ` · ${specialityOf(booked.doctorId)}` : ""}</p>
              <p>{fmtDateTime(booked.scheduledAt)} · {booked.type === "video" ? "Video consult" : "In clinic"}</p>
              {!!booked.tokenNo && <p>Token: <b>{booked.tokenNo}</b></p>}
              <p className="text-xs text-muted-foreground">Receipt no. {receiptNumber(booked)} — also available any time from your appointments list.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookedSeed(null)}>Close</Button>
            <Button onClick={() => booked && receipt(booked)}>
              <Download className="h-4 w-4" /> Download receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Book an appointment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {(profiles.data?.length ?? 0) > 1 && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider">For</label>
                <select className={inputCls} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {profiles.data!.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Doctor</label>
              <select className={inputCls} value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(""); }}>
                <option value="">Select a doctor…</option>
                {(doctors.data ?? []).map((d: Doctor) => (
                  <option key={d._id} value={d._id}>
                    {doctorLabel(d)} — {specialityOf(d) || "General"}
                    {d.consultation?.consultationFee ? ` (${inr(d.consultation.consultationFee)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {doctor?.consultation?.consultationModes?.includes("video") && (
              <div className="flex gap-0 border-2 border-black">
                {(["in_clinic", "video"] as const).map((m, i) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 px-3 py-2 text-sm font-semibold ${i === 0 ? "border-r-2 border-black" : ""} ${mode === m ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}>
                    {m === "video" ? "Video consult" : "In clinic"}
                  </button>
                ))}
              </div>
            )}

            {doctor && (
              <>
                {noSchedule ? (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Preferred date & time</label>
                    <input type="datetime-local" className={inputCls} min={`${today()}T00:00`} value={manual} onChange={(e) => setManual(e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">This doctor has no fixed schedule — the clinic will confirm your time.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Date</label>
                      <input type="date" className={inputCls} min={today()} value={date} onChange={(e) => { setDate(e.target.value); setSlot(""); }} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Available slots</label>
                      {slots.isLoading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : !slots.data?.length ? (
                        <p className="text-sm text-muted-foreground">No free slots on this day — try another date.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {slots.data.map((s) => (
                            <button key={s.start} type="button" onClick={() => setSlot(s.start)} className={`border-2 border-black px-2 py-1.5 text-sm font-semibold ${slot === s.start ? "bg-[#024BAB] text-white" : "bg-white hover:bg-gray-50"}`}>
                              {time(s.start)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Reason (optional)</label>
                  <textarea className={inputCls} rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever since two days" />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button disabled={!doctorId || !chosen || book.isPending} onClick={() => book.mutate()}>
              {book.isPending ? "Booking…" : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

