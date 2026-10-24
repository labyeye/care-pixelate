import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  LogIn,
  Play,
  Plus,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  ApiError,
  appointmentsAPI,
  followUpsAPI,
  type FollowUpRow,
} from "@/services/api";
import type { Appointment, Doctor, Patient } from "@/types";
import { cn } from "@/lib/utils";

// Only clinicians open a visit (matches the server's /start guard).
const CLINICIANS = ["super_admin", "tenant_owner", "hospital_admin", "doctor"];

const TABS = [
  ["booked", "Booked"],
  ["followups", "Follow-ups"],
  ["others", "Others"],
] as const;

// Clinic-local (IST) YYYY-MM-DD, the format the appointments API expects.
const istDay = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const hhmm = (v: string) =>
  new Date(v).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
const mins = (v: string, now: number) =>
  Math.max(0, Math.floor((now - new Date(v).getTime()) / 60_000));
const nameOf = (r: string | Patient | Doctor) =>
  typeof r === "string" ? r : r.name;

function VisitCard({
  a,
  children,
}: {
  a: Appointment;
  children?: React.ReactNode;
}) {
  const p = typeof a.patientId === "object" ? (a.patientId as Patient) : null;
  return (
    <div className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_0_#000]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">
            {a.tokenNo ? `#${a.tokenNo} · ` : ""}
            {nameOf(a.patientId)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {p?.patientId ?? ""} · Dr. {nameOf(a.doctorId)} ·{" "}
            {hhmm(a.scheduledAt)}
            {a.type === "walk_in"
              ? " · Walk-in"
              : a.type === "video"
                ? " · Video"
                : ""}
          </p>
          {a.reason && (
            <p className="truncate text-xs text-muted-foreground">{a.reason}</p>
          )}
        </div>
        {(a.fee ?? 0) > 0 && (
          <span
            className={cn(
              "shrink-0 border-2 border-black px-2 py-0.5 text-xs font-bold",
              a.paymentStatus === "paid" ? "bg-green-100" : "bg-yellow-100",
            )}
          >
            ₹{a.fee} {a.paymentStatus === "paid" ? "paid" : "due"}
          </span>
        )}
      </div>
      {children && (
        <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="border-2 border-dashed border-black/40 p-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

/** Front-desk + doctor working screen: check patients in, start / resume the visit, see who is done. */
export default function QueuePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canStart = !!user && CLINICIANS.includes(user.role);
  const [day, setDay] = useState(() => new Date());
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("booked");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const dayStr = istDay(day);
  const isToday = dayStr === istDay(new Date());

  // The "since 02m" timers tick on their own; the list itself refetches below.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const list = useQuery({
    queryKey: ["queue", dayStr],
    queryFn: () =>
      appointmentsAPI.getAll(undefined, { date: dayStr, limit: "200" }),
    refetchInterval: 30_000,
  });
  const followUps = useQuery({
    queryKey: ["queue-follow-ups"],
    queryFn: () => followUpsAPI.list({ bucket: "today", status: "open" }),
  });

  const all = [...(list.data ?? [])].sort(
    (a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt),
  );
  const booked = all.filter((a) => a.status === "scheduled" && !a.checkedInAt);
  const opd = all
    .filter((a) => a.status === "scheduled" && a.checkedInAt)
    // ongoing first, then by arrival
    .sort(
      (a, b) =>
        Number(!!b.startedAt) - Number(!!a.startedAt) ||
        +new Date(a.checkedInAt!) - +new Date(b.checkedInAt!),
    );
  const completed = all.filter((a) => a.status === "completed");
  const others = all.filter(
    (a) => a.status === "cancelled" || a.status === "no_show",
  );
  const counts: Record<string, number | undefined> = {
    booked: booked.length,
    followups: followUps.data?.length,
    others: others.length,
  };

  const run = async (
    id: string,
    fn: () => Promise<unknown>,
    done?: () => void,
  ) => {
    setBusy(id);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["queue"] });
      done?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };
  const checkIn = (a: Appointment) =>
    run(a._id, () => appointmentsAPI.checkIn(a._id));
  const open = (a: Appointment) =>
    run(
      a._id,
      () => appointmentsAPI.start(a._id),
      () => nav(`/consultation/${a._id}`),
    );

  return (
    <AppLayout title="Queue">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDay(new Date(day.getTime() - 86_400_000))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 border-2 border-black bg-white px-3 py-1.5 text-center text-sm font-bold">
          {isToday ? "Today · " : ""}
          {day.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
          })}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDay(new Date(day.getTime() + 86_400_000))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isToday && (
          <Button variant="outline" onClick={() => setDay(new Date())}>
            Today
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ["queue"] })}
        >
          <RotateCw className="h-4 w-4" /> Refresh
        </Button>
        <Button asChild>
          <Link to="/appointments?new=1">
            <Plus className="h-4 w-4" /> New / Walk-in
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* left: who is coming */}
        <section>
          <div className="mb-3 flex border-2 border-black bg-white">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "flex-1 px-2 py-1.5 text-sm font-bold",
                  tab === k ? "bg-[#024BAB] text-white" : "hover:bg-[#F0F6FF]",
                )}
              >
                {label}
                {counts[k] !== undefined &&
                  ` (${String(counts[k]).padStart(2, "0")})`}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {list.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : tab === "booked" ? (
              booked.length ? (
                booked.map((a) => (
                  <VisitCard key={a._id} a={a}>
                    <Button
                      size="sm"
                      disabled={busy === a._id}
                      onClick={() => checkIn(a)}
                    >
                      <LogIn className="h-4 w-4" /> Check in
                    </Button>
                  </VisitCard>
                ))
              ) : (
                <Empty text="Nobody left to check in." />
              )
            ) : tab === "others" ? (
              others.length ? (
                others.map((a) => (
                  <VisitCard key={a._id} a={a}>
                    <span className="text-xs font-bold uppercase">
                      {a.status.replace("_", " ")}
                    </span>
                  </VisitCard>
                ))
              ) : (
                <Empty text="No cancelled or no-show visits." />
              )
            ) : (followUps.data ?? []).length ? (
              (followUps.data as FollowUpRow[]).map((r) => (
                <div
                  key={r._id}
                  className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_0_#000]"
                >
                  <p className="font-bold">{r.patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.patient.patientId} ·{" "}
                    {r.patient.contact?.phone || "no mobile"}
                    {r.doctor ? ` · Dr. ${r.doctor.name}` : ""}
                  </p>
                  <Button asChild size="sm" className="mt-2">
                    <Link
                      to={`/appointments?patientId=${r.patient._id}${r.doctor ? `&doctorId=${r.doctor._id}` : ""}`}
                    >
                      <Plus className="h-4 w-4" /> Book visit
                    </Link>
                  </Button>
                </div>
              ))
            ) : (
              <Empty
                text={
                  followUps.isLoading ? "Loading…" : "No follow-ups due today."
                }
              />
            )}
          </div>
        </section>

        {/* right: the doctor's working list */}
        <section className="space-y-6">
          <div>
            <h2 className="mb-2 border-2 border-black bg-[#024BAB] px-3 py-1.5 text-sm font-bold text-white">
              MY OPD ({String(opd.length).padStart(2, "0")})
            </h2>
            <div className="space-y-3">
              {opd.length ? (
                opd.map((a) => (
                  <VisitCard key={a._id} a={a}>
                    {a.startedAt ? (
                      <span className="border-2 border-green-700 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-800">
                        Ongoing · since {mins(a.startedAt, now)}m |{" "}
                        {hhmm(a.startedAt)}
                      </span>
                    ) : (
                      <span className="border-2 border-black bg-yellow-50 px-2 py-0.5 text-xs font-bold">
                        Waiting {mins(a.checkedInAt!, now)}m · in at{" "}
                        {hhmm(a.checkedInAt!)}
                      </span>
                    )}
                    <div className="flex-1" />
                    {canStart && (
                      <Button
                        size="sm"
                        disabled={busy === a._id}
                        onClick={() => open(a)}
                      >
                        <Play className="h-4 w-4" />{" "}
                        {a.startedAt ? "Resume" : "Start visit"}
                      </Button>
                    )}
                  </VisitCard>
                ))
              ) : (
                <Empty text="No patient checked in yet." />
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 border-2 border-black bg-white px-3 py-1.5 text-sm font-bold">
              COMPLETED ({String(completed.length).padStart(2, "0")})
            </h2>
            <div className="space-y-3">
              {completed.length ? (
                completed.map((a) => (
                  <VisitCard key={a._id} a={a}>
                    <div className="flex-1" />
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/consultation/${a._id}`}>
                        <FileText className="h-4 w-4" /> View prescription
                      </Link>
                    </Button>
                  </VisitCard>
                ))
              ) : (
                <Empty text="No completed visits yet." />
              )}
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
