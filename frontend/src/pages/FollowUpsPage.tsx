import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { PersonCell } from "@/components/Avatar";
import { FilterBar, useDebounced } from "@/components/FilterBar";
import { ActionButton, RowActions } from "@/components/RowActions";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, followUpsAPI, type FollowUpRow } from "@/services/api";
import { cn } from "@/lib/utils";

const BUCKETS = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["week", "Next 7 days"],
  ["upcoming", "All upcoming"],
] as const;

const day = (v: string) =>
  new Date(v).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const daysFrom = (v: string) =>
  Math.round(
    (new Date(v).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
      86_400_000,
  );

/** Who was told to come back, and have they? One list for the whole clinic (doctors see their own). */
export default function FollowUpsPage() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<string>("week");
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["follow-ups", bucket, status],
    queryFn: () => followUpsAPI.list({ bucket, status }),
  });
  const rows = useMemo(() => {
    const s = dq.trim().toLowerCase();
    return (list.data ?? []).filter(
      (r) =>
        !s ||
        [r.patient.name, r.patient.patientId, r.patient.contact?.phone].some(
          (x) =>
            String(x || "")
              .toLowerCase()
              .includes(s),
        ),
    );
  }, [list.data, dq]);

  const remind = async (r: FollowUpRow) => {
    setBusy(r._id);
    try {
      const res = await followUpsAPI.remind(r._id);
      if (res.sent) toast.success("Reminder sent on WhatsApp");
      else toast.info(res.reason || "Reminder was not sent");
      qc.invalidateQueries({ queryKey: ["follow-ups"] });
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not send reminder",
      );
    } finally {
      setBusy(null);
    }
  };

  const overdueCount = (list.data ?? []).filter(
    (r) => r.status === "pending" && daysFrom(r.followUpOn) < 0,
  ).length;

  return (
    <AppLayout title="Follow-ups">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          Patients the doctor asked to come back, and whether they have booked
          or visited.
        </p>
        {bucket !== "overdue" && overdueCount > 0 && (
          <button
            className="border-2 border-black bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
            onClick={() => setBucket("overdue")}
          >
            {overdueCount} overdue
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {BUCKETS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setBucket(k)}
            className={cn(
              "border-2 border-black px-4 py-1.5 text-sm font-bold",
              bucket === k
                ? "bg-[#024BAB] text-white"
                : "bg-white hover:bg-[#F0F6FF]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search patient, ID or mobile"
        filters={[
          {
            kind: "select",
            key: "status",
            label: "Status",
            value: status,
            onChange: setStatus,
            options: [
              { value: "open", label: "Not yet visited" },
              { value: "pending", label: "Not booked" },
              { value: "booked", label: "Booked" },
              { value: "visited", label: "Visited" },
              { value: "all", label: "All" },
            ],
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !rows.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No follow-ups here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Follow-up date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reminder</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const diff = daysFrom(r.followUpOn);
                  const late = r.status === "pending" && diff < 0;
                  return (
                    <TableRow key={r._id}>
                      <TableCell>
                        <PersonCell
                          kind="patient"
                          id={r.patient._id}
                          name={r.patient.name}
                          sub={r.patient.patientId}
                        />
                      </TableCell>
                      <TableCell>{r.patient.contact?.phone || "-"}</TableCell>
                      <TableCell>{r.doctor?.name || "-"}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "font-semibold",
                            late && "text-red-600",
                          )}
                        >
                          {day(r.followUpOn)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {diff === 0
                            ? "today"
                            : diff > 0
                              ? `in ${diff} day${diff === 1 ? "" : "s"}`
                              : `${-diff} day${diff === -1 ? "" : "s"} ago`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={r.status}
                          label={
                            r.status === "pending" ? "Not booked" : undefined
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.reminderSentAt
                          ? `Sent ${day(r.reminderSentAt)}`
                          : "Not sent"}
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          {r.patient.contact?.phone && (
                            <ActionButton
                              label="Call patient"
                              icon={Phone}
                              onClick={() =>
                                (window.location.href = `tel:${r.patient.contact!.phone}`)
                              }
                            />
                          )}
                          {r.status !== "visited" && (
                            <ActionButton
                              label="Send WhatsApp reminder"
                              icon={MessageCircle}
                              disabled={busy === r._id}
                              onClick={() => remind(r)}
                            />
                          )}
                          {r.status === "pending" && (
                            <ActionButton
                              label="Book appointment"
                              icon={CalendarPlus}
                              to={`/appointments?patientId=${r.patient._id}${r.doctor ? `&doctorId=${r.doctor._id}` : ""}`}
                            />
                          )}
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
    </AppLayout>
  );
}
