import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import PatientDashboard from "@/pages/portal/PatientDashboard";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  CalendarCheck, CalendarDays, FlaskConical, IndianRupee, Receipt, Stethoscope, UserPlus, Users, Wallet,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { appointmentsAPI, complianceAPI, doctorsAPI, labAPI, patientsAPI, summaryAPI } from "@/services/api";
import type { Doctor, Patient } from "@/types";
import DoctorDashboard from "@/pages/DoctorDashboard";

const COLORS = ["#024BAB", "#FA731C", "#00C48C", "#A855F7", "#EF4444", "#FFD60A"];
const STATUS_COLOR: Record<string, string> = {
  scheduled: "#024BAB", completed: "#00C48C", cancelled: "#EF4444", no_show: "#FA731C",
};
const MODE_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank", online: "Online" };

const num = (n?: number | null) => (n === undefined || n === null ? <span className="inline-block h-7 w-12 animate-pulse bg-muted" /> : n.toLocaleString("en-IN"));
const inr = (n?: number | null) => (n === undefined || n === null ? num(n) : `₹${n.toLocaleString("en-IN")}`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const nameOf = (v: string | Patient | Doctor) => (typeof v === "string" ? "—" : v.name);

const NbTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-2 border-black bg-white px-3 py-2 text-xs">
      <p className="mb-1 font-bold">{label ?? payload[0].name}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-bold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function Panel({ title, sub, to, children, className = "" }: { title: string; sub?: string; to?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {to && (
          <Link to={to} className="border-2 border-black px-2 py-1 text-xs font-bold hover:bg-[#024BAB] hover:text-white">
            View all →
          </Link>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Empty = ({ text }: { text: string }) => (
  <div className="flex h-40 items-center justify-center text-xs font-bold text-muted-foreground">{text}</div>
);

function ClinicDashboard() {
  const { user, tenant } = useAuth();
  const isPatient = user?.role === "patient";
  const isSuperAdmin = user?.role === "super_admin";
  const staffView = !isPatient && !isSuperAdmin;

  const to = iso(new Date());
  const from = iso(new Date(Date.now() - 29 * 86_400_000));

  const summary = useQuery({ queryKey: ["summary"], queryFn: summaryAPI.get, enabled: staffView, staleTime: 30_000 });
  // Clinician/admin only on the server; other roles simply get no charts.
  const analytics = useQuery({ queryKey: ["analytics", from, to], queryFn: () => complianceAPI.analytics({ from, to }), enabled: staffView, retry: false });
  const appointments = useQuery({ queryKey: ["appointments"], queryFn: () => appointmentsAPI.getAll(), enabled: !isSuperAdmin });
  const patients = useQuery({ queryKey: ["patients"], queryFn: () => patientsAPI.getAll(), enabled: staffView });
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsAPI.getAll(), enabled: staffView });
  const labOrders = useQuery({ queryKey: ["lab-orders"], queryFn: () => labAPI.getAll(), enabled: staffView });

  const sm = summary.data;
  const an = analytics.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const todayStr = new Date().toDateString();
  const todays = (appointments.data ?? [])
    .filter((a) => new Date(a.scheduledAt).toDateString() === todayStr)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  const trend = (an?.appointments.byDay ?? []).map((d) => ({ label: d.date.slice(5), count: d.count }));
  const statusData = Object.entries(an?.appointments.byStatus ?? {}).map(([k, v]) => ({ name: k.replace("_", " "), key: k, value: v }));
  const modeData = Object.entries(an?.revenue.receivedByMode ?? {}).map(([k, v]) => ({ name: MODE_LABEL[k] ?? k, amount: Math.round(v) }));
  const labData = sm ? [
    { name: "Awaiting sample", count: sm.lab.ordered, fill: "#FA731C" },
    { name: "Collected", count: sm.lab.collected, fill: "#024BAB" },
    { name: "Resulted", count: sm.lab.resulted, fill: "#00C48C" },
    { name: "Abnormal", count: sm.lab.abnormal, fill: "#EF4444" },
  ] : [];

  return (
    <AppLayout title="Dashboard">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">{greeting}, {user?.name?.split(" ")[0]}</h2>
        <p className="text-muted-foreground">{tenant ? tenant.name : "Platform overview"} — here's what's happening today.</p>
      </div>

      {isSuperAdmin ? (
        <Card>
          <CardHeader><CardTitle>Platform overview</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Tenant and billing analytics land in a later milestone.</p>
          </CardContent>
        </Card>
      ) : isPatient ? (
        <StatCard label="Appointments" value={num(appointments.data?.length)} icon={CalendarDays} color="#00C48C" className="max-w-xs" />
      ) : (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link to="/patients"><StatCard label="Patients" value={num(sm?.patients.total)} sub={`${sm?.patients.newThisMonth ?? 0} new this month`} icon={Users} color="#024BAB" /></Link>
            <Link to="/doctors"><StatCard label="Doctors" value={num(sm?.doctors.total)} sub={`${sm?.doctors.active ?? 0} active`} icon={Stethoscope} color="#FA731C" /></Link>
            <Link to="/appointments"><StatCard label="Today's appointments" value={num(sm?.appointments.today)} sub={`${sm?.appointments.upcoming ?? 0} upcoming`} icon={CalendarCheck} color="#00C48C" /></Link>
            <Link to="/lab-orders"><StatCard label="Lab pending" value={num(sm ? sm.lab.ordered + sm.lab.collected : undefined)} sub={`${sm?.lab.abnormal ?? 0} abnormal`} icon={FlaskConical} color="#A855F7" /></Link>
            {sm?.invoices && (
              <>
                <Link to="/invoices"><StatCard label="Billed" value={inr(sm.invoices.billed)} sub={`${sm.invoices.count} invoices`} icon={Receipt} color="#024BAB" /></Link>
                <Link to="/invoices"><StatCard label="Collected" value={inr(sm.invoices.collected)} sub={`${sm.invoices.paid} fully paid`} icon={IndianRupee} color="#00C48C" /></Link>
                <Link to="/invoices"><StatCard label="Outstanding" value={inr(sm.invoices.outstanding)} sub={`${sm.invoices.unpaid + sm.invoices.partial} with dues`} icon={Wallet} color="#EF4444" /></Link>
              </>
            )}
            <Link to="/appointments"><StatCard label="Completed visits" value={num(sm?.appointments.completed)} sub={`${sm?.appointments.noShow ?? 0} no-shows`} icon={UserPlus} color="#FA731C" /></Link>
          </div>

          {/* Charts: trend + status */}
          {(analytics.isLoading || an) && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Appointments trend" sub="Daily bookings — last 30 days" to="/analytics" className="lg:col-span-2">
                {analytics.isLoading ? <Skeleton className="h-48 w-full" /> : trend.length ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="apptGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#024BAB" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#024BAB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip content={<NbTooltip />} />
                      <Area type="monotone" dataKey="count" name="Appointments" stroke="#024BAB" strokeWidth={2} fill="url(#apptGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <Empty text="No appointments in this period" />}
              </Panel>

              <Panel title="Appointment status" sub={`${an?.appointments.total ?? 0} in last 30 days · ${an?.appointments.noShowRate ?? 0}% no-show`}>
                {analytics.isLoading ? <Skeleton className="h-48 w-full" /> : statusData.length ? (
                  <div className="flex flex-col items-center gap-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={3} stroke="#0A0A0A" strokeWidth={2}>
                          {statusData.map((d, i) => <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={<NbTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                      {statusData.map((d, i) => (
                        <span key={d.key} className="flex items-center gap-1 text-[11px] font-bold capitalize">
                          <span className="h-2.5 w-2.5 border border-black" style={{ background: STATUS_COLOR[d.key] ?? COLORS[i % COLORS.length] }} />
                          {d.name} ({d.value})
                        </span>
                      ))}
                    </div>
                  </div>
                ) : <Empty text="No data yet" />}
              </Panel>
            </div>
          )}

          {/* Charts: revenue, top doctors, lab pipeline */}
          <div className="grid gap-4 lg:grid-cols-3">
            {an && sm?.invoices && (
              <Panel title="Payments received" sub="By mode — last 30 days" to="/invoices">
                {modeData.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={modeData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip content={<NbTooltip />} />
                      <Bar dataKey="amount" name="₹" stroke="#0A0A0A" strokeWidth={2}>
                        {modeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty text="No payments in this period" />}
              </Panel>
            )}

            {an && (
              <Panel title="Top doctors" sub="Completed visits — last 30 days" to="/doctors">
                {an.topDoctors.length ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={an.topDoctors} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} width={90} />
                      <Tooltip content={<NbTooltip />} />
                      <Bar dataKey="completed" name="Completed" fill="#024BAB" stroke="#0A0A0A" strokeWidth={2} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty text="No completed visits yet" />}
              </Panel>
            )}

            <Panel title="Lab pipeline" sub="Orders by stage" to="/lab-orders">
              {sm ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={labData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip content={<NbTooltip />} />
                    <Bar dataKey="count" name="Orders" stroke="#0A0A0A" strokeWidth={2}>
                      {labData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Skeleton className="h-44 w-full" />}
            </Panel>
          </div>

          {/* Tables */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Today's appointments" sub={`${todays.length} scheduled`} to="/appointments">
              {appointments.isLoading ? <Skeleton className="h-32 w-full" /> : !todays.length ? <Empty text="No appointments today" /> : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Time</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {todays.slice(0, 6).map((a) => (
                      <TableRow key={a._id}>
                        <TableCell>{new Date(a.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                        <TableCell className="font-bold">{nameOf(a.patientId)}</TableCell>
                        <TableCell>{nameOf(a.doctorId)}</TableCell>
                        <TableCell><StatusBadge status={a.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            <Panel title="Recent lab orders" sub="Latest requests" to="/lab-orders">
              {labOrders.isLoading ? <Skeleton className="h-32 w-full" /> : !labOrders.data?.length ? <Empty text="No lab orders yet" /> : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>No.</TableHead><TableHead>Patient</TableHead><TableHead>Tests</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {labOrders.data.slice(0, 6).map((o) => (
                      <TableRow key={o._id}>
                        <TableCell className="font-bold">{o.number}</TableCell>
                        <TableCell>{nameOf(o.patientId)}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{o.tests.map((t) => t.name).join(", ")}</TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>

            <Panel title="Recently registered patients" sub={`${sm?.patients.newThisMonth ?? 0} new this month`} to="/patients" className="lg:col-span-2">
              {patients.isLoading ? <Skeleton className="h-32 w-full" /> : !patients.data?.length ? <Empty text="No patients yet" /> : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Patient ID</TableHead><TableHead>Name</TableHead><TableHead>Gender</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...patients.data]
                      .sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0))
                      .slice(0, 5)
                      .map((p) => (
                        <TableRow key={p._id}>
                          <TableCell>{p.patientId || "—"}</TableCell>
                          <TableCell className="font-bold">{p.name}</TableCell>
                          <TableCell className="capitalize">{p.gender || "—"}</TableCell>
                          <TableCell>{p.contact?.phone || "—"}</TableCell>
                          <TableCell><StatusBadge status={p.patientStatus} /></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function StaffDashboard() {
  const { user } = useAuth();
  return user?.role === "doctor" ? <DoctorDashboard /> : <ClinicDashboard />;
}

// Patients get their own portal home; everyone else the clinic dashboard.
export default function DashboardPage() {
  const { user } = useAuth();
  return user?.role === "patient" ? <PatientDashboard /> : <StaffDashboard />;
}
