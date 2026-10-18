import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ClipboardPlus,
  FlaskConical,
  Receipt,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { patientsAPI } from "@/services/api";

const ICON = {
  appointment: CalendarDays,
  consultation: ClipboardPlus,
  invoice: Receipt,
  lab: FlaskConical,
} as const;
const d = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

export function PatientTimeline({
  patient,
  onClose,
}: {
  patient: { _id: string; name: string } | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["patient-timeline", patient?._id],
    queryFn: () => patientsAPI.timeline(patient!._id),
    enabled: !!patient,
  });
  const s = q.data?.summary;
  return (
    <Dialog open={!!patient} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{patient?.name}: history</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          q.data &&
          s && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Visits", String(s.visits)],
                  ["Last visit", d(s.lastVisit)],
                  ["Next visit", d(s.nextAppointment || s.nextFollowUp)],
                  ["Due", `Rs. ${s.outstanding}`],
                ].map(([k, v]) => (
                  <div key={k} className="border-2 border-black p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {k}
                    </p>
                    <p className="text-sm font-bold">{v}</p>
                  </div>
                ))}
              </div>
              {s.visits > 1 && (
                <p className="text-xs font-semibold text-[#024BAB]">
                  Returning patient: {s.visits} completed visits.
                </p>
              )}
              {!q.data.events.length && (
                <p className="text-sm text-muted-foreground">
                  Nothing recorded yet.
                </p>
              )}
              <ol className="space-y-2">
                {q.data.events.map((e) => {
                  const Icon = ICON[e.type];
                  return (
                    <li
                      key={`${e.type}${e.id}`}
                      className="flex gap-3 border-l-4 border-[#024BAB] bg-[#F0F6FF] p-2"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#024BAB]" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold">{e.title}</p>
                        {e.detail && (
                          <p className="truncate text-xs text-muted-foreground">
                            {e.detail}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {d(e.date)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
