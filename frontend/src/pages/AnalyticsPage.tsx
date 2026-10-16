import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { complianceAPI } from "@/services/api";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Shared by the Analytics page and the Analytics tab on Reports.
export function AnalyticsPanel() {
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(iso(today));

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", from, to],
    queryFn: () => complianceAPI.analytics({ from, to }),
  });

  const max = Math.max(1, ...(data?.appointments.byDay.map((d) => d.count) ?? [1]));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : error || !data ? (
        <p className="text-red-600">Could not load analytics for this range.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Appointments" value={data.appointments.total} hint={`${data.appointments.noShowRate}% no-show`} />
            <Stat label="New patients" value={data.newPatients} />
            <Stat label="Billed" value={inr(data.revenue.billed)} hint={`${data.revenue.invoices} invoices`} />
            <Stat label="Outstanding" value={inr(data.revenue.outstanding)} hint={`Collected ${inr(data.revenue.collected)}`} />
          </div>

          <Card>
            <CardHeader><CardTitle>Appointments per day</CardTitle></CardHeader>
            <CardContent>
              {data.appointments.byDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appointments in this range.</p>
              ) : (
                <div className="flex h-32 items-end gap-1" role="img" aria-label="Appointments per day">
                  {data.appointments.byDay.map((d) => (
                    <div key={d.date} className="flex-1" title={`${d.date}: ${d.count}`}>
                      <div className="w-full bg-[#024BAB]" style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>By status</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(data.appointments.byStatus).map(([k, v]) => (
                  <div key={k} className="flex justify-between capitalize"><span>{k.replace("_", " ")}</span><b>{v}</b></div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Received by mode</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.keys(data.revenue.receivedByMode).length === 0 && <p className="text-muted-foreground">No payments.</p>}
                {Object.entries(data.revenue.receivedByMode).map(([k, v]) => (
                  <div key={k} className="flex justify-between capitalize"><span>{k}</span><b>{inr(v)}</b></div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Top doctors (completed)</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.topDoctors.length === 0 && <p className="text-muted-foreground">No completed visits.</p>}
                {data.topDoctors.map((d) => (
                  <div key={d.doctorId} className="flex justify-between"><span>{d.name}</span><b>{d.completed}</b></div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <AppLayout title="Analytics">
      <AnalyticsPanel />
    </AppLayout>
  );
}
