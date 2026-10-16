import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, Pencil, Plus, Stethoscope, Trash2, UserCheck } from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { LocationFields } from "@/components/forms/LocationFields";
import { Suggest, TagInput } from "@/components/forms/Suggest";
import { Field, inputCls, PhotoField, WizardModal } from "@/components/forms/WizardModal";
import { Avatar, PersonCell } from "@/components/Avatar";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches, useDebounced } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { composePhone, DEFAULT_COUNTRY, PhoneInput, splitPhone, validatePhone } from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COUNCILS, DEGREES, INSTITUTIONS, LANGUAGES, SPECIALIZATIONS } from "@/lib/presets";
import { ApiError, doctorsAPI } from "@/services/api";
import type { Doctor } from "@/types";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const GENDERS = ["undisclosed", "male", "female", "other"] as const;
const TABS = ["Basic Info", "Professional", "Consultation"];

type Qual = { degree: string; institution: string; year: string };

const emptyForm = {
  profileImage: "",
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "undisclosed" as (typeof GENDERS)[number],
  dateOfBirth: "",
  phoneCountry: DEFAULT_COUNTRY,
  phone: "",
  email: "",
  street: "",
  state: "",
  city: "",
  pincode: "",
  country: "India",
  registrationNumber: "",
  registrationCouncil: "",
  qualifications: [{ degree: "", institution: "", year: "" }] as Qual[],
  specializations: [] as string[],
  experienceYears: "",
  languages: [] as string[],
  bio: "",
  consultationFee: "",
  followUpFee: "",
  appointmentDurationMinutes: "15",
  inPerson: true,
  video: false,
  acceptingAppointments: true,
  startTime: "10:00",
  endTime: "17:00",
  days: ["mon", "tue", "wed", "thu", "fri", "sat"] as string[],
  verificationStatus: "pending" as "pending" | "verified" | "rejected",
  accountStatus: "active" as "active" | "inactive" | "suspended",
};
type Form = typeof emptyForm;

const TAB_OF: Record<string, number> = {
  firstName: 0, lastName: 0, dateOfBirth: 0, phone: 0, email: 0, pincode: 0,
  registrationNumber: 1, registrationCouncil: 1, qualifications: 1, experienceYears: 1,
  consultationFee: 2, followUpFee: 2, appointmentDurationMinutes: 2, modes: 2, schedule: 2,
};

const num = (s: string) => (s === "" ? undefined : Number(s));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const specOf = (d: Doctor) => d.professionalDetails?.specializations?.join(", ") || "—";


function validate(f: Form) {
  const e: Record<string, string> = {};
  if (!f.firstName.trim()) e.firstName = "First name is required";
  if (!f.lastName.trim()) e.lastName = "Last name is required";
  if (f.dateOfBirth && new Date(f.dateOfBirth) > new Date()) e.dateOfBirth = "Date of birth can't be in the future";
  const ph = validatePhone(f.phoneCountry, f.phone);
  if (ph) e.phone = ph;
  if (!f.email.trim()) e.email = "Email is required";
  else if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address";
  if (f.pincode && f.country === "India" && !/^\d{6}$/.test(f.pincode)) e.pincode = "Enter a 6-digit pincode";
  if (!f.registrationNumber.trim()) e.registrationNumber = "Registration number is required";
  if (!f.registrationCouncil.trim()) e.registrationCouncil = "Registration council is required";
  const quals = f.qualifications.filter((q) => q.degree.trim() || q.institution.trim() || q.year.trim());
  if (quals.some((q) => !q.degree.trim())) e.qualifications = "Every qualification needs a degree";
  else if (quals.some((q) => q.year && !(Number(q.year) >= 1950 && Number(q.year) <= new Date().getFullYear()))) {
    e.qualifications = "Enter a valid year";
  }
  if (f.experienceYears && !(Number(f.experienceYears) >= 0 && Number(f.experienceYears) <= 70)) e.experienceYears = "Enter 0–70";
  if (f.consultationFee && Number(f.consultationFee) < 0) e.consultationFee = "Can't be negative";
  if (f.followUpFee && Number(f.followUpFee) < 0) e.followUpFee = "Can't be negative";
  const dur = Number(f.appointmentDurationMinutes);
  if (!(dur >= 5 && dur <= 240)) e.appointmentDurationMinutes = "Enter 5–240 minutes";
  if (!f.inPerson && !f.video) e.modes = "Select at least one consultation mode";
  if (f.days.length && f.startTime >= f.endTime) e.schedule = "End time must be after start time";
  return e;
}

