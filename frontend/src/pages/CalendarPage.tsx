import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { appointmentsAPI, doctorsAPI } from "@/services/api";
import type { Appointment, Doctor, Patient } from "@/types";

type View = "month" | "week" | "day";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 – 21:00
const WEEK = { weekStartsOn: 1 as const };
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

const STATUS_STYLE: Record<Appointment["status"], string> = {
  scheduled: "bg-[#024BAB] text-white",
  completed: "bg-[#00C48C] text-black",
  cancelled: "bg-gray-200 text-gray-500 line-through",
  no_show: "bg-[#EF4444] text-white",
};

const patientName = (a: Appointment) =>
  typeof a.patientId === "object" ? (a.patientId as Patient).name : "Patient";
const doctorName = (a: Appointment) =>
  typeof a.doctorId === "object" ? (a.doctorId as Doctor).name : "Doctor";
const doctorKey = (a: Appointment) =>
  typeof a.doctorId === "object" ? (a.doctorId as Doctor)._id : a.doctorId;
const hourOf = (a: Appointment) =>
  Math.min(21, Math.max(7, new Date(a.scheduledAt).getHours()));

function Chip({
  a,
  onOpen,
  showDoctor = true,
}: {
  a: Appointment;
  onOpen: (a: Appointment) => void;
  showDoctor?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      title={`${format(new Date(a.scheduledAt), "p")} · ${patientName(a)} · ${doctorName(a)}`}
      className={cn(
        "w-full truncate border border-black px-1.5 py-0.5 text-left text-[11px] font-bold leading-tight",
        STATUS_STYLE[a.status],
      )}
    >
      {format(new Date(a.scheduledAt), "HH:mm")} {patientName(a)}
      {showDoctor && (
        <span className="font-medium opacity-80"> · {doctorName(a)}</span>
      )}
    </button>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [doctorId, setDoctorId] = useState("");
  const [open, setOpen] = useState<Appointment | null>(null);

  const { from, to, days } = useMemo(() => {
    if (view === "day") return { from: cursor, to: cursor, days: [cursor] };
    const f =
      view === "week"
        ? startOfWeek(cursor, WEEK)
        : startOfWeek(startOfMonth(cursor), WEEK);
    const t =
      view === "week"
        ? endOfWeek(cursor, WEEK)
        : endOfWeek(endOfMonth(cursor), WEEK);
    return { from: f, to: t, days: eachDayOfInterval({ start: f, end: t }) };
  }, [view, cursor]);

  const doctors = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsAPI.getAll(),
  });
  const appts = useQuery({
    queryKey: ["calendar", ymd(from), ymd(to), doctorId],
    queryFn: () =>
      appointmentsAPI.range({
        from: ymd(from),
        to: ymd(to),
        doctorId: doctorId || undefined,
      }),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appts.data ?? []) {
      const k = ymd(new Date(a.scheduledAt));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    for (const list of m.values())
      list.sort((x, y) => +new Date(x.scheduledAt) - +new Date(y.scheduledAt));
    return m;
  }, [appts.data]);

  const step = (dir: 1 | -1) =>
    setCursor((c) =>
      view === "month"
        ? addMonths(c, dir)
        : view === "week"
          ? addWeeks(c, dir)
          : addDays(c, dir),
    );

  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`
        : format(cursor, "EEEE, d MMMM yyyy");

  const total = appts.data?.length ?? 0;
  const activeDoctors = (doctors.data ?? []).filter(
    (d) => d.accountStatus === "active",
  );
  const dayColumns = doctorId
    ? activeDoctors.filter((d) => d._id === doctorId)
    : activeDoctors;
  const dayList = byDay.get(ymd(cursor)) ?? [];

  return (
    <AppLayout title="Calendar">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next"
            onClick={() => step(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {appts.isLoading
            ? "Loading…"
            : `${total} appointment${total === 1 ? "" : "s"}`}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by doctor"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="nb-input h-10 px-3 text-sm"
          >
            <option value="">All doctors</option>
            {activeDoctors.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="flex">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "no-nb border-2 border-black px-3 py-2 text-xs font-bold uppercase -ml-0.5 first:ml-0",
                  view === v
                    ? "bg-[#024BAB] text-white"
                    : "bg-white hover:bg-gray-50",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs font-bold">
        {(Object.keys(STATUS_STYLE) as Appointment["status"][]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 capitalize">
            <span
              className={cn(
                "inline-block h-3 w-3 border border-black",
                STATUS_STYLE[s].split(" ")[0],
              )}
            />
            {s.replace("_", " ")}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {appts.isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : view === "month" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 border-b-2 border-black bg-[#F8FAFF]">
                  {days.slice(0, 7).map((d) => (
                    <div
                      key={d.toISOString()}
                      className="px-2 py-2 text-xs font-bold uppercase tracking-wide"
                    >
                      {format(d, "EEE")}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((d) => {
                    const list = byDay.get(ymd(d)) ?? [];
                    return (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "min-h-[112px] border-b border-r border-black/20 p-1.5",
                          !isSameMonth(d, cursor) && "bg-muted/40",
                        )}
                      >
                        <button
                          onClick={() => {
                            setCursor(d);
                            setView("day");
                          }}
                          className={cn(
                            "no-nb mb-1 flex h-6 min-w-6 items-center justify-center px-1 text-xs font-bold hover:bg-muted",
                            isToday(d) &&
                              "bg-[#FA731C] text-white hover:bg-[#FA731C]",
                            !isSameMonth(d, cursor) && "text-muted-foreground",
                          )}
                        >
                          {format(d, "d")}
                        </button>
                        <div className="space-y-1">
                          {list.slice(0, 3).map((a) => (
                            <Chip key={a._id} a={a} onOpen={setOpen} />
                          ))}
                          {list.length > 3 && (
                            <button
                              onClick={() => {
                                setCursor(d);
                                setView("day");
                              }}
                              className="no-nb text-[11px] font-bold text-[#024BAB] hover:underline"
                            >
                              +{list.length - 3} more
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : view === "week" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b-2 border-black bg-[#F8FAFF]">
                  <div />
                  {days.map((d) => (
                    <button
                      key={d.toISOString()}
                      onClick={() => {
                        setCursor(d);
                        setView("day");
                      }}
                      className={cn(
                        "no-nb px-2 py-2 text-left text-xs font-bold hover:bg-muted",
                        isToday(d) && "text-[#FA731C]",
                      )}
                    >
                      <span className="uppercase">{format(d, "EEE")}</span>{" "}
                      {format(d, "d")}
                    </button>
                  ))}
                </div>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-black/10"
                  >
                    <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground">
                      {String(h).padStart(2, "0")}:00
                    </div>
                    {days.map((d) => {
                      const cell = (byDay.get(ymd(d)) ?? []).filter(
                        (a) => hourOf(a) === h,
                      );
                      return (
                        <div
                          key={d.toISOString()}
                          className={cn(
                            "min-h-[40px] space-y-1 border-l border-black/10 p-1",
                            isSameDay(d, new Date()) && "bg-[#FFF7ED]",
                          )}
                        >
                          {cell.map((a) => (
                            <Chip key={a._id} a={a} onOpen={setOpen} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {dayList.length === 0 && (
                <p className="border-b border-black/10 p-4 text-sm text-muted-foreground">
                  No appointments on this day.
                </p>
              )}
              <div
                style={{ minWidth: 80 + Math.max(dayColumns.length, 1) * 180 }}
              >
                <div
                  className="grid border-b-2 border-black bg-[#F8FAFF]"
                  style={{
                    gridTemplateColumns: `64px repeat(${Math.max(dayColumns.length, 1)}, minmax(160px, 1fr))`,
                  }}
                >
                  <div />
                  {dayColumns.length === 0 ? (
                    <div className="px-2 py-2 text-xs font-bold text-muted-foreground">
                      No active doctors
                    </div>
                  ) : (
                    dayColumns.map((d) => (
                      <div
                        key={d._id}
                        className="truncate px-2 py-2 text-xs font-bold"
                      >
                        {d.name}
                        <span className="block font-medium text-muted-foreground">
                          {d.professionalDetails?.specializations?.[0] ?? ""}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="grid border-b border-black/10"
                    style={{
                      gridTemplateColumns: `64px repeat(${Math.max(dayColumns.length, 1)}, minmax(160px, 1fr))`,
                    }}
                  >
                    <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground">
                      {String(h).padStart(2, "0")}:00
                    </div>
                    {dayColumns.length === 0 ? (
                      <div />
                    ) : (
                      dayColumns.map((d) => {
                        const cell = dayList.filter(
                          (a) => doctorKey(a) === d._id && hourOf(a) === h,
                        );
                        return (
                          <div
                            key={d._id}
                            className="min-h-[44px] space-y-1 border-l border-black/10 p-1"
                          >
                            {cell.map((a) => (
                              <Chip
                                key={a._id}
                                a={a}
                                onOpen={setOpen}
                                showDoctor={false}
                              />
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-2 text-sm">
              <p>
                <b>When:</b>{" "}
                {format(new Date(open.scheduledAt), "EEEE, d MMM yyyy 'at' p")}
              </p>
              <p>
                <b>Patient:</b> {patientName(open)}
                {typeof open.patientId === "object" &&
                (open.patientId as Patient).patientId
                  ? ` (${(open.patientId as Patient).patientId})`
                  : ""}
              </p>
              <p>
                <b>Doctor:</b> {doctorName(open)}
              </p>
              <p className="capitalize">
                <b>Type:</b> {(open.type ?? "in_clinic").replace("_", " ")}
                {open.tokenNo ? ` · Token ${open.tokenNo}` : ""}
              </p>
              {open.reason && (
                <p>
                  <b>Reason:</b> {open.reason}
                </p>
              )}
              <p className="flex items-center gap-2">
                <b>Status:</b>
                <StatusBadge status={open.status} />
              </p>
              {(open.status === "scheduled" || open.status === "completed") && (
                <Button asChild className="mt-2">
                  <Link to={`/consultation/${open._id}`}>
                    Open consultation
                  </Link>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
