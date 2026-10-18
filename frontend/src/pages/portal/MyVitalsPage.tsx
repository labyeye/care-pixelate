import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { inputCls } from "@/components/forms/WizardModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, portalAPI, type PortalVital } from "@/services/api";
import { Empty, fmtDateTime, Intro, useProfiles } from "./shared";

type VType = PortalVital["type"];
const META: Record<
  VType,
  { label: string; unit: string; two?: boolean; color: string }
> = {
  bp: { label: "Blood pressure", unit: "mmHg", two: true, color: "#EF4444" },
  sugar: { label: "Blood sugar", unit: "mg/dL", color: "#FA731C" },
  weight: { label: "Weight", unit: "kg", color: "#024BAB" },
  pulse: { label: "Pulse", unit: "bpm", color: "#A855F7" },
  spo2: { label: "SpO₂", unit: "%", color: "#00C48C" },
  temp: { label: "Temperature", unit: "°C", color: "#FA731C" },
};
const TYPES = Object.keys(META) as VType[];
const show = (v: PortalVital) =>
  v.value2 != null ? `${v.value}/${v.value2}` : String(v.value);
const nowLocal = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

export default function MyVitalsPage() {
  const qc = useQueryClient();
  const profiles = useProfiles();
  const [profileId, setProfileId] = useState("");
  const [type, setType] = useState<VType>("bp");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [note, setNote] = useState("");
  const [at, setAt] = useState(nowLocal());

  const pid = profileId || profiles.data?.[0]?._id;
  const q = useQuery({
    queryKey: ["portal", "vitals", pid],
    queryFn: () => portalAPI.vitals({ patientId: pid }),
    enabled: !!pid,
  });

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Something went wrong");
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["portal", "vitals"] });

  const add = useMutation({
    mutationFn: () =>
      portalAPI.addVital({
        patientId: pid,
        type,
        value: Number(value),
        value2: META[type].two ? Number(value2) : undefined,
        unit: META[type].unit,
        note: note.trim() || undefined,
        measuredAt: new Date(at).toISOString(),
      }),
    onSuccess: () => {
      refresh();
      toast.success("Reading saved");
      setOpen(false);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => portalAPI.deleteVital(id),
    onSuccess: refresh,
    onError,
  });

  const all = q.data ?? [];
  const latest = (t: VType) => all.find((v) => v.type === t); // API sorts newest first
  const series = all
    .filter((v) => v.type === type)
    .slice(0, 30)
    .reverse()
    .map((v) => ({
      d: new Date(v.measuredAt).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      }),
      v: v.value,
      v2: v.value2,
    }));
  const rows = all.filter((v) => v.type === type);

  const valid =
    value !== "" &&
    Number(value) > 0 &&
    (!META[type].two || (value2 !== "" && Number(value2) > 0));

  return (
    <AppLayout title="Health Tracker">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Intro>
          Log your own readings — blood pressure, sugar, weight and more — and
          watch the trend over time.
        </Intro>
        <div className="flex gap-2">
          {(profiles.data?.length ?? 0) > 1 && (
            <select
              className={`${inputCls} w-auto`}
              aria-label="Profile"
              value={pid}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {profiles.data!.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <Button
            onClick={() => {
              setValue("");
              setValue2("");
              setNote("");
              setAt(nowLocal());
              setOpen(true);
            }}
            disabled={!pid}
          >
            <Plus className="h-4 w-4" /> Add reading
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {TYPES.map((t) => {
          const l = latest(t);
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`border-2 border-black bg-white p-3 text-left transition-shadow hover:shadow-[3px_3px_0_0_#000] ${type === t ? "shadow-[3px_3px_0_0_#000]" : ""}`}
              style={
                type === t
                  ? { backgroundColor: `${META[t].color}12` }
                  : undefined
              }
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {META[t].label}
              </p>
              <p className="text-2xl font-bold">{l ? show(l) : "—"}</p>
              <p className="text-xs text-muted-foreground">{META[t].unit}</p>
            </button>
          );
        })}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !rows.length ? (
        <Empty
          icon={Activity}
          text={`No ${META[type].label.toLowerCase()} readings yet.`}
        />
      ) : (
        <div className="space-y-4">
          {series.length > 1 && (
            <div className="border-2 border-black bg-white p-4">
              <p className="mb-2 text-sm font-bold">
                {META[type].label} trend ({META[type].unit})
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={series}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E5E7EB"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="d"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="v"
                    name={META[type].two ? "Systolic" : META[type].label}
                    stroke={META[type].color}
                    strokeWidth={2}
                    dot
                  />
                  {META[type].two && (
                    <Line
                      type="monotone"
                      dataKey="v2"
                      name="Diastolic"
                      stroke="#024BAB"
                      strokeWidth={2}
                      dot
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="overflow-auto border-2 border-black bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-black bg-[#024BAB]/5 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Reading</th>
                  <th className="px-4 py-2">Note</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr
                    key={v._id}
                    className="border-b border-black/10 last:border-0"
                  >
                    <td className="px-4 py-2">{fmtDateTime(v.measuredAt)}</td>
                    <td className="px-4 py-2 font-bold">
                      {show(v)}{" "}
                      <span className="font-normal text-muted-foreground">
                        {META[v.type].unit}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {v.note || "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        aria-label="Delete reading"
                        disabled={remove.isPending}
                        onClick={() =>
                          window.confirm("Delete this reading?") &&
                          remove.mutate(v._id)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a reading</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as VType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {META[t].label} ({META[t].unit})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                  {META[type].two ? "Systolic" : "Value"}
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  className={inputCls}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
              </div>
              {META[type].two && (
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                    Diastolic
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    className={inputCls}
                    value={value2}
                    onChange={(e) => setValue2(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                Measured at
              </label>
              <input
                type="datetime-local"
                className={inputCls}
                max={nowLocal()}
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </div>
            <input
              className={inputCls}
              placeholder="Note (optional) — e.g. fasting"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={!valid || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending ? "Saving…" : "Save reading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