export default function DoctorsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fVerify, setFVerify] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const dq = useDebounced(q);
  const [shown, setShown] = useState<Set<number>>(new Set());

  const { data: doctors, isLoading } = useQuery({
    queryKey: ["doctors", dq],
    queryFn: () => doctorsAPI.getAll(undefined, { q: dq || undefined, limit: "200" }),
  });

  const close = () => {
    setOpen(false);
    setEditId(null);
    setTab(0);
    setForm(emptyForm);
    setShown(new Set());
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editId ? doctorsAPI.update(editId, payload as Partial<Doctor>) : doctorsAPI.create(payload as Partial<Doctor>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      toast.success(editId ? "Doctor updated" : "Doctor added");
      close();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to save doctor"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => doctorsAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      toast.success("Doctor deleted");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not delete doctor"),
  });

  const openEdit = (d: Doctor) => {
    const ph = splitPhone(d.contact?.phone);
    const pd: Partial<NonNullable<Doctor["professionalDetails"]>> = d.professionalDetails ?? {};
    const c: Partial<NonNullable<Doctor["consultation"]>> = d.consultation ?? {};
    const first = d.availability?.[0];
    const quals = (pd.qualifications ?? []).map((q) => ({ degree: q.degree, institution: q.institution ?? "", year: q.year ? String(q.year) : "" }));
    setForm({
      ...emptyForm,
      firstName: d.firstName,
      middleName: d.middleName ?? "",
      lastName: d.lastName,
      gender: (d.gender ?? "undisclosed") as Form["gender"],
      dateOfBirth: d.dateOfBirth ? String(d.dateOfBirth).slice(0, 10) : "",
      phoneCountry: ph.country,
      phone: ph.local,
      email: d.contact?.email ?? "",
      registrationNumber: pd.registrationNumber ?? "",
      registrationCouncil: pd.registrationCouncil ?? "",
      qualifications: quals.length ? quals : emptyForm.qualifications,
      specializations: pd.specializations ?? [],
      experienceYears: pd.experienceYears ? String(pd.experienceYears) : "",
      languages: pd.languages ?? [],
      bio: pd.bio ?? "",
      consultationFee: c.consultationFee ? String(c.consultationFee) : "",
      followUpFee: c.followUpFee ? String(c.followUpFee) : "",
      appointmentDurationMinutes: String(c.appointmentDurationMinutes ?? 15),
      inPerson: c.consultationModes ? c.consultationModes.includes("in_person") : true,
      video: !!c.consultationModes?.includes("video"),
      acceptingAppointments: c.acceptingAppointments !== false,
      startTime: first?.startTime ?? emptyForm.startTime,
      endTime: first?.endTime ?? emptyForm.endTime,
      days: d.availability?.length ? d.availability.map((a) => a.day) : emptyForm.days,
      verificationStatus: d.verificationStatus ?? "pending",
      accountStatus: d.accountStatus,
    });
    setEditId(d._id);
    setTab(0);
    setOpen(true);
  };

  const errors = validate(form);
  const err = (k: string) => (shown.has(TAB_OF[k] ?? 0) ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const tabHasErrors = (t: number) => Object.keys(errors).some((k) => (TAB_OF[k] ?? 0) === t);

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
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || null,
      contact: { phone: composePhone(form.phoneCountry, form.phone), email: form.email.trim() },
      address: {
        street: form.street.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        country: form.country.trim() || "India",
      },
      professionalDetails: {
        registrationNumber: form.registrationNumber.trim(),
        registrationCouncil: form.registrationCouncil.trim(),
        qualifications: form.qualifications
          .filter((q) => q.degree.trim())
          .map((q) => ({ degree: q.degree.trim(), institution: q.institution.trim(), year: q.year ? Number(q.year) : null })),
        specializations: form.specializations,
        experienceYears: num(form.experienceYears) ?? 0,
        languages: form.languages,
        bio: form.bio.trim(),
      },
      consultation: {
        consultationFee: num(form.consultationFee) ?? 0,
        followUpFee: num(form.followUpFee) ?? 0,
        appointmentDurationMinutes: Number(form.appointmentDurationMinutes),
        consultationModes: [form.inPerson && "in_person", form.video && "video"].filter(Boolean),
        acceptingAppointments: form.acceptingAppointments,
      },
      availability: form.days.map((day) => ({ day, startTime: form.startTime, endTime: form.endTime })),
      verificationStatus: form.verificationStatus,
      accountStatus: form.accountStatus,
    });
  };

  const text = (
    k: "firstName" | "middleName" | "lastName" | "dateOfBirth" | "email" | "registrationNumber" | "experienceYears" | "consultationFee" | "followUpFee" | "appointmentDurationMinutes" | "startTime" | "endTime",
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    required = false,
    className?: string,
  ) => (
    <Field label={label} required={required} error={err(k)} className={className}>
      <input className={inputCls} value={form[k]} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </Field>
  );

  const heading = (title: string) => (
    <h4 className="col-span-2 border-b-2 border-black pb-1 pt-2 text-xs font-bold uppercase tracking-wider">{title}</h4>
  );

  const setQual = (i: number, patch: Partial<Qual>) =>
    set("qualifications", form.qualifications.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const byCard = (doctors ?? []).filter((d) =>
    cardKey === "active" ? d.accountStatus === "active"
    : cardKey === "verified" ? d.verificationStatus === "verified"
    : cardKey === "pending" ? (d.verificationStatus ?? "pending") === "pending"
    : true,
  );

  const visible = byCard.filter((x) => (fVerify === "all" || (x.verificationStatus ?? "pending") === fVerify) && (fStatus === "all" || x.accountStatus === fStatus));

  return (
    <AppLayout title="Doctors">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">Manage the doctors on your roster.</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add doctor
        </Button>
      </div>

      <WizardModal
        open={open}
        onClose={close}
        title={editId ? "Edit Doctor" : "Add Doctor"}
        subtitle={[form.firstName, form.lastName].filter(Boolean).join(" ") || undefined}
        avatar={form.profileImage}
        avatarFallback={form.firstName}
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        onNext={onNext}
        onSubmit={submit}
        submitLabel={editId ? "Save Changes" : "Add Doctor"}
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
            <div className="grid grid-cols-2 gap-4">
              {text("firstName", "First Name", { placeholder: "e.g. Rahul" }, true)}
              {text("middleName", "Middle Name")}
              {text("lastName", "Last Name", { placeholder: "e.g. Mehta" }, true)}
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => set("gender", e.target.value as Form["gender"])} className={`${inputCls} capitalize`}>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              {text("dateOfBirth", "Date of Birth", { type: "date", max: new Date().toISOString().slice(0, 10) })}
              <Field label="Mobile Number" required error={err("phone")}>
                <PhoneInput
                  country={form.phoneCountry}
                  local={form.phone}
                  onChange={(c, l) => setForm((p) => ({ ...p, phoneCountry: c, phone: l }))}
                  invalid={!!err("phone")}
                />
              </Field>
              {text("email", "Email Address", { type: "email", placeholder: "doctor@hospital.com" }, true, "col-span-2")}
              <Field label="Clinic / Residential Street" className="col-span-2">
                <input className={inputCls} value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="Building, street, locality" />
              </Field>
              <LocationFields
                value={{ state: form.state, city: form.city, pincode: form.pincode, country: form.country }}
                onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
                pincodeError={err("pincode")}
              />
            </div>
          </div>
        )}

        {tab === 1 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Registration")}
            {text("registrationNumber", "Medical Registration No.", { placeholder: "e.g. MH-12345" }, true)}
            <Field label="Registration Council" required error={err("registrationCouncil")}>
              <Suggest value={form.registrationCouncil} onChange={(v) => set("registrationCouncil", v)} presets={COUNCILS} placeholder="e.g. Maharashtra Medical Council" />
            </Field>

            {heading("Qualifications")}
            <div className="col-span-2 space-y-2">
              {form.qualifications.map((q, i) => (
                <div key={i} className="grid grid-cols-[1.2fr_1.6fr_0.7fr_auto] gap-2">
                  <Suggest placeholder="Degree (MBBS)" value={q.degree} presets={DEGREES} onChange={(v) => setQual(i, { degree: v })} />
                  <Suggest placeholder="Institution" value={q.institution} presets={INSTITUTIONS} onChange={(v) => setQual(i, { institution: v })} />
                  <input className={inputCls} placeholder="Year" inputMode="numeric" maxLength={4} value={q.year} onChange={(e) => setQual(i, { year: e.target.value.replace(/\D/g, "") })} />
                  <button
                    type="button"
                    aria-label="Remove qualification"
                    disabled={form.qualifications.length === 1}
                    onClick={() => set("qualifications", form.qualifications.filter((_, idx) => idx !== i))}
                    className="border-2 border-black px-3 hover:bg-gray-50 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {err("qualifications") && <p className="text-xs font-bold text-red-600">{err("qualifications")}</p>}
              <button
                type="button"
                onClick={() => set("qualifications", [...form.qualifications, { degree: "", institution: "", year: "" }])}
                className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-xs font-bold hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add qualification
              </button>
            </div>

            {heading("Practice")}
            <Field label="Specializations" className="col-span-2">
              <TagInput values={form.specializations} onChange={(v) => set("specializations", v)} presets={SPECIALIZATIONS} placeholder="Add specialization…" />
            </Field>
            {text("experienceYears", "Experience (years)", { type: "number", min: 0, max: 70 })}
            <Field label="Languages">
              <TagInput values={form.languages} onChange={(v) => set("languages", v)} presets={LANGUAGES} placeholder="Add language…" />
            </Field>
            <Field label="Bio" className="col-span-2">
              <textarea rows={3} value={form.bio} onChange={(e) => set("bio", e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}

        {tab === 2 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Fees & Slots")}
            {text("consultationFee", "Consultation Fee (₹)", { type: "number", min: 0 })}
            {text("followUpFee", "Follow-up Fee (₹)", { type: "number", min: 0 })}
            {text("appointmentDurationMinutes", "Appointment Duration (min)", { type: "number", min: 5, max: 240 })}

            <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.inPerson} onChange={(e) => set("inPerson", e.target.checked)} /> In-person
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.video} onChange={(e) => set("video", e.target.checked)} /> Video consultation
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.acceptingAppointments} onChange={(e) => set("acceptingAppointments", e.target.checked)} /> Accepting appointments
              </label>
              {err("modes") && <p className="w-full text-xs font-bold text-red-600">{err("modes")}</p>}
            </div>

            {heading("Weekly Schedule")}
            {text("startTime", "Works From", { type: "time" })}
            {text("endTime", "Works Until", { type: "time" })}
            <div className="col-span-2 flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = form.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("days", on ? form.days.filter((x) => x !== d) : [...form.days, d])}
                    className={`border-2 border-black px-3 py-1.5 text-xs font-bold uppercase ${on ? "bg-[#024BAB] text-white" : "bg-white text-black hover:bg-gray-50"}`}
                  >
                    {d}
                  </button>
                );
              })}
              {err("schedule") && <p className="w-full text-xs font-bold text-red-600">{err("schedule")}</p>}
            </div>

            {heading("Status")}
            <Field label="Verification">
              <select value={form.verificationStatus} onChange={(e) => set("verificationStatus", e.target.value as Form["verificationStatus"])} className={`${inputCls} capitalize`}>
                {["pending", "verified", "rejected"].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Account">
              <select value={form.accountStatus} onChange={(e) => set("accountStatus", e.target.value as Form["accountStatus"])} className={`${inputCls} capitalize`}>
                {["active", "inactive", "suspended"].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </WizardModal>

      <SummaryBar
        cards={[
          { key: "all", label: "Total doctors", value: stat(sm?.doctors.total), icon: Stethoscope, filterable: true },
          { key: "active", label: "Active", value: stat(sm?.doctors.active), icon: UserCheck, color: "#00C48C", filterable: true },
          { key: "verified", label: "Verified", value: stat(sm?.doctors.verified), icon: BadgeCheck, color: "#7C3AED", filterable: true },
          { key: "pending", label: "Pending verification", value: stat(sm?.doctors.pendingVerification), icon: Clock, color: "#FA731C", filterable: true },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="doctors"
        exportLabel="Performance report"
        shown={visible.length}
        total={cardKey === "all" ? sm?.doctors.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by name, doctor ID, specialization or registration no…"
        filters={[
          { kind: "select", key: "verify", label: "Verification", value: fVerify, onChange: setFVerify, options: ["verified", "pending", "rejected"].map((v) => ({ value: v, label: v })) },
          { kind: "select", key: "status", label: "Account", value: fStatus, onChange: setFStatus, options: ["active", "inactive", "suspended"].map((v) => ({ value: v, label: v })) },
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
          ) : !doctors?.length ? (
            <p className="p-6 text-center text-muted-foreground">No doctors yet. Add your first one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell>{d.doctorId || "—"}</TableCell>
                    <TableCell><PersonCell kind="doctor" id={d._id} name={d.name} src={d.profileImage || undefined} version={d.updatedAt} /></TableCell>
                    <TableCell>{specOf(d)}</TableCell>
                    <TableCell>{d.contact?.phone || "—"}</TableCell>
                    <TableCell>{d.consultation?.consultationFee ? `₹${d.consultation.consultationFee}` : "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.verificationStatus ?? "pending"} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.accountStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" aria-label={`Edit ${d.name}`} onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Delete ${d.name}`}
                          disabled={removeMutation.isPending}
                          onClick={() => window.confirm(`Delete ${d.name}? This cannot be undone.`) && removeMutation.mutate(d._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
