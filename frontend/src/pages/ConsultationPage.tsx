import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Plus,
  Printer,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/Avatar";
import { Suggest, SuggestArea, TagInput } from "@/components/forms/Suggest";
import { Field, inputCls } from "@/components/forms/WizardModal";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { searchConditions, searchDrugs } from "@/lib/lookups";
import { openConsultationPDF } from "@/lib/openInvoice";
import {
  ADVICE,
  COMPLAINTS,
  DIAGNOSES,
  DOSAGES,
  EXAM_FINDINGS,
  FREQUENCIES,
  INSTRUCTIONS,
  MEDICINES,
} from "@/lib/presets";
import {
  ApiError,
  appointmentsAPI,
  complianceAPI,
  consultationsAPI,
  medicinesAPI,
  patientsAPI,
} from "@/services/api";
import type { Consultation, Doctor, Medicine, Patient, RxItem } from "@/types";

// ---- form <-> Consultation model ------------------------------------------------------------------
// Every field below maps 1:1 to backend/models/Consultation.js:
//   vitals{bp,pulse,tempC,spo2,weightKg,heightCm}, complaints, diagnosis[], notes, followUpOn,
//   prescription{items[{drug,dose,frequency,days,instructions}], advice}
const blankItem: RxItem = {
  drug: "",
  dose: "",
  frequency: "",
  days: undefined,
  instructions: "",
};

const emptyForm = {
  bp: "",
  pulse: "",
  tempC: "",
  spo2: "",
  weightKg: "",
  heightCm: "",
  complaints: "",
  diagnosis: [] as string[],
  notes: "",
  followUpOn: "",
  advice: "",
  items: [{ ...blankItem }] as RxItem[],
};
type Form = typeof emptyForm;

const num = (v: string) => (v === "" ? undefined : Number(v));
const str = (n?: number | null) =>
  n === undefined || n === null ? "" : String(n);

const toForm = (c: Consultation): Form => ({
  bp: c.vitals?.bp ?? "",
  pulse: str(c.vitals?.pulse),
  tempC: str(c.vitals?.tempC),
  spo2: str(c.vitals?.spo2),
  weightKg: str(c.vitals?.weightKg),
  heightCm: str(c.vitals?.heightCm),
  complaints: c.complaints ?? "",
  diagnosis: c.diagnosis ?? [],
  notes: c.notes ?? "",
  followUpOn: c.followUpOn ? c.followUpOn.slice(0, 10) : "",
  advice: c.prescription?.advice ?? "",
  items: c.prescription?.items?.length
    ? c.prescription.items.map((i) => ({ ...blankItem, ...i }))
    : [{ ...blankItem }],
});

// Vital ranges (soft hints, never blocking): a value outside is highlighted so it is not missed.
const RANGE: Record<string, [number, number]> = {
  pulse: [50, 110],
  tempC: [35.5, 37.8],
  spo2: [94, 100],
};
const FREQ_PATTERNS = [
  "1-0-0",
  "0-1-0",
  "0-0-1",
  "1-0-1",
  "1-1-1",
  "1-1-1-1",
  "SOS",
  ...FREQUENCIES,
];
const FOLLOW_CHIPS = [3, 7, 14, 30];

const addDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ageOf = (dob?: string) => {
  if (!dob) return "";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000);
  return y >= 0 && y < 150 ? `${y} y` : "";
};
const obj = <T,>(v: string | T | undefined | null): T | undefined =>
  v && typeof v === "object" ? (v as T) : undefined;

