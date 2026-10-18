import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  FlaskConical,
  PlayCircle,
  TriangleAlert,
  UserCheck,
  Users,
  Hourglass,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/StatCard";
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
  appointmentsAPI,
  consultationsAPI,
  doctorsAPI,
  labAPI,
} from "@/services/api";
import type { Doctor, Patient } from "@/types";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const STATUS_COLOR: Record<string, string> = {
  scheduled: "#024BAB",
  completed: "#00C48C",
  cancelled: "#EF4444",
  no_show: "#FA731C",
};
const nameOf = (v: string | Patient | Doctor) =>
  typeof v === "string" ? "—" : v.name;
const time = (d: string) =>
  new Date(d).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const NbTooltip = ({ active, payload, label }: any) =>
  !active || !payload?.length ? null : (
    <div className="border-2 border-black bg-white px-3 py-2 text-xs">
      <p className="mb-1 font-bold">{label ?? payload[0].name}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-bold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );

const Empty = ({ text }: { text: string }) => (
  <div className="flex h-32 items-center justify-center text-xs font-bold text-muted-foreground">
    {text}
  </div>
);

function Panel({
  title,
  sub,
  to,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  to?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {to && (
          <Link
            to={to}
            className="border-2 border-black px-2 py-1 text-xs font-bold hover:bg-[#024BAB] hover:text-white"
          >
            View all →
          </Link>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A doctor's own day: only the appointments and lab orders tied to their linked doctor profile. */
export default function DoctorDashboard() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const doctors = useQuery({
    queryKey: ["doctors"],
    queryFn: () => doctorsAPI.getAll(),
  });
  const me = doctors.data?.find(
    (d) => d.userId && String(d.userId) === String(user?._id),
  );

  const from = iso(new Date(Date.now() - 29 * DAY));
  const to = iso(new Date(Date.now() + 7 * DAY));
  const appts = useQuery({
    queryKey: ["my-appointments", me?._id, from, to],
    queryFn: () => appointmentsAPI.range({ from, to, doctorId: me!._id }),
    enabled: !!me,
  });
  const labs = useQuery({
    queryKey: ["lab-orders"],
    queryFn: () => labAPI.getAll(),
    enabled: !!me,
  });
  // this doctor's own consultations: drafts in progress + signed ones with a follow-up date
  const consults = useQuery({
    queryKey: ["my-consultations", me?._id],
    queryFn: () => consultationsAPI.getAll({ doctorId: me!._id, limit: "300" }),
    enabled: !!me,
  });

  const all = appts.data ?? [];
  const now = Date.now();
  const todayStr = new Date().toDateString();
  const today = all
    .filter((a) => new Date(a.scheduledAt).toDateString() === todayStr)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const remaining = today.filter((a) => a.status === "scheduled");
  const next =
    remaining.find((a) => +new Date(a.scheduledAt) >= now - 15 * 60_000) ??
    remaining[0];
  const upcoming = all.filter(
    (a) =>
      a.status === "scheduled" &&
      new Date(a.scheduledAt).getTime() > now &&
      new Date(a.scheduledAt).toDateString() !== todayStr,
  );
  const past = all.filter((a) => new Date(a.scheduledAt).getTime() <= now);
  const completed30 = past.filter((a) => a.status === "completed").length;
  const noShow30 = past.filter((a) => a.status === "no_show").length;

  const last14 = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY);
    return {
      label: iso(d).slice(5),
      count: all.filter(
        (a) => new Date(a.scheduledAt).toDateString() === d.toDateString(),
      ).length,
    };
  });
  const statusData = Object.entries(
    past.reduce<Record<string, number>>(
      (m, a) => ((m[a.status] = (m[a.status] ?? 0) + 1), m),
      {},
    ),
  ).map(([k, v]) => ({ key: k, name: k.replace("_", " "), value: v }));

  const myLabs = (labs.data ?? []).filter((o) => {
    const id =
      typeof o.doctorId === "string"
        ? o.doctorId
        : (o.doctorId as { _id?: string } | undefined)?._id;
    return id === me?._id;
  });
  const pendingLabs = myLabs.filter(
    (o) => o.status === "ordered" || o.status === "collected",
  ).length;
  const waiting = today.filter(
    (a) => a.status === "scheduled" && a.checkedInAt,
  ).length;
  const patients30 = new Set(
    past
      .filter((a) => a.status === "completed")
      .map((a) =>
        typeof a.patientId === "string" ? a.patientId : a.patientId._id,
      ),
  ).size;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekEnd = startOfToday.getTime() + 8 * DAY;
  const signed = (consults.data ?? []).filter(
    (c) => c.status === "signed" && c.followUpOn,
  );
  const followUpsDue = signed.filter((c) => {
    const t = new Date(c.followUpOn!).getTime();
    return t >= startOfToday.getTime() && t < weekEnd;
  }).length;
  const followUpsOverdue = signed.filter(
    (c) => new Date(c.followUpOn!).getTime() < startOfToday.getTime(),
  ).length;
  const inProgress = (consults.data ?? []).filter(
    (c) => c.status === "draft",
  ).length;
  const noShowRate =
    completed30 + noShow30
      ? Math.round((noShow30 / (completed30 + noShow30)) * 100)
      : 0;
  const abnormal = myLabs.filter(
    (o) =>
      o.status === "resulted" &&
      o.tests.some((t) => t.flag === "high" || t.flag === "low"),
  );

  return (
    <AppLayout title="Today's Patients">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">
          {greeting}, Dr. {user?.name?.replace(/^dr\.?\s*/i, "").split(" ")[0]}
        </h2>
        <p className="text-muted-foreground">
          {me
            ? `${today.length} appointment${today.length === 1 ? "" : "s"} today · ${remaining.length} still to see.`
            : "Your schedule at a glance."}
        </p>
      </div>

      {doctors.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !me ? (
        <div className="flex items-start gap-3 border-2 border-[#FA731C] bg-[#FA731C]/5 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#FA731C]" />
          <div>
            <p className="font-bold">
              Your login isn't linked to a doctor profile yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Ask your clinic admin to link this account to your doctor profile
              so your own appointments appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Next patient */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-black bg-[#024BAB] p-4 text-white">
            {next ? (
              <>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/70">
                    Next patient
                  </p>
                  <p className="text-xl font-bold">{nameOf(next.patientId)}</p>
                  <p className="text-sm text-white/80">
                    {time(next.scheduledAt)}
                    {next.reason ? ` · ${next.reason}` : ""}
                    {next.type === "video" ? " · Video" : ""}
                  </p>
                </div>
                <Link to={`/consultation/${next._id}`}>
                  <Button variant="secondary">
                    <PlayCircle className="h-4 w-4" /> Start consultation
                  </Button>
                </Link>
              </>
            ) : (
              <p className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-5 w-5" /> No more patients scheduled
                today.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Today"
              value={today.length}
              sub={`${remaining.length} remaining`}
              icon={CalendarCheck}
              color="#024BAB"
            />
            <StatCard
              label="Seen today"
              value={today.filter((a) => a.status === "completed").length}
              sub={inProgress ? `${inProgress} in progress` : "all caught up"}
              icon={CheckCircle2}
              color="#00C48C"
            />
            <StatCard
              label="Waiting now"
              value={waiting}
              sub="checked in at the desk"
              icon={Hourglass}
              color="#EAB308"
            />
            <StatCard
              label="Upcoming (7 days)"
              value={upcoming.length}
              icon={Clock}
              color="#FA731C"
            />
            <StatCard
              label="Completed (30 days)"
              value={completed30}
              sub={`${noShow30} no-shows · ${noShowRate}%`}
              icon={Users}
              color="#A855F7"
            />
            <StatCard
              label="Patients seen (30 days)"
              value={patients30}
              sub={
                completed30
                  ? `${(completed30 / 30).toFixed(1)} visits / day`
                  : undefined
              }
              icon={UserCheck}
              color="#0EA5E9"
            />
            <StatCard
              label="Lab results pending"
              value={pendingLabs}
              sub={`${abnormal.length} abnormal to review`}
              icon={FlaskConical}
              color={abnormal.length ? "#EF4444" : "#14B8A6"}
            />
            <StatCard
              label="Follow-ups due (7 days)"
              value={followUpsDue}
              sub={
                followUpsOverdue
                  ? `${followUpsOverdue} overdue`
                  : "none overdue"
              }
              icon={CalendarClock}
              color={followUpsOverdue ? "#EF4444" : "#8B5CF6"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              title="My appointments"
              sub="Per day — last 14 days"
              className="lg:col-span-2"
            >
              <ResponsiveContainer width="100%" height={190}>
                <BarChart
                  data={last14}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E5E7EB"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fontWeight: 700 }}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip content={<NbTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Appointments"
                    fill="#024BAB"
                    stroke="#0A0A0A"
                    strokeWidth={2}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Outcome" sub="Last 30 days">
              {statusData.length ? (
                <div className="flex flex-col items-center gap-2">
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={34}
                        outerRadius={56}
                        paddingAngle={3}
                        stroke="#0A0A0A"
                        strokeWidth={2}
                      >
                        {statusData.map((d) => (
                          <Cell
                            key={d.key}
                            fill={STATUS_COLOR[d.key] ?? "#6B7280"}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<NbTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                    {statusData.map((d) => (
                      <span
                        key={d.key}
                        className="flex items-center gap-1 text-[11px] font-bold capitalize"
                      >
                        <span
                          className="h-2.5 w-2.5 border border-black"
                          style={{
                            background: STATUS_COLOR[d.key] ?? "#6B7280",
                          }}
                        />
                        {d.name} ({d.value})
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <Empty text="No visits yet" />
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Today's schedule"
              sub={`${today.length} appointments`}
              to="/appointments"
            >
              {appts.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !today.length ? (
                <Empty text="Nothing scheduled today" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {today.map((a) => (
                      <TableRow key={a._id}>
                        <TableCell className="whitespace-nowrap">
                          {time(a.scheduledAt)}
                        </TableCell>
                        <TableCell className="font-bold">
                          {nameOf(a.patientId)}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {a.reason || "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            <Panel
              title="My lab orders"
              sub={`${abnormal.length} abnormal result${abnormal.length === 1 ? "" : "s"}`}
              to="/lab-orders"
            >
              {labs.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !myLabs.length ? (
                <Empty text="No lab orders from you yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No.</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Tests</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myLabs.slice(0, 6).map((o) => (
                      <TableRow key={o._id}>
                        <TableCell className="font-bold">{o.number}</TableCell>
                        <TableCell>{nameOf(o.patientId)}</TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          {o.tests.map((t) => t.name).join(", ")}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            {upcoming.length > 0 && (
              <Panel
                title="Upcoming"
                sub="Next 7 days"
                to="/calendar"
                className="lg:col-span-2"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.slice(0, 6).map((a) => (
                      <TableRow key={a._id}>
                        <TableCell>
                          {new Date(a.scheduledAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </TableCell>
                        <TableCell>{time(a.scheduledAt)}</TableCell>
                        <TableCell className="font-bold">
                          {nameOf(a.patientId)}
                        </TableCell>
                        <TableCell>{a.reason || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
