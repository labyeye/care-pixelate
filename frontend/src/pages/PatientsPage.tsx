import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarPlus, Droplet, Pencil, Plus, Trash2, UserCheck, Users } from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { LocationFields } from "@/components/forms/LocationFields";
import { Suggest, TagInput } from "@/components/forms/Suggest";
import { Field, inputCls, PhotoField, WizardModal } from "@/components/forms/WizardModal";
import { Avatar, PersonCell } from "@/components/Avatar";
import { AppLayout } from "@/components/layout/AppLayout";
import { FilterBar, matches, useDebounced } from "@/components/FilterBar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { composePhone, DEFAULT_COUNTRY, PhoneInput, splitPhone, validatePhone } from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchConditions, searchDrugs } from "@/lib/lookups";
import {
  ALLERGIES, CONDITIONS, DOSAGES, FAMILY_HISTORY, FREQUENCIES, MEDICINES, PAST_MEDICAL, RELATIONSHIPS, SURGERIES,
} from "@/lib/presets";
import { ApiError, patientsAPI } from "@/services/api";
import type { Patient, PatientGender } from "@/types";

const BLOOD_GROUPS = ["unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const MARITAL = ["undisclosed", "single", "married", "divorced", "widowed", "other"] as const;
const GENDERS: PatientGender[] = ["male", "female", "other", "undisclosed"];
const TABS = ["Basic Info", "Address & Emergency", "Medical"];

type Med = { name: string; dosage: string; frequency: string };

const emptyForm = {
  profileImage: "",
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "" as PatientGender | "",
  bloodGroup: "unknown",
  maritalStatus: "undisclosed",
  patientStatus: "active",
  patientCode: "", // shown read-only: the server assigns the patient ID
  phoneCountry: DEFAULT_COUNTRY,
  phone: "",
  alternatePhone: "",
  email: "",
  street: "",
  state: "",
  city: "",
  pincode: "",
  country: "India",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  guardianName: "",
  guardianRelationship: "",
  guardianPhone: "",
  allergies: [] as string[],
  chronicConditions: [] as string[],
  pastMedicalHistory: [] as string[],
  pastSurgicalHistory: [] as string[],
  familyMedicalHistory: [] as string[],
  notes: "",
  medications: [] as Med[],
};
type Form = typeof emptyForm;

// Which wizard tab each validated field lives on.
const TAB_OF: Record<string, number> = {
  firstName: 0, lastName: 0, dateOfBirth: 0, gender: 0, phone: 0, alternatePhone: 0, email: 0,
  pincode: 1, emergencyPhone: 1, guardianPhone: 1,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const optionalPhone = (v: string) => (v && !/^\d{10}$/.test(v.replace(/\D/g, "")) ? "Enter a 10-digit number" : "");

function validate(f: Form) {
  const e: Record<string, string> = {};
  if (!f.firstName.trim()) e.firstName = "First name is required";
  if (!f.lastName.trim()) e.lastName = "Last name is required";
  if (!f.dateOfBirth) e.dateOfBirth = "Date of birth is required";
  else if (new Date(f.dateOfBirth) > new Date()) e.dateOfBirth = "Date of birth can't be in the future";
  if (!f.gender) e.gender = "Select a gender";
  const ph = validatePhone(f.phoneCountry, f.phone);
  if (ph) e.phone = ph;
  if (f.email && !EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address";
  const alt = optionalPhone(f.alternatePhone);
  if (alt) e.alternatePhone = alt;
  if (f.pincode && !/^\d{6}$/.test(f.pincode) && f.country === "India") e.pincode = "Enter a 6-digit pincode";
  const em = optionalPhone(f.emergencyPhone);
  if (em) e.emergencyPhone = em;
  const gp = optionalPhone(f.guardianPhone);
  if (gp) e.guardianPhone = gp;
  return e;
}

const fullName = (p: Patient) => p.name || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fGender, setFGender] = useState("all");
  const dq = useDebounced(q);
  const [shown, setShown] = useState<Set<number>>(new Set()); // tabs whose errors are visible

  const { data: patients, isLoading } = useQuery({
    queryKey: ["patients", dq],
    queryFn: () => patientsAPI.getAll(undefined, { q: dq || undefined, limit: "200" }),
  });

  const close = () => {
    setOpen(false);
    setEditId(null);
    setTab(0);
    setForm(emptyForm);
    setShown(new Set());
  };

  const createMutation = useMutation({
    mutationFn: (payload: Partial<Patient>) => (editId ? patientsAPI.update(editId, payload) : patientsAPI.create(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success(editId ? "Patient updated" : "Patient added");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to save patient"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => patientsAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete patient"),
  });

  const openEdit = (p: Patient) => {
    const ph = splitPhone(p.contact?.phone);
    const ms = p.medicalSummary ?? {};
    setForm({
      ...emptyForm,
      profileImage: p.profileImage ?? "",
      firstName: p.firstName,
      middleName: p.middleName ?? "",
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : "",
      gender: p.gender,
      bloodGroup: p.bloodGroup ?? "unknown",
      maritalStatus: p.maritalStatus ?? "undisclosed",
      patientStatus: p.patientStatus ?? "active",
      patientCode: p.patientId ?? "",
      phoneCountry: ph.country,
      phone: ph.local,
      alternatePhone: p.contact?.alternatePhone ?? "",
      email: p.contact?.email ?? "",
      street: p.address?.street ?? "",
      state: p.address?.state ?? "",
      city: p.address?.city ?? "",
      pincode: p.address?.pincode ?? "",
      country: p.address?.country ?? "India",
      emergencyName: p.emergencyContact?.name ?? "",
      emergencyRelationship: p.emergencyContact?.relationship ?? "",
      emergencyPhone: p.emergencyContact?.phone ?? "",
      guardianName: p.guardian?.name ?? "",
      guardianRelationship: p.guardian?.relationship ?? "",
      guardianPhone: p.guardian?.phone ?? "",
      allergies: ms.allergies ?? [],
      chronicConditions: ms.chronicConditions ?? [],
      pastMedicalHistory: ms.pastMedicalHistory ?? [],
      pastSurgicalHistory: ms.pastSurgicalHistory ?? [],
      familyMedicalHistory: ms.familyMedicalHistory ?? [],
      notes: ms.notes ?? "",
      medications: (ms.currentMedications ?? []).map((m) => ({ name: m.name ?? "", dosage: m.dosage ?? "", frequency: m.frequency ?? "" })),
    });
    setEditId(p._id);
    setTab(0);
    setOpen(true);
  };

  const errors = validate(form);
  const err = (k: string) => (shown.has(TAB_OF[k] ?? 2) ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const tabHasErrors = (t: number) => Object.keys(errors).some((k) => (TAB_OF[k] ?? 2) === t);

  const onNext = (from: number) => {
    setShown((s) => new Set(s).add(from));
    if (tabHasErrors(from)) {
      toast.error("Please fix the highlighted fields");
      return false;
    }
    return true;
  };

  const submit = () => {
    setShown(new Set([0, 1, 2]));
    const firstBad = [0, 1, 2].find(tabHasErrors);
    if (firstBad !== undefined) {
      setTab(firstBad);
      toast.error("Please fix the highlighted fields");
      return;
    }
    createMutation.mutate({
      profileImage: form.profileImage,
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
      lastName: form.lastName.trim(),
      dateOfBirth: form.dateOfBirth,
      gender: form.gender as PatientGender,
      bloodGroup: form.bloodGroup as Patient["bloodGroup"],
      maritalStatus: form.maritalStatus as Patient["maritalStatus"],
      patientStatus: form.patientStatus as Patient["patientStatus"],
      contact: {
        phone: composePhone(form.phoneCountry, form.phone),
        alternatePhone: form.alternatePhone.trim(),
        email: form.email.trim(),
      },
      address: {
        street: form.street.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        country: form.country.trim() || "India",
      },
      emergencyContact: {
        name: form.emergencyName.trim(),
        relationship: form.emergencyRelationship,
        phone: form.emergencyPhone.trim(),
      },
      guardian: {
        name: form.guardianName.trim(),
        relationship: form.guardianRelationship,
        phone: form.guardianPhone.trim(),
      },
      medicalSummary: {
        allergies: form.allergies,
        chronicConditions: form.chronicConditions,
        pastMedicalHistory: form.pastMedicalHistory,
        pastSurgicalHistory: form.pastSurgicalHistory,
        familyMedicalHistory: form.familyMedicalHistory,
        currentMedications: form.medications.filter((m) => m.name.trim()),
        notes: form.notes.trim(),
      },
    });
  };

  const text = (
    k: "firstName" | "middleName" | "lastName" | "dateOfBirth" | "alternatePhone" | "email" | "street" | "emergencyName" | "emergencyPhone" | "guardianName" | "guardianPhone",
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    required = false,
    className?: string,
  ) => (
    <Field label={label} required={required} error={err(k)} className={className}>
      <input className={inputCls} value={form[k]} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </Field>
  );

  const select = (
    k: "bloodGroup" | "maritalStatus" | "gender" | "patientStatus",
    label: string,
    options: readonly string[],
    placeholder?: string,
    required = false,
  ) => (
    <Field label={label} required={required} error={err(k)}>
      <select value={form[k]} onChange={(e) => set(k, e.target.value as never)} className={`${inputCls} capitalize`}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );

  const relationship = (k: "emergencyRelationship" | "guardianRelationship") => (
    <Field label="Relationship">
      <select value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputCls}>
        <option value="">Select relationship</option>
        {RELATIONSHIPS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </Field>
  );

  const heading = (title: string) => (
    <h4 className="col-span-2 border-b-2 border-black pb-1 pt-2 text-xs font-bold uppercase tracking-wider">{title}</h4>
  );

  const setMed = (i: number, patch: Partial<Med>) =>
    set("medications", form.medications.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const byCard = (patients ?? []).filter((p) =>
    cardKey === "active" ? p.patientStatus === "active"
    : cardKey === "archived" ? p.patientStatus === "archived"
    : cardKey === "new" ? !!p.createdAt && new Date(p.createdAt).getTime() >= monthStart
    : true,
  );

  const visible = byCard.filter((x) => (fStatus === "all" || x.patientStatus === fStatus) && (fGender === "all" || x.gender === fGender));

  return (
    <AppLayout title="Patients">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">Manage patient records for your organisation.</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add patient
        </Button>
      </div>

      <WizardModal
        open={open}
        onClose={close}
        title={editId ? "Edit Patient" : "Add Patient"}
        subtitle={[form.firstName, form.lastName].filter(Boolean).join(" ") || undefined}
        avatar={form.profileImage}
        avatarFallback={form.firstName}
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        onNext={onNext}
        onSubmit={submit}
        submitLabel={editId ? "Save Changes" : "Add Patient"}
        saving={createMutation.isPending}
      >
        {tab === 0 && (
          <div className="space-y-5">
            <PhotoField
              value={form.profileImage}
              initial={form.firstName}
              onChange={(v) => set("profileImage", v)}
              onError={(m) => toast.error(m)}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* row 1: name */}
              {text("firstName", "First Name", { placeholder: "e.g. Asha" }, true)}
              {text("middleName", "Middle Name")}
              {text("lastName", "Last Name", { placeholder: "e.g. Verma" }, true)}

              {/* row 2: DOB, gender, blood group */}
              {text("dateOfBirth", "Date of Birth", { type: "date", max: new Date().toISOString().slice(0, 10) }, true)}
              {select("gender", "Gender", GENDERS, "Select gender", true)}
              {select("bloodGroup", "Blood Group", BLOOD_GROUPS)}

              {/* row 3: marital status, mobile, alternate phone */}
              {select("maritalStatus", "Marital Status", MARITAL)}
              <Field label="Mobile Number" required error={err("phone")}>
                <PhoneInput
                  country={form.phoneCountry}
                  local={form.phone}
                  onChange={(c, l) => setForm((p) => ({ ...p, phoneCountry: c, phone: l }))}
                  invalid={!!err("phone")}
                />
              </Field>
              {text("alternatePhone", "Alternate Phone", { type: "tel", inputMode: "numeric", placeholder: "10-digit number" })}

              {/* row 4: email, record status, patient ID */}
              {text("email", "Email Address", { type: "email", placeholder: "patient@example.com" })}
              {select("patientStatus", "Patient Status", ["active", "inactive", "archived"])}
              <Field label="Patient ID">
                <input className={`${inputCls} bg-muted`} readOnly value={form.patientCode || "Auto-generated on save"} aria-readonly />
              </Field>
            </div>
          </div>
        )}

        {tab === 1 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Address")}
            {text("street", "Street / Area", { placeholder: "House no., street, locality" }, false, "col-span-2")}
            <LocationFields
              value={{ state: form.state, city: form.city, pincode: form.pincode, country: form.country }}
              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
              pincodeError={err("pincode")}
            />

            {heading("Emergency Contact")}
            {text("emergencyName", "Name")}
            {relationship("emergencyRelationship")}
            {text("emergencyPhone", "Phone", { type: "tel", inputMode: "numeric", placeholder: "10-digit number" })}

            {heading("Guardian (for minors)")}
            {text("guardianName", "Name")}
            {relationship("guardianRelationship")}
            {text("guardianPhone", "Phone", { type: "tel", inputMode: "numeric", placeholder: "10-digit number" })}
          </div>
        )}

        {tab === 2 && (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              Type to search the internet database or pick a suggestion — add as many entries as needed.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Allergies">
                <TagInput values={form.allergies} onChange={(v) => set("allergies", v)} presets={ALLERGIES} search={searchDrugs} placeholder="Add allergy…" />
              </Field>
              <Field label="Chronic Conditions">
                <TagInput values={form.chronicConditions} onChange={(v) => set("chronicConditions", v)} presets={CONDITIONS} search={searchConditions} placeholder="Add condition…" />
              </Field>
              <Field label="Past Medical History">
                <TagInput values={form.pastMedicalHistory} onChange={(v) => set("pastMedicalHistory", v)} presets={PAST_MEDICAL} search={searchConditions} placeholder="Add illness…" />
              </Field>
              <Field label="Past Surgical History">
                <TagInput values={form.pastSurgicalHistory} onChange={(v) => set("pastSurgicalHistory", v)} presets={SURGERIES} placeholder="Add surgery…" />
              </Field>
              <Field label="Family Medical History">
                <TagInput values={form.familyMedicalHistory} onChange={(v) => set("familyMedicalHistory", v)} presets={FAMILY_HISTORY} search={searchConditions} placeholder="Add history…" />
              </Field>
              <Field label="Notes">
                <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-black">Current Medications</span>
                <button
                  type="button"
                  onClick={() => set("medications", [...form.medications, { name: "", dosage: "", frequency: "" }])}
                  className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-xs font-bold hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add medication
                </button>
              </div>
              {form.medications.length === 0 && <p className="text-xs text-muted-foreground">No medications added.</p>}
              {form.medications.map((m, i) => (
                <div key={i} className="grid grid-cols-[1.4fr_1fr_1.2fr_auto] gap-2">
                  <Suggest value={m.name} onChange={(v) => setMed(i, { name: v })} presets={MEDICINES} search={searchDrugs} placeholder="Medicine" />
                  <Suggest value={m.dosage} onChange={(v) => setMed(i, { dosage: v })} presets={DOSAGES} placeholder="Dosage" />
                  <select className={inputCls} value={m.frequency} onChange={(e) => setMed(i, { frequency: e.target.value })}>
                    <option value="">Frequency</option>
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Remove medication"
                    onClick={() => set("medications", form.medications.filter((_, idx) => idx !== i))}
                    className="border-2 border-black px-3 hover:bg-gray-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </WizardModal>

      <SummaryBar
        cards={[
          { key: "all", label: "Total patients", value: stat(sm?.patients.total), icon: Users, filterable: true },
          { key: "active", label: "Active", value: stat(sm?.patients.active), icon: UserCheck, color: "#00C48C", filterable: true },
          { key: "new", label: "New this month", value: stat(sm?.patients.newThisMonth), icon: CalendarPlus, color: "#FA731C", filterable: true },
          { key: "archived", label: "Archived", value: stat(sm?.patients.archived), icon: Archive, color: "#6B7280", filterable: true },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="patients"
        exportLabel="Export (30 days)"
        shown={visible.length}
        total={cardKey === "all" ? sm?.patients.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by name, patient ID, phone or email…"
        filters={[
          { kind: "select", key: "status", label: "Status", value: fStatus, onChange: setFStatus, options: ["active", "inactive", "archived"].map((v) => ({ value: v, label: v })) },
          { kind: "select", key: "gender", label: "Gender", value: fGender, onChange: setFGender, options: ["male", "female", "other", "undisclosed"].map((v) => ({ value: v, label: v })) },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !patients?.length ? (
            <p className="p-6 text-center text-muted-foreground">No patients yet. Add your first one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Age / Gender</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Blood Group</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => {
                  const age = p.dateOfBirth
                    ? Math.max(0, Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 31_557_600_000))
                    : null;
                  return (
                    <TableRow key={p._id}>
                      <TableCell>{p.patientId || "—"}</TableCell>
                      <TableCell><PersonCell kind="patient" id={p._id} name={fullName(p)} src={p.profileImage || undefined} version={p.updatedAt} /></TableCell>
                      <TableCell className="capitalize">
                        {age !== null ? `${age} y` : "—"} · {p.gender || "—"}
                      </TableCell>
                      <TableCell>{p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString("en-GB") : "—"}</TableCell>
                      <TableCell>
                        {p.bloodGroup && p.bloodGroup !== "unknown" ? (
                          <span className="inline-flex items-center gap-1 font-medium text-red-600">
                            <Droplet className="h-4 w-4 fill-current" />
                            {p.bloodGroup}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{p.contact?.phone || "—"}</TableCell>
                      <TableCell>{p.contact?.email || "—"}</TableCell>
                      <TableCell><StatusBadge status={p.patientStatus} /></TableCell>
                      <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" aria-label={`Edit ${fullName(p)}`} onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Delete ${fullName(p)}`}
                          disabled={removeMutation.isPending}
                          onClick={() => window.confirm(`Delete ${fullName(p)}? This cannot be undone.`) && removeMutation.mutate(p._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
