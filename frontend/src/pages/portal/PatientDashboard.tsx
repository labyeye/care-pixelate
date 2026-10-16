import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, CalendarCheck, CalendarClock, CalendarPlus, FileText, FlaskConical, FolderOpen, HeartPulse, Pill, Receipt, UserRound, Video } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { portalAPI } from "@/services/api";
import { doctorLabel, fmtDate, fmtDateTime, inr, specialityOf } from "./shared";

function Panel({ title, to, children }: { title: string; to: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-black bg-white">
      <div className="flex items-center justify-between border-b-2 border-black bg-[#F8FAFF] px-4 py-2.5">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider">{title}</h3>
        <Link to={to} className="border-2 border-black px-2 py-0.5 text-xs font-bold hover:bg-[#024BAB] hover:text-white">View all →</Link>
      </div>
      <div className="nb-list divide-y divide-black/10">{children}</div>
    </div>
  );
}
const None = ({ text }: { text: string }) => <p className="p-4 text-sm text-muted-foreground">{text}</p>;

/** Patient landing page: what's next, what's new, what's owed — all from the portal API. */
export default function PatientDashboard() {
  const { user, tenant } = useAuth();
  const key = (k: string) => ["portal", k];
  const appts = useQuery({ queryKey: key("appointments"), queryFn: portalAPI.appointments });
  const rx = useQuery({ queryKey: key("prescriptions"), queryFn: portalAPI.prescriptions });
  const labs = useQuery({ queryKey: key("labs"), queryFn: portalAPI.labOrders });
  const invoices = useQuery({ queryKey: key("invoices"), queryFn: portalAPI.invoices });
  const records = useQuery({ queryKey: key("records"), queryFn: portalAPI.records });
  const vitals = useQuery({ queryKey: key("vitals"), queryFn: () => portalAPI.vitals() });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const now = Date.now();
  const upcoming = (appts.data ?? [])
    .filter((a) => a.status === "scheduled" && new Date(a.scheduledAt).getTime() > now - 60 * 60_000)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const next = upcoming[0];
  const due = (invoices.data ?? []).reduce((s, i) => s + Math.max(0, i.total - (i.paid || 0)), 0);
  const ready = (labs.data ?? []).filter((l) => l.status === "resulted");
  const daysToNext = next ? Math.max(0, Math.ceil((new Date(next.scheduledAt).getTime() - now) / 86_400_000)) : null;
  const readings30 = (vitals.data ?? []).filter((v) => now - new Date(v.measuredAt).getTime() <= 30 * 86_400_000);
  const lastReading = vitals.data?.[0];
  const latestMeds = rx.data?.[0]?.prescription?.items?.length ?? 0;
  const loading = appts.isLoading || rx.isLoading || labs.isLoading || invoices.isLoading;

  return (
    <AppLayout title="My Health">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">{greeting}, {user?.name?.split(" ")[0]}</h2>
        <p className="text-muted-foreground">{tenant?.name ? `${tenant.name} — ` : ""}your appointments, reports and bills in one place.</p>
      </div>

      {/* Next appointment */}
      <div className="mb-6 flex flex-col gap-4 border-2 border-black bg-[#024BAB] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-white">
            {next?.type === "video" ? <Video className="h-5 w-5 text-[#024BAB]" /> : <CalendarCheck className="h-5 w-5 text-[#024BAB]" />}
          </div>
          {loading ? (
            <Skeleton className="h-10 w-64" />
          ) : next ? (
            <div>
              <p className="font-display text-lg font-bold text-white">Next: {doctorLabel(next.doctorId)}</p>
              <p className="text-sm font-medium text-white/80">{fmtDateTime(next.scheduledAt)} · {next.type === "video" ? "Video consult" : "In clinic"}</p>
            </div>
          ) : (
            <div>
              <p className="font-display text-lg font-bold text-white">No upcoming appointments</p>
              <p className="text-sm font-medium text-white/80">Book a visit with one of your clinic's doctors.</p>
            </div>
          )}
        </div>
        <Link to="/my/appointments" className="flex items-center justify-center gap-2 self-start border-2 border-black bg-white px-4 py-2 text-sm font-bold text-[#024BAB] shadow-[3px_3px_0_0_#000] hover:translate-x-px hover:translate-y-px hover:shadow-none sm:self-auto">
          <CalendarPlus className="h-4 w-4" /> {next ? "Manage" : "Book appointment"}
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/my/appointments"><StatCard label="Upcoming visits" value={upcoming.length} sub={`${appts.data?.length ?? 0} in total`} icon={CalendarCheck} color="#024BAB" /></Link>
        <Link to="/my/prescriptions"><StatCard label="Prescriptions" value={rx.data?.length ?? 0} sub={rx.data?.[0] ? `Latest ${fmtDate(rx.data[0].signedAt)}` : "None yet"} icon={Pill} color="#00C48C" /></Link>
        <Link to="/my/lab-reports"><StatCard label="Lab reports" value={ready.length} sub={`${(labs.data?.length ?? 0) - ready.length} pending`} icon={FlaskConical} color="#A855F7" /></Link>
        <Link to="/my/invoices"><StatCard label="Outstanding" value={inr(due)} sub={`${invoices.data?.length ?? 0} invoices`} icon={Receipt} color={due > 0 ? "#EF4444" : "#FA731C"} /></Link>
        <Link to="/my/appointments"><StatCard label="Next visit in" value={daysToNext === null ? "—" : daysToNext === 0 ? "Today" : `${daysToNext} day${daysToNext === 1 ? "" : "s"}`} sub={next ? doctorLabel(next.doctorId) : "Nothing booked"} icon={CalendarClock} color="#0EA5E9" /></Link>
        <Link to="/my/prescriptions"><StatCard label="Medicines (latest Rx)" value={latestMeds} sub={rx.data?.[0] ? `Prescribed ${fmtDate(rx.data[0].signedAt)}` : "No prescription yet"} icon={FileText} color="#14B8A6" /></Link>
        <Link to="/my/vitals"><StatCard label="Health readings (30 days)" value={readings30.length} sub={lastReading ? `Last: ${lastReading.type} · ${fmtDate(lastReading.measuredAt)}` : "Start tracking"} icon={HeartPulse} color="#EC4899" /></Link>
        <Link to="/my/documents"><StatCard label="Documents saved" value={records.data?.length ?? 0} sub="reports, bills, scans" icon={FolderOpen} color="#8B5CF6" /></Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming appointments" to="/my/appointments">
          {!upcoming.length ? <None text="Nothing scheduled." /> : upcoming.slice(0, 4).map((a) => (
            <div key={a._id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-bold">{doctorLabel(a.doctorId)}</p>
                <p className="text-xs text-muted-foreground">{specialityOf(a.doctorId) || "General"} · {fmtDateTime(a.scheduledAt)}</p>
              </div>
              <StatusBadge status={a.type === "video" ? "video" : "in_clinic"} />
            </div>
          ))}
        </Panel>

        <Panel title="Recent prescriptions" to="/my/prescriptions">
          {!rx.data?.length ? <None text="No prescriptions yet." /> : rx.data.slice(0, 4).map((c) => (
            <div key={c._id} className="p-3 text-sm">
              <p className="font-bold">{doctorLabel(c.doctorId)} <span className="font-normal text-muted-foreground">· {fmtDate(c.signedAt)}</span></p>
              <p className="text-xs text-muted-foreground">
                {c.diagnosis?.join(", ") || "Consultation"}{c.prescription?.items?.length ? ` · ${c.prescription.items.length} medicine(s)` : ""}
              </p>
            </div>
          ))}
        </Panel>

        <Panel title="Lab reports" to="/my/lab-reports">
          {!labs.data?.length ? <None text="No lab orders yet." /> : labs.data.slice(0, 4).map((l) => (
            <div key={l._id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-bold">{l.number}</p>
                <p className="text-xs text-muted-foreground">{l.tests.map((t) => t.name).join(", ")}</p>
              </div>
              <StatusBadge status={l.status} />
            </div>
          ))}
        </Panel>

        <Panel title="Invoices" to="/my/invoices">
          {!invoices.data?.length ? <None text="No invoices yet." /> : invoices.data.slice(0, 4).map((i) => (
            <div key={i._id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-bold">{i.number}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(i.createdAt)} · {inr(i.total)}</p>
              </div>
              <StatusBadge status={i.status} />
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { to: "/my/vitals", icon: Activity, title: "Health tracker", sub: "Log BP, sugar, weight" },
          { to: "/my/documents", icon: FolderOpen, title: "My documents", sub: `${records.data?.length ?? 0} files saved` },
          { to: "/my/profile", icon: UserRound, title: "Profile & family", sub: "Keep your details current" },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="flex items-center gap-3 border-2 border-black bg-white p-4 transition-shadow hover:shadow-[3px_3px_0_0_#000]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-[#024BAB]">
              <q.icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold">{q.title}</p>
              <p className="text-xs text-muted-foreground">{q.sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
}