export default function ConsultationPage() {
  const { appointmentId = "" } = useParams();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(emptyForm);
  const [transcript, setTranscript] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ---- data ----
  const appt = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsAPI.getOne(appointmentId),
  });
  const existing = useQuery({
    queryKey: ["consultation", appointmentId],
    queryFn: async () =>
      (await consultationsAPI.getAll({ appointmentId }))[0] ?? null,
  });
  const full = useQuery({
    queryKey: ["consultation-full", existing.data?._id],
    queryFn: () => consultationsAPI.getOne(existing.data!._id),
    enabled: !!existing.data?._id,
  });
  const c = full.data ?? null;
  const signed = c?.status === "signed";

  const a = appt.data;
  const patientRef = obj<Patient>(c?.patientId ?? a?.patientId);
  const doctor = obj<Doctor>(c?.doctorId ?? a?.doctorId);
  const patientId =
    patientRef?._id ??
    (typeof a?.patientId === "string" ? a.patientId : undefined);

  // the full Patient record (allergies, conditions, current medicines, DOB, blood group) and past visits
  const patientFull = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => patientsAPI.getOne(patientId!),
    enabled: !!patientId,
  });
  const history = useQuery({
    queryKey: ["consultations", "history", patientId],
    queryFn: () =>
      consultationsAPI.getAll({
        patientId: patientId!,
        status: "signed",
        limit: "6",
      }),
    enabled: !!patientId,
  });
  const patient = patientFull.data ?? patientRef;

  // clinic medicine inventory: powers the drug suggestions and the stock hint
  const inventory = useQuery({
    queryKey: ["medicines", "rx"],
    queryFn: () => medicinesAPI.getAll({ limit: "200", active: "true" }),
    staleTime: 60_000,
  });
  const byName = useRef(new Map<string, Medicine>());
  const label = (m: Medicine) =>
    m.strength && !m.name.toLowerCase().includes(m.strength.toLowerCase())
      ? `${m.name} ${m.strength}`
      : m.name;
  useEffect(() => {
    for (const m of inventory.data ?? [])
      byName.current.set(label(m).toLowerCase(), m);
  }, [inventory.data]);
  const inventoryNames = useMemo(
    () => (inventory.data ?? []).map(label),
    [inventory.data],
  );
  const drugSearch = async (q: string) => {
    const inv = await medicinesAPI
      .getAll({ q, limit: "8", active: "true" })
      .catch(() => [] as Medicine[]);
    inv.forEach((m) => byName.current.set(label(m).toLowerCase(), m));
    const ext = await searchDrugs(q).catch(() => [] as string[]);
    return [...inv.map(label), ...ext];
  };

  useEffect(() => {
    if (c) setForm(toForm(c));
  }, [c]);

  // ---- derived ----
  const allergies = patient?.medicalSummary?.allergies ?? [];
  const conflict = (drug: string) => {
    const d = drug.toLowerCase();
    return d.length > 2
      ? allergies.find((al) => al && d.includes(al.toLowerCase()))
      : undefined;
  };
  const bmi = (() => {
    const w = Number(form.weightKg),
      h = Number(form.heightCm) / 100;
    return w > 0 && h > 0 ? Math.round((w / (h * h)) * 10) / 10 : null;
  })();
  const outOfRange = (k: string, v: string) => {
    const r = RANGE[k];
    return !!r && v !== "" && (Number(v) < r[0] || Number(v) > r[1]);
  };
  const followDays = (
    doctor as (Doctor & { followUpDays?: number }) | undefined
  )?.followUpDays;
  const followChips = [
    ...new Set([...FOLLOW_CHIPS, ...(followDays ? [followDays] : [])]),
  ].sort((x, y) => x - y);

  // ---- actions ----
  const payload = () => ({
    vitals: {
      bp: form.bp,
      pulse: num(form.pulse),
      tempC: num(form.tempC),
      spo2: num(form.spo2),
      weightKg: num(form.weightKg),
      heightCm: num(form.heightCm),
    },
    complaints: form.complaints,
    diagnosis: form.diagnosis,
    notes: form.notes,
    followUpOn: form.followUpOn || undefined,
    prescription: {
      items: form.items.filter((i) => i.drug.trim()),
      advice: form.advice,
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["consultation", appointmentId] });
    qc.invalidateQueries({ queryKey: ["consultation-full"] });
    qc.invalidateQueries({ queryKey: ["consultations"] });
    qc.invalidateQueries({ queryKey: ["appointments"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Request failed");
  const showWarnings = (w: string[]) =>
    w.forEach((m) => toast.warning(m, { duration: 8000 }));

  const saveOrCreate = () =>
    existing.data
      ? consultationsAPI.update(existing.data._id, payload())
      : consultationsAPI.create({ appointmentId, ...payload() });

  const save = useMutation({
    mutationFn: saveOrCreate,
    onSuccess: (r) => {
      toast.success("Saved");
      showWarnings(r.warnings);
      refresh();
    },
    onError,
  });
  // The window opens inside the click so the browser doesn't block it; the full record is fetched for the print.
  const printSigned = async (id: string) => {
    const win = window.open("", "_blank");
    if (!win) return toast.error("Allow pop-ups to print the prescription");
    try {
      openConsultationPDF(await consultationsAPI.getOne(id), tenant, win);
    } catch (err) {
      win.close();
      onError(err);
    }
  };
  const sign = useMutation({
    mutationFn: async () =>
      consultationsAPI.sign((await saveOrCreate()).data._id),
    onSuccess: (signedRec) => {
      // A completed consultation prints with the clinic's Consultation Designer template (if one is saved).
      toast.success("Consultation signed", {
        action: {
          label: "Print prescription",
          onClick: () => printSigned(signedRec._id),
        },
      });
      refresh();
    },
    onError,
  });
  const discard = useMutation({
    mutationFn: () => consultationsAPI.discard(existing.data!._id),
    onSuccess: () => {
      toast.success("Draft discarded");
      refresh();
      setForm(emptyForm);
    },
    onError,
  });
  const scribe = useMutation({
    mutationFn: () => complianceAPI.scribe(transcript),
    onSuccess: (d) => {
      setForm((f) => ({
        ...f,
        complaints: d.complaints || f.complaints,
        diagnosis: d.diagnosis.length ? d.diagnosis : f.diagnosis,
        notes: d.notes || f.notes,
        bp: d.vitals.bp || f.bp,
        pulse: str(d.vitals.pulse) || f.pulse,
        tempC: str(d.vitals.tempC) || f.tempC,
        spo2: str(d.vitals.spo2) || f.spo2,
        weightKg: str(d.vitals.weightKg) || f.weightKg,
        advice: d.prescription.advice || f.advice,
        followUpOn:
          d.followUpInDays != null ? addDays(d.followUpInDays) : f.followUpOn,
        items: d.prescription.items.length
          ? d.prescription.items.map((i) => ({
              drug: i.drug,
              dose: i.dose ?? "",
              frequency: i.frequency ?? "",
              days: i.days,
              instructions: i.instructions ?? "",
            }))
          : f.items,
      }));
      toast.info("AI draft added: review every field before saving", {
        duration: 8000,
      });
    },
    onError,
  });

  const setItem = (i: number, patch: Partial<RxItem>) =>
    set(
      "items",
      form.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    );
  // picking an inventory medicine also fills its strength as the dose (when the dose is still empty)
  const pickDrug = (i: number, v: string) => {
    const m = byName.current.get(v.toLowerCase());
    setItem(i, {
      drug: v,
      ...(m && m.strength && !form.items[i].dose ? { dose: m.strength } : {}),
    });
  };

  const busy = save.isPending || sign.isPending;
  const pName = patient?.name ?? "";
  const dName = doctor?.name ?? "";
  const visits = (history.data ?? []).filter((h) => h._id !== c?._id);
  const loading = appt.isLoading || existing.isLoading;

  return (
    <AppLayout title="Consultation">
      <div className="space-y-4">
        {/* ---- action bar ---- */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            to="/consultations"
            className="inline-flex items-center gap-1 text-sm font-bold text-[#024BAB] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Consultations
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {signed && <StatusBadge status="completed" label="Signed" />}
            {!signed && existing.data && (
              <StatusBadge status="pending" label="In progress" />
            )}
            <Button
              variant="outline"
              onClick={() =>
                tenant?.consultationTemplate
                  ? openConsultationPDF(c!, tenant) ||
                    toast.error("Allow pop-ups to print the prescription")
                  : window.print()
              }
              disabled={!c}
            >
              <Printer className="h-4 w-4" /> Print Rx
            </Button>
            {!signed && (
              <>
                {existing.data && (
                  <Button
                    variant="outline"
                    disabled={busy || discard.isPending}
                    onClick={() =>
                      window.confirm("Discard this draft?") && discard.mutate()
                    }
                  >
                    <Trash2 className="h-4 w-4" /> Discard
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => save.mutate()}
                >
                  <Save className="h-4 w-4" /> Save draft
                </Button>
                <Button disabled={busy} onClick={() => sign.mutate()}>
                  Sign &amp; complete
                </Button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading consultation…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] print:block">
            {/* ================= main form ================= */}
            <div className="space-y-4 print:hidden">
              {!signed && tenant?.activeModules?.includes("ai_scribe") && (
                <Section
                  title="AI scribe (draft)"
                  icon={<Sparkles className="h-4 w-4" />}
                >
                  <textarea
                    aria-label="Consultation notes or transcript"
                    className={`${inputCls} min-h-20`}
                    placeholder="Paste or type what was discussed. The AI fills a draft you must review; nothing is saved automatically."
                    value={transcript}
                    maxLength={8000}
                    onChange={(e) => setTranscript(e.target.value)}
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Text is sent to an AI service to produce the draft.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        scribe.isPending || transcript.trim().length < 20
                      }
                      onClick={() => scribe.mutate()}
                    >
                      {scribe.isPending ? "Drafting…" : "Create draft"}
                    </Button>
                  </div>
                </Section>
              )}

              <fieldset disabled={signed} className="space-y-4">
                {/* vitals: 6 compact cells on one row */}
                <Section title="Vitals">
                  {c?.vitalsRecordedByName && (
                    <p className="mb-2 border-2 border-black bg-[#F8FAFF] px-3 py-1.5 text-xs">
                      Pre-filled from intake — recorded by{" "}
                      <b>{c.vitalsRecordedByName}</b>
                      {c.vitalsRecordedByRole
                        ? ` (${c.vitalsRecordedByRole.replace(/_/g, " ")})`
                        : ""}
                      {c.vitalsRecordedAt
                        ? ` · ${new Date(c.vitalsRecordedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : ""}
                      . You can edit any value.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <Field label="BP (mmHg)">
                      <input
                        className={inputCls}
                        placeholder="120/80"
                        value={form.bp}
                        onChange={(e) => set("bp", e.target.value)}
                      />
                    </Field>
                    {(
                      [
                        ["pulse", "Pulse (bpm)"],
                        ["tempC", "Temp (°C)"],
                        ["spo2", "SpO₂ (%)"],
                      ] as const
                    ).map(([k, l]) => (
                      <Field key={k} label={l}>
                        <input
                          type="number"
                          step="any"
                          className={`${inputCls} ${outOfRange(k, form[k]) ? "border-red-600 bg-red-50" : ""}`}
                          value={form[k]}
                          onChange={(e) => set(k, e.target.value)}
                        />
                      </Field>
                    ))}
                    <Field label="Weight (kg)">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        className={inputCls}
                        value={form.weightKg}
                        onChange={(e) => set("weightKg", e.target.value)}
                      />
                    </Field>
                    <Field label="Height (cm)">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        className={inputCls}
                        value={form.heightCm}
                        onChange={(e) => set("heightCm", e.target.value)}
                      />
                    </Field>
                  </div>
                  {bmi !== null && (
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      BMI {bmi}
                    </p>
                  )}
                </Section>

                {/* complaint + diagnosis side by side */}
                <Section title="Consultation">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Complaints">
                      <SuggestArea
                        rows={3}
                        presets={COMPLAINTS}
                        placeholder="Presenting complaints… (type to see suggestions)"
                        value={form.complaints}
                        onChange={(v) => set("complaints", v)}
                      />
                    </Field>
                    <Field label="Diagnosis">
                      <TagInput
                        values={form.diagnosis}
                        onChange={(v) => set("diagnosis", v)}
                        presets={DIAGNOSES}
                        search={searchConditions}
                        placeholder="Add diagnosis…"
                      />
                    </Field>
                    <Field label="Clinical notes" className="md:col-span-2">
                      <SuggestArea
                        rows={2}
                        presets={EXAM_FINDINGS}
                        placeholder="Examination findings, notes…"
                        value={form.notes}
                        onChange={(v) => set("notes", v)}
                      />
                    </Field>
                  </div>
                </Section>

                {/* prescription */}
                <Section
                  title="Prescription"
                  action={
                    !signed && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          set("items", [...form.items, { ...blankItem }])
                        }
                      >
                        <Plus className="h-4 w-4" /> Add medicine
                      </Button>
                    )
                  }
                >
                  <div className="space-y-2">
                    <div className="hidden grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
                      <span className="col-span-4">Medicine</span>
                      <span className="col-span-2">Dose</span>
                      <span className="col-span-2">Frequency</span>
                      <span className="col-span-1">Days</span>
                      <span className="col-span-2">Instructions</span>
                    </div>
                    {form.items.map((it, i) => {
                      const m = byName.current.get(it.drug.toLowerCase());
                      const bad = conflict(it.drug);
                      return (
                        <div key={i}>
                          <div className="grid grid-cols-12 items-start gap-2">
                            <div className="col-span-12 md:col-span-4">
                              <Suggest
                                value={it.drug}
                                onChange={(v) => pickDrug(i, v)}
                                presets={[
                                  ...new Set([...inventoryNames, ...MEDICINES]),
                                ]}
                                search={drugSearch}
                                placeholder="Medicine"
                                className={
                                  bad ? "border-red-600 bg-red-50" : ""
                                }
                              />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <Suggest
                                value={it.dose ?? ""}
                                onChange={(v) => setItem(i, { dose: v })}
                                presets={[
                                  ...(m?.strength ? [m.strength] : []),
                                  ...DOSAGES,
                                ]}
                                placeholder="Dose"
                              />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <Suggest
                                value={it.frequency ?? ""}
                                onChange={(v) => setItem(i, { frequency: v })}
                                presets={FREQ_PATTERNS}
                                placeholder="1-0-1"
                              />
                            </div>
                            <div className="col-span-4 md:col-span-1">
                              <input
                                type="number"
                                min={0}
                                className={inputCls}
                                placeholder="Days"
                                value={it.days ?? ""}
                                onChange={(e) =>
                                  setItem(i, { days: num(e.target.value) })
                                }
                              />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <Suggest
                                value={it.instructions ?? ""}
                                onChange={(v) =>
                                  setItem(i, { instructions: v })
                                }
                                presets={INSTRUCTIONS}
                                placeholder="Instructions"
                              />
                            </div>
                            <button
                              type="button"
                              aria-label="Remove medicine"
                              className="col-span-2 flex h-[42px] items-center justify-center border-2 border-black bg-white hover:bg-gray-50 md:col-span-1"
                              onClick={() =>
                                set(
                                  "items",
                                  form.items.length > 1
                                    ? form.items.filter((_, idx) => idx !== i)
                                    : [{ ...blankItem }],
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {(bad || m) && (
                            <p
                              className={`mt-1 flex items-center gap-1 text-xs font-semibold ${bad ? "text-red-700" : "text-muted-foreground"}`}
                            >
                              {bad ? (
                                <>
                                  <AlertTriangle className="h-3.5 w-3.5" />{" "}
                                  Patient has a recorded allergy to {bad}
                                </>
                              ) : m && m.trackInventory ? (
                                <span
                                  className={
                                    m.stockQty <= 0
                                      ? "text-red-700"
                                      : m.stockQty <= m.reorderLevel
                                        ? "text-[#FA731C]"
                                        : ""
                                  }
                                >
                                  In clinic stock:{" "}
                                  {m.stockQty <= 0
                                    ? "out of stock"
                                    : `${m.stockQty} ${m.unit}`}
                                  {m.dosageForm ? ` · ${m.dosageForm}` : ""}
                                </span>
                              ) : null}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>

                {/* advice + follow-up on one row */}
                <Section title="Advice & follow-up">
                  <div className="grid gap-3 md:grid-cols-[1fr_260px]">
                    <Field label="Advice to patient">
                      <SuggestArea
                        rows={3}
                        presets={ADVICE}
                        placeholder="Advice to patient… (type to see suggestions)"
                        value={form.advice}
                        onChange={(v) => set("advice", v)}
                      />
                    </Field>
                    <Field label="Follow-up on">
                      <input
                        type="date"
                        className={inputCls}
                        min={new Date().toISOString().slice(0, 10)}
                        value={form.followUpOn}
                        onChange={(e) => set("followUpOn", e.target.value)}
                      />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {followChips.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => set("followUpOn", addDays(d))}
                            className="border-2 border-black bg-white px-2 py-0.5 text-xs font-bold hover:bg-[#024BAB] hover:text-white"
                          >
                            +{d}d
                          </button>
                        ))}
                        {form.followUpOn && (
                          <button
                            type="button"
                            onClick={() => set("followUpOn", "")}
                            className="px-2 py-0.5 text-xs font-bold text-muted-foreground hover:underline"
                          >
                            clear
                          </button>
                        )}
                      </div>
                    </Field>
                  </div>
                </Section>
              </fieldset>
            </div>

            {/* ================= patient / visit side panel ================= */}
            <aside className="space-y-4 print:hidden">
              <Section title="Patient">
                <div className="flex items-center gap-3">
                  <Avatar
                    kind="patient"
                    id={patient?._id}
                    name={pName}
                    src={patient?.profileImage || undefined}
                    size={48}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold">
                      {pName || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        patient?.patientId,
                        ageOf(patient?.dateOfBirth),
                        patient?.gender,
                        patient?.bloodGroup && patient.bloodGroup !== "unknown"
                          ? patient.bloodGroup
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
                {patient?.contact?.phone && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Phone: {patient.contact.phone}
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  <Chips
                    title="Allergies"
                    items={allergies}
                    tone="red"
                    empty="None recorded"
                  />
                  <Chips
                    title="Conditions"
                    items={patient?.medicalSummary?.chronicConditions ?? []}
                    tone="blue"
                    empty="None recorded"
                  />
                  <Chips
                    title="Current medicines"
                    items={(
                      patient?.medicalSummary?.currentMedications ?? []
                    ).map((m) => [m.name, m.dosage].filter(Boolean).join(" "))}
                    tone="gray"
                    empty="None recorded"
                  />
                </div>
              </Section>

              <Section title="Visit">
                <div className="flex items-center gap-2">
                  <Avatar
                    kind="doctor"
                    id={doctor?._id}
                    name={dName}
                    src={doctor?.profileImage || undefined}
                    size={32}
                  />
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-bold">{dName || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doctor?.professionalDetails?.specializations?.join(", ")}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 text-xs">
                  <Row
                    k="When"
                    v={
                      a
                        ? new Date(a.scheduledAt).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"
                    }
                  />
                  <Row
                    k="Type"
                    v={(a?.type ?? "in_clinic").replace("_", " ")}
                  />
                  {a?.tokenNo ? <Row k="Token" v={String(a.tokenNo)} /> : null}
                  {a?.reason ? <Row k="Reason" v={a.reason} /> : null}
                  {signed && c?.signedAt ? (
                    <Row
                      k="Signed"
                      v={new Date(c.signedAt).toLocaleString("en-IN")}
                    />
                  ) : null}
                </dl>
              </Section>

              <Section title="Previous visits">
                {!visits.length ? (
                  <p className="text-xs text-muted-foreground">
                    No earlier signed consultations.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {visits.map((v) => (
                      <li
                        key={v._id}
                        className="border-b border-black/10 pb-2 last:border-0 last:pb-0"
                      >
                        <Link
                          to={
                            v.appointmentId
                              ? `/consultation/${v.appointmentId}`
                              : "#"
                          }
                          className="block hover:underline"
                        >
                          <p className="text-xs font-bold">
                            {new Date(
                              v.signedAt ?? v.createdAt ?? Date.now(),
                            ).toLocaleDateString("en-IN")}{" "}
                            · {obj<Doctor>(v.doctorId)?.name ?? "Doctor"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {v.diagnosis?.join(", ") || v.complaints || "—"}
                          </p>
                          {!!v.prescription?.items?.length && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              Rx:{" "}
                              {v.prescription.items
                                .map((i) => i.drug)
                                .join(", ")}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </aside>

            {/* ============== printable prescription (reads the saved record only) ============== */}
            {c && (
              <div className="hidden border-2 border-black bg-white p-4 print:block">
                <p className="font-display text-xl font-bold">
                  {tenant?.branding?.appName || tenant?.name}
                </p>
                <p className="text-xs">
                  {[
                    tenant?.contact?.address,
                    tenant?.contact?.city,
                    tenant?.contact?.phone,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p>
                    <b>Patient:</b> {pName}{" "}
                    {patient?.patientId ? `(${patient.patientId})` : ""}
                  </p>
                  <p>
                    <b>Doctor:</b> {dName}
                    {doctor?.professionalDetails?.registrationNumber
                      ? ` · Reg. ${doctor.professionalDetails.registrationNumber}`
                      : ""}
                  </p>
                  <p>
                    <b>Date:</b>{" "}
                    {new Date(
                      c.signedAt ?? c.createdAt ?? Date.now(),
                    ).toLocaleDateString("en-IN")}
                  </p>
                  {!!allergies.length && (
                    <p className="font-bold">
                      Allergies: {allergies.join(", ")}
                    </p>
                  )}
                </div>
                {(c.diagnosis?.length ?? 0) > 0 && (
                  <p className="mt-3 text-sm">
                    <b>Diagnosis:</b> {c.diagnosis.join(", ")}
                  </p>
                )}
                <p className="mt-2 font-display text-lg font-bold">℞</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1">Medicine</th>
                      <th>Dose</th>
                      <th>Frequency</th>
                      <th>Days</th>
                      <th>Instructions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.prescription?.items?.map((it, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 font-bold">{it.drug}</td>
                        <td>{it.dose}</td>
                        <td>{it.frequency}</td>
                        <td>{it.days ?? ""}</td>
                        <td>{it.instructions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {c.prescription?.advice && (
                  <p className="mt-3 text-sm">
                    <b>Advice:</b> {c.prescription.advice}
                  </p>
                )}
                {c.followUpOn && (
                  <p className="text-sm">
                    <b>Follow-up:</b>{" "}
                    {new Date(c.followUpOn).toLocaleDateString("en-IN")}
                  </p>
                )}
                <p className="mt-10 text-right text-sm">{dName}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ---- small presentational helpers -------------------------------------------------------------------
function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-2 border-black bg-white">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#024BAB]/5 px-4 py-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Chips({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: string[];
  tone: "red" | "blue" | "gray";
  empty: string;
}) {
  const cls = {
    red: "border-red-600 bg-red-50 text-red-700",
    blue: "border-[#024BAB] bg-[#024BAB]/10 text-[#024BAB]",
    gray: "border-gray-400 bg-gray-100 text-gray-700",
  }[tone];
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((x, i) => (
            <span
              key={i}
              className={`border px-1.5 py-0.5 text-xs font-semibold ${cls}`}
            >
              {x}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold capitalize">{v}</dd>
    </div>
  );
}
