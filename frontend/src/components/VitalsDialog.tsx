import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, appointmentsAPI } from "@/services/api";

// [min, max, label] — mirrors the server's hard limits (consultationController.cleanVitals).
const RULES = {
  sys: [60, 260, "Systolic BP"],
  dia: [30, 160, "Diastolic BP"],
  pulse: [20, 250, "Pulse"],
  tempC: [30, 45, "Temperature"],
  spo2: [50, 100, "SpO₂"],
  weightKg: [0.5, 500, "Weight"],
  heightCm: [20, 250, "Height"],
} as const;
type Key = keyof typeof RULES;

const blank = { sys: "", dia: "", pulse: "", tempC: "", spo2: "", weightKg: "", heightCm: "", complaints: "" };
const when = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Intake form for nurse / receptionist: saves vitals onto the visit so the doctor opens it pre-filled. */
export function VitalsDialog({ appointmentId, patientName, onClose }: { appointmentId: string | null; patientName?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank);
  const [touched, setTouched] = useState(false);

  const existing = useQuery({
    queryKey: ["triage", appointmentId],
    queryFn: () => appointmentsAPI.getVitals(appointmentId!),
    enabled: !!appointmentId,
  });

  // Start from whatever has already been recorded for this visit (so a correction only changes one box).
  useEffect(() => {
    const d = existing.data;
    if (!appointmentId || !d) return;
    const [sys = "", dia = ""] = (d.vitals.bp ?? "").split("/");
    const s = (n?: number) => (n === undefined || n === null ? "" : String(n));
    setF({ sys, dia, pulse: s(d.vitals.pulse), tempC: s(d.vitals.tempC), spo2: s(d.vitals.spo2), weightKg: s(d.vitals.weightKg), heightCm: s(d.vitals.heightCm), complaints: d.complaints ?? "" });
    setTouched(false);
  }, [existing.data, appointmentId]);

  const errors: Partial<Record<Key | "bp" | "any", string>> = {};
  for (const k of Object.keys(RULES) as Key[]) {
    const v = f[k];
    if (v === "") continue;
    const [lo, hi, label] = RULES[k];
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) errors[k] = `${label}: ${lo}–${hi}`;
  }
  if ((f.sys === "") !== (f.dia === "")) errors.bp = "Enter both systolic and diastolic";
  else if (f.sys && f.dia && !errors.sys && !errors.dia && Number(f.dia) >= Number(f.sys)) errors.bp = "Diastolic must be lower than systolic";
  if (![f.sys, f.pulse, f.tempC, f.spo2, f.weightKg, f.heightCm].some((v) => v !== "")) errors.any = "Enter at least one vital sign";

  const save = useMutation({
    mutationFn: () =>
      appointmentsAPI.saveVitals(appointmentId!, {
        vitals: {
          ...(f.sys ? { bp: `${f.sys}/${f.dia}` } : {}),
          ...(f.pulse ? { pulse: Number(f.pulse) } : {}),
          ...(f.tempC ? { tempC: Number(f.tempC) } : {}),
          ...(f.spo2 ? { spo2: Number(f.spo2) } : {}),
          ...(f.weightKg ? { weightKg: Number(f.weightKg) } : {}),
          ...(f.heightCm ? { heightCm: Number(f.heightCm) } : {}),
        },
        complaints: f.complaints || undefined,
      }),
    onSuccess: () => {
      toast.success("Vitals saved — the doctor will see them pre-filled");
      qc.invalidateQueries({ queryKey: ["triage", appointmentId] });
      qc.invalidateQueries({ queryKey: ["consultation", appointmentId] });
      qc.invalidateQueries({ queryKey: ["consultations"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save vitals"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return toast.error(Object.values(errors)[0]);
    save.mutate();
  };

  const num = (k: Key, label: string, placeholder: string, step = "any") => (
    <div className="space-y-1.5">
      <Label htmlFor={`v-${k}`}>{label}</Label>
      <Input id={`v-${k}`} type="number" inputMode="decimal" step={step} placeholder={placeholder} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {touched && errors[k] && <p className="text-xs font-bold text-red-600">{errors[k]}</p>}
    </div>
  );

  const rec = existing.data;
  return (
    <Dialog open={!!appointmentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#024BAB]" /> Record vitals{patientName ? ` — ${patientName}` : ""}
          </DialogTitle>
        </DialogHeader>
        {rec?.recordedBy && (
          <p className="border-2 border-black bg-[#F8FAFF] px-3 py-2 text-xs">
            Last recorded by <b>{rec.recordedBy.name}</b> ({rec.recordedBy.role.replace(/_/g, " ")}) · {when(rec.recordedAt)}
          </p>
        )}
        {rec?.consultationStatus === "signed" ? (
          <p className="text-sm font-bold text-red-700">This consultation is already signed, so vitals can no longer be changed.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {num("sys", "BP systolic", "120", "1")}
              {num("dia", "BP diastolic", "80", "1")}
              {num("pulse", "Pulse (bpm)", "72", "1")}
              {num("tempC", "Temp (°C)", "36.8", "0.1")}
              {num("spo2", "SpO₂ (%)", "98", "1")}
              {num("weightKg", "Weight (kg)", "64", "0.1")}
              {num("heightCm", "Height (cm)", "168", "1")}
            </div>
            {touched && (errors.bp || errors.any) && <p className="text-xs font-bold text-red-600">{errors.bp || errors.any}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="v-complaints">Reason for visit / chief complaint (optional)</Label>
              <textarea id="v-complaints" rows={2} maxLength={500} className="nb-input w-full px-3 py-2 text-sm" value={f.complaints} onChange={(e) => setF({ ...f, complaints: e.target.value })} placeholder="e.g. Fever since 2 days" />
              <p className="text-xs text-muted-foreground">Only fills the doctor's complaint field if it is still empty.</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save vitals"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
