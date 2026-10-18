import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { LocationFields } from "@/components/forms/LocationFields";
import { Suggest, TagInput } from "@/components/forms/Suggest";
import {
  Field,
  inputCls,
  PhotoField,
  WizardModal,
} from "@/components/forms/WizardModal";
import { PersonCell } from "@/components/Avatar";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/RowActions";
import { Card, CardContent } from "@/components/ui/card";
import {
  composePhone,
  DEFAULT_COUNTRY,
  PhoneInput,
  splitPhone,
  validatePhone,
} from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  DEGREES,
  DEPARTMENTS,
  DESIGNATIONS,
  ID_TYPES,
  INSTITUTIONS,
  LANGUAGES,
  RELATIONSHIPS,
  STAFF_ROLES,
  STAFF_SKILLS,
} from "@/lib/presets";
import { ApiError, staffAPI } from "@/services/api";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const BLOOD_GROUPS = [
  "unknown",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
const MARITAL = [
  "undisclosed",
  "single",
  "married",
  "divorced",
  "widowed",
  "other",
] as const;
const GENDERS = ["undisclosed", "male", "female", "other"] as const;
const EMPLOYMENT = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "visiting", label: "Visiting" },
];
const SHIFTS = [
  "general",
  "morning",
  "evening",
  "night",
  "rotational",
] as const;
const TABS = ["Basic Info", "Role & Work", "Address", "ID & Bank", "Login"];

const label = (r: string) => r.replace(/_/g, " ");
type Qual = { degree: string; institution: string; year: string };

const emptyForm = {
  profileImage: "",
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "undisclosed" as (typeof GENDERS)[number],
  dateOfBirth: "",
  bloodGroup: "unknown",
  maritalStatus: "undisclosed",
  phoneCountry: DEFAULT_COUNTRY,
  phone: "",
  alternatePhone: "",
  email: "",
  role: "receptionist",
  designation: "",
  department: "",
  employmentType: "full_time",
  joiningDate: "",
  shift: "general" as (typeof SHIFTS)[number],
  workDays: ["mon", "tue", "wed", "thu", "fri", "sat"] as string[],
  workStart: "09:00",
  workEnd: "18:00",
  reportingTo: "",
  experienceYears: "",
  qualifications: [{ degree: "", institution: "", year: "" }] as Qual[],
  licenseNumber: "",
  licenseAuthority: "",
  licenseExpiry: "",
  skills: [] as string[],
  languages: [] as string[],
  street: "",
  state: "",
  city: "",
  pincode: "",
  country: "India",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  idType: "",
  idNumber: "",
  accountHolder: "",
  accountNumber: "",
  ifsc: "",
  bankName: "",
  upiId: "",
  notes: "",
  password: "",
  confirmPassword: "",
  status: "active" as "active" | "inactive",
};
type Form = typeof emptyForm;

const TAB_OF: Record<string, number> = {
  firstName: 0,
  lastName: 0,
  dateOfBirth: 0,
  phone: 0,
  alternatePhone: 0,
  email: 0,
  role: 1,
  joiningDate: 1,
  experienceYears: 1,
  workTime: 1,
  qualifications: 1,
  licenseExpiry: 1,
  pincode: 2,
  emergencyPhone: 2,
  idNumber: 3,
  accountNumber: 3,
  ifsc: 3,
  upiId: 3,
  password: 4,
  confirmPassword: 4,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RULES: Record<string, { re: RegExp; msg: string }> = {
  aadhaar: { re: /^\d{12}$/, msg: "Aadhaar must be 12 digits" },
  pan: { re: /^[A-Z]{5}\d{4}[A-Z]$/, msg: "PAN looks like ABCDE1234F" },
  passport: { re: /^[A-Z][0-9]{7}$/, msg: "Passport looks like A1234567" },
  driving_license: {
    re: /^[A-Z0-9 -]{8,20}$/,
    msg: "Enter a valid licence number",
  },
  voter_id: { re: /^[A-Z]{3}\d{7}$/, msg: "Voter ID looks like ABC1234567" },
};

function validate(f: Form, editing = false) {
  const e: Record<string, string> = {};
  if (!f.firstName.trim()) e.firstName = "First name is required";
  if (!f.lastName.trim()) e.lastName = "Last name is required";
  if (f.dateOfBirth && new Date(f.dateOfBirth) > new Date())
    e.dateOfBirth = "Date of birth can't be in the future";
  const ph = validatePhone(f.phoneCountry, f.phone);
  if (ph) e.phone = ph;
  if (f.alternatePhone && !/^\d{10}$/.test(f.alternatePhone.replace(/\D/g, "")))
    e.alternatePhone = "Enter a 10-digit number";
  if (!f.email.trim()) e.email = "Email is required — it is the login ID";
  else if (!EMAIL_RE.test(f.email.trim()))
    e.email = "Enter a valid email address";
  if (!f.role) e.role = "Select a role";
  if (
    f.experienceYears &&
    !(Number(f.experienceYears) >= 0 && Number(f.experienceYears) <= 60)
  )
    e.experienceYears = "Enter 0–60";
  if (f.workStart && f.workEnd && f.workStart >= f.workEnd)
    e.workTime = "End time must be after start time";
  const quals = f.qualifications.filter(
    (q) => q.degree.trim() || q.institution.trim() || q.year.trim(),
  );
  if (quals.some((q) => !q.degree.trim()))
    e.qualifications = "Every qualification needs a degree";
  else if (
    quals.some(
      (q) =>
        q.year &&
        !(Number(q.year) >= 1950 && Number(q.year) <= new Date().getFullYear()),
    )
  )
    e.qualifications = "Enter a valid year";
  if (f.pincode && f.country === "India" && !/^\d{6}$/.test(f.pincode))
    e.pincode = "Enter a 6-digit pincode";
  if (f.emergencyPhone && !/^\d{10}$/.test(f.emergencyPhone.replace(/\D/g, "")))
    e.emergencyPhone = "Enter a 10-digit number";
  if (f.idType) {
    const rule = ID_RULES[f.idType];
    if (!f.idNumber.trim()) e.idNumber = "Enter the ID number";
    else if (rule && !rule.re.test(f.idNumber.trim().toUpperCase()))
      e.idNumber = rule.msg;
  }
  if (f.accountNumber && !/^\d{9,18}$/.test(f.accountNumber))
    e.accountNumber = "Account number must be 9–18 digits";
  if (f.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.toUpperCase()))
    e.ifsc = "IFSC looks like SBIN0001234";
  if (f.upiId && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(f.upiId))
    e.upiId = "UPI ID looks like name@bank";
  if (!editing && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(f.password))
    e.password = "8+ characters with uppercase, lowercase and a number";
  if (!editing && f.confirmPassword !== f.password)
    e.confirmPassword = "Passwords do not match";
  return e;
}

export default function StaffPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [shown, setShown] = useState<Set<number>>(new Set());

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: staffAPI.getAll,
  });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Request failed");

  const close = () => {
    setOpen(false);
    setEditId(null);
    setTab(0);
    setForm(emptyForm);
    setShown(new Set());
  };

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editId ? staffAPI.update(editId, payload) : staffAPI.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success(editId ? "Staff member updated" : "Staff member added");
      close();
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => staffAPI.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff member deleted");
    },
    onError,
  });

  // The list rows are slim on purpose (no bank/ID), so fetch the full profile to edit.
  const openEdit = async (row: { _id: string }) => {
    try {
      const full = (await staffAPI.getOne(row._id)) as Record<string, any>;
      const p = full.profile;
      if (!p) {
        toast.error("This account has no staff profile to edit");
        return;
      }
      const ph = splitPhone(p.contact?.phone);
      const e = p.employment ?? {};
      const pr = p.professional ?? {};
      const quals = (pr.qualifications ?? []).map((q: any) => ({
        degree: q.degree,
        institution: q.institution ?? "",
        year: q.year ? String(q.year) : "",
      }));
      setForm({
        ...emptyForm,
        profileImage: p.profileImage ?? "",
        firstName: p.firstName,
        middleName: p.middleName ?? "",
        lastName: p.lastName,
        gender: p.gender ?? "undisclosed",
        dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : "",
        bloodGroup: p.bloodGroup ?? "unknown",
        maritalStatus: p.maritalStatus ?? "undisclosed",
        phoneCountry: ph.country,
        phone: ph.local,
        alternatePhone: p.contact?.alternatePhone ?? "",
        email: full.email as string,
        role: full.role as string,
        designation: e.designation ?? "",
        department: e.department ?? "",
        employmentType: e.employmentType ?? "full_time",
        joiningDate: e.joiningDate ? String(e.joiningDate).slice(0, 10) : "",
        shift: e.shift ?? "general",
        workDays: e.workDays ?? emptyForm.workDays,
        workStart: e.workStart || emptyForm.workStart,
        workEnd: e.workEnd || emptyForm.workEnd,
        reportingTo: e.reportingTo ? String(e.reportingTo) : "",
        experienceYears: e.experienceYears ? String(e.experienceYears) : "",
        qualifications: quals.length ? quals : emptyForm.qualifications,
        licenseNumber: pr.licenseNumber ?? "",
        licenseAuthority: pr.licenseAuthority ?? "",
        licenseExpiry: pr.licenseExpiry
          ? String(pr.licenseExpiry).slice(0, 10)
          : "",
        skills: pr.skills ?? [],
        languages: pr.languages ?? [],
        street: p.address?.street ?? "",
        state: p.address?.state ?? "",
        city: p.address?.city ?? "",
        pincode: p.address?.pincode ?? "",
        country: p.address?.country ?? "India",
        emergencyName: p.emergencyContact?.name ?? "",
        emergencyRelationship: p.emergencyContact?.relationship ?? "",
        emergencyPhone: p.emergencyContact?.phone ?? "",
        idType: p.identity?.idType ?? "",
        idNumber: p.identity?.idNumber ?? "",
        accountHolder: p.bank?.accountHolder ?? "",
        accountNumber: p.bank?.accountNumber ?? "",
        ifsc: p.bank?.ifsc ?? "",
        bankName: p.bank?.bankName ?? "",
        upiId: p.bank?.upiId ?? "",
        notes: p.notes ?? "",
        status: full.status as "active" | "inactive",
      });
      setEditId(row._id);
      setTab(0);
      setOpen(true);
    } catch (err) {
      onError(err);
    }
  };

  const update = useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      role?: string;
      status?: "active" | "inactive";
    }) => staffAPI.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
    onError,
  });

  const errors = validate(form, !!editId);
  const err = (k: string) =>
    shown.has(TAB_OF[k] ?? 1) ? errors[k] : undefined;
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  const tabHasErrors = (t: number) =>
    Object.keys(errors).some((k) => (TAB_OF[k] ?? 1) === t);

  const onNext = (from: number) => {
    setShown((s) => new Set(s).add(from));
    if (tabHasErrors(from)) {
      toast.error("Please fix the highlighted fields");
      return false;
    }
    return true;
  };

  const submit = () => {
    const all = TABS.map((_, i) => i);
    setShown(new Set(all));
    const bad = all.find(tabHasErrors);
    if (bad !== undefined) {
      setTab(bad);
      toast.error("Please fix the highlighted fields");
      return;
    }
    const orNull = (s: string) => (s ? s : null);
    create.mutate({
      profileImage: form.profileImage,
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
      lastName: form.lastName.trim(),
      gender: form.gender,
      dateOfBirth: orNull(form.dateOfBirth),
      bloodGroup: form.bloodGroup,
      maritalStatus: form.maritalStatus,
      contact: {
        phone: composePhone(form.phoneCountry, form.phone),
        alternatePhone: form.alternatePhone.trim(),
        email: form.email.trim(),
      },
      email: form.email.trim(),
      role: form.role,
      employment: {
        designation: form.designation.trim(),
        department: form.department.trim(),
        employmentType: form.employmentType,
        joiningDate: orNull(form.joiningDate),
        shift: form.shift,
        workDays: form.workDays,
        workStart: form.workStart,
        workEnd: form.workEnd,
        reportingTo: orNull(form.reportingTo),
        experienceYears: Number(form.experienceYears) || 0,
      },
      professional: {
        qualifications: form.qualifications
          .filter((q) => q.degree.trim())
          .map((q) => ({
            degree: q.degree.trim(),
            institution: q.institution.trim(),
            year: q.year ? Number(q.year) : null,
          })),
        licenseNumber: form.licenseNumber.trim(),
        licenseAuthority: form.licenseAuthority.trim(),
        licenseExpiry: orNull(form.licenseExpiry),
        skills: form.skills,
        languages: form.languages,
      },
      address: {
        street: form.street.trim(),
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        country: form.country || "India",
      },
      emergencyContact: {
        name: form.emergencyName.trim(),
        relationship: form.emergencyRelationship,
        phone: form.emergencyPhone.trim(),
      },
      identity: {
        idType: form.idType,
        idNumber: form.idNumber.trim().toUpperCase(),
      },
      bank: {
        accountHolder: form.accountHolder.trim(),
        accountNumber: form.accountNumber.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
        bankName: form.bankName.trim(),
        upiId: form.upiId.trim(),
      },
      notes: form.notes.trim(),
      password: form.password,
      status: form.status,
    });
  };

  type TextKey =
    | "firstName"
    | "middleName"
    | "lastName"
    | "dateOfBirth"
    | "alternatePhone"
    | "email"
    | "designation"
    | "joiningDate"
    | "experienceYears"
    | "workStart"
    | "workEnd"
    | "licenseNumber"
    | "licenseAuthority"
    | "licenseExpiry"
    | "street"
    | "emergencyName"
    | "emergencyPhone"
    | "idNumber"
    | "accountHolder"
    | "accountNumber"
    | "ifsc"
    | "bankName"
    | "upiId"
    | "password"
    | "confirmPassword";

  const text = (
    k: TextKey,
    lbl: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    required = false,
    className?: string,
  ) => (
    <Field label={lbl} required={required} error={err(k)} className={className}>
      <input
        className={inputCls}
        value={form[k]}
        onChange={(e) => set(k, e.target.value as never)}
        {...props}
      />
    </Field>
  );

  const select = (
    k: "gender" | "bloodGroup" | "maritalStatus" | "shift" | "idType",
    lbl: string,
    options: readonly string[],
    placeholder?: string,
  ) => (
    <Field label={lbl} error={err(k)}>
      <select
        value={form[k]}
        onChange={(e) => set(k, e.target.value as never)}
        className={`${inputCls} capitalize`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </Field>
  );

  const heading = (title: string) => (
    <h4 className="col-span-2 border-b-2 border-black pb-1 pt-2 text-xs font-bold uppercase tracking-wider">
      {title}
    </h4>
  );

  const setQual = (i: number, patch: Partial<Qual>) =>
    set(
      "qualifications",
      form.qualifications.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    );

  const roleHint = STAFF_ROLES.find((r) => r.value === form.role)?.hint;

  const byCard = (staff ?? []).filter((u) =>
    cardKey === "active"
      ? u.status === "active"
      : cardKey === "inactive"
        ? u.status === "inactive"
        : cardKey === "doctors"
          ? u.role === "doctor"
          : true,
  );

  const visible = byCard.filter(
    (x) =>
      (fRole === "all" || x.role === fRole) &&
      (fStatus === "all" || x.status === fStatus) &&
      matches(
        q,
        x.name,
        x.email,
        x.staffId,
        x.role,
        x.designation,
        x.department,
        x.phone,
      ),
  );

  return (
    <AppLayout title="Staff">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">
          Add your team and control what each role can do.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add staff
        </Button>
      </div>

      <WizardModal
        open={open}
        onClose={close}
        title={editId ? "Edit Staff Member" : "Add Staff Member"}
        subtitle={
          [form.firstName, form.lastName].filter(Boolean).join(" ") || undefined
        }
        avatar={form.profileImage}
        avatarFallback={form.firstName}
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        onNext={onNext}
        onSubmit={submit}
        submitLabel={editId ? "Save Changes" : "Add Staff"}
        saving={create.isPending}
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
              {text(
                "firstName",
                "First Name",
                { placeholder: "e.g. Priya" },
                true,
              )}
              {text("middleName", "Middle Name")}
              {text(
                "lastName",
                "Last Name",
                { placeholder: "e.g. Sharma" },
                true,
              )}
              {select("gender", "Gender", GENDERS)}
              {text("dateOfBirth", "Date of Birth", {
                type: "date",
                max: new Date().toISOString().slice(0, 10),
              })}
              {select("bloodGroup", "Blood Group", BLOOD_GROUPS)}
              {select("maritalStatus", "Marital Status", MARITAL)}
              <div className="hidden sm:block" />
              <Field label="Mobile Number" required error={err("phone")}>
                <PhoneInput
                  country={form.phoneCountry}
                  local={form.phone}
                  onChange={(c, l) =>
                    setForm((p) => ({ ...p, phoneCountry: c, phone: l }))
                  }
                  invalid={!!err("phone")}
                />
              </Field>
              {text("alternatePhone", "Alternate Phone", {
                type: "tel",
                inputMode: "numeric",
                placeholder: "10-digit number",
              })}
              {text(
                "email",
                "Email (login ID)",
                { type: "email", placeholder: "name@hospital.com" },
                true,
                "col-span-2",
              )}
            </div>
          </div>
        )}

        {tab === 1 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Role & Access")}
            <div className="col-span-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STAFF_ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set("role", r.value)}
                    className={cn(
                      "border-2 border-black px-2 py-2 text-xs font-bold",
                      form.role === r.value
                        ? "bg-[#024BAB] text-white"
                        : "bg-white text-black hover:bg-gray-50",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{roleHint}</p>
              {err("role") && (
                <p className="text-xs font-bold text-red-600">{err("role")}</p>
              )}
            </div>

            {heading("Employment")}
            <Field label="Designation">
              <Suggest
                value={form.designation}
                onChange={(v) => set("designation", v)}
                presets={DESIGNATIONS}
                placeholder="e.g. Staff Nurse"
              />
            </Field>
            <Field label="Department">
              <Suggest
                value={form.department}
                onChange={(v) => set("department", v)}
                presets={DEPARTMENTS}
                placeholder="e.g. OPD"
              />
            </Field>
            <Field label="Employment Type">
              <select
                value={form.employmentType}
                onChange={(e) => set("employmentType", e.target.value)}
                className={inputCls}
              >
                {EMPLOYMENT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {text("joiningDate", "Joining Date", { type: "date" })}
            <Field label="Reports To">
              <select
                value={form.reportingTo}
                onChange={(e) => set("reportingTo", e.target.value)}
                className={`${inputCls} capitalize`}
              >
                <option value="">— None —</option>
                {staff
                  ?.filter((u) => u.status === "active")
                  .map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({label(u.role)})
                    </option>
                  ))}
              </select>
            </Field>
            {text("experienceYears", "Experience (years)", {
              type: "number",
              min: 0,
              max: 60,
            })}

            {heading("Shift & Working Days")}
            {select("shift", "Shift", SHIFTS)}
            <div className="grid grid-cols-2 gap-3">
              {text("workStart", "From", { type: "time" })}
              {text("workEnd", "Until", { type: "time" })}
            </div>
            <div className="col-span-2 flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = form.workDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      set(
                        "workDays",
                        on
                          ? form.workDays.filter((x) => x !== d)
                          : [...form.workDays, d],
                      )
                    }
                    className={`border-2 border-black px-3 py-1.5 text-xs font-bold uppercase ${on ? "bg-[#024BAB] text-white" : "bg-white text-black hover:bg-gray-50"}`}
                  >
                    {d}
                  </button>
                );
              })}
              {err("workTime") && (
                <p className="w-full text-xs font-bold text-red-600">
                  {err("workTime")}
                </p>
              )}
            </div>

            {heading("Qualifications")}
            <div className="col-span-2 space-y-2">
              {form.qualifications.map((q, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1.2fr_1.6fr_0.7fr_auto] gap-2"
                >
                  <Suggest
                    placeholder="Degree / diploma"
                    value={q.degree}
                    presets={DEGREES}
                    onChange={(v) => setQual(i, { degree: v })}
                  />
                  <Suggest
                    placeholder="Institution"
                    value={q.institution}
                    presets={INSTITUTIONS}
                    onChange={(v) => setQual(i, { institution: v })}
                  />
                  <input
                    className={inputCls}
                    placeholder="Year"
                    inputMode="numeric"
                    maxLength={4}
                    value={q.year}
                    onChange={(e) =>
                      setQual(i, { year: e.target.value.replace(/\D/g, "") })
                    }
                  />
                  <button
                    type="button"
                    aria-label="Remove qualification"
                    disabled={form.qualifications.length === 1}
                    onClick={() =>
                      set(
                        "qualifications",
                        form.qualifications.filter((_, idx) => idx !== i),
                      )
                    }
                    className="border-2 border-black px-3 hover:bg-gray-50 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {err("qualifications") && (
                <p className="text-xs font-bold text-red-600">
                  {err("qualifications")}
                </p>
              )}
              <button
                type="button"
                onClick={() =>
                  set("qualifications", [
                    ...form.qualifications,
                    { degree: "", institution: "", year: "" },
                  ])
                }
                className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-xs font-bold hover:bg-gray-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add qualification
              </button>
            </div>

            {heading("Licence / Registration (nurses, pharmacists, lab)")}
            {text("licenseNumber", "Licence / Registration No.")}
            {text("licenseAuthority", "Issuing Authority", {
              placeholder: "e.g. State Nursing Council",
            })}
            {text("licenseExpiry", "Licence Expiry", { type: "date" })}
            <div className="hidden sm:block" />

            {heading("Skills & Languages")}
            <Field label="Skills" className="col-span-2">
              <TagInput
                values={form.skills}
                onChange={(v) => set("skills", v)}
                presets={STAFF_SKILLS}
                placeholder="Add skill…"
              />
            </Field>
            <Field label="Languages" className="col-span-2">
              <TagInput
                values={form.languages}
                onChange={(v) => set("languages", v)}
                presets={LANGUAGES}
                placeholder="Add language…"
              />
            </Field>
          </div>
        )}

        {tab === 2 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Address")}
            {text(
              "street",
              "Street / Area",
              { placeholder: "House no., street, locality" },
              false,
              "col-span-2",
            )}
            <LocationFields
              value={{
                state: form.state,
                city: form.city,
                pincode: form.pincode,
                country: form.country,
              }}
              onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
              pincodeError={err("pincode")}
            />
            {heading("Emergency Contact")}
            {text("emergencyName", "Name")}
            <Field label="Relationship">
              <select
                value={form.emergencyRelationship}
                onChange={(e) => set("emergencyRelationship", e.target.value)}
                className={inputCls}
              >
                <option value="">Select relationship</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            {text("emergencyPhone", "Phone", {
              type: "tel",
              inputMode: "numeric",
              placeholder: "10-digit number",
            })}
          </div>
        )}

        {tab === 3 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Identity Proof")}
            <Field label="ID Type">
              <select
                value={form.idType}
                onChange={(e) => set("idType", e.target.value)}
                className={inputCls}
              >
                <option value="">— None —</option>
                {ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            {text("idNumber", "ID Number", {
              disabled: !form.idType,
              placeholder: form.idType
                ? "Enter ID number"
                : "Select an ID type",
            })}

            {heading("Bank Details (for payroll)")}
            {text("accountHolder", "Account Holder Name")}
            {text("bankName", "Bank Name")}
            {text("accountNumber", "Account Number", { inputMode: "numeric" })}
            {text("ifsc", "IFSC Code", {
              placeholder: "SBIN0001234",
              maxLength: 11,
            })}
            {text(
              "upiId",
              "UPI ID",
              { placeholder: "name@bank" },
              false,
              "col-span-2",
            )}

            {heading("Notes")}
            <Field label="Internal notes" className="col-span-2">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        )}

        {tab === 4 && (
          <div className="grid grid-cols-2 gap-4">
            {heading("Sign-in")}
            <Field label="Login Email" className="col-span-2">
              <input
                className={`${inputCls} bg-muted`}
                value={form.email}
                readOnly
              />
            </Field>
            {!editId &&
              text(
                "password",
                "Temporary Password",
                {
                  type: "password",
                  autoComplete: "new-password",
                  placeholder: "Min. 8 chars, Aa + number",
                },
                true,
              )}
            {!editId &&
              text(
                "confirmPassword",
                "Confirm Password",
                { type: "password", autoComplete: "new-password" },
                true,
              )}
            <Field label="Account Status">
              <select
                value={form.status}
                onChange={(e) =>
                  set("status", e.target.value as Form["status"])
                }
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <p className="col-span-2 text-xs text-muted-foreground">
              The staff member signs in with the login email and this password,
              then gets the access of the role you selected.
            </p>
          </div>
        )}
      </WizardModal>

      <SummaryBar
        cards={[
          {
            key: "all",
            label: "Team members",
            value: stat(sm?.staff.total),
            icon: Users,
            filterable: true,
          },
          {
            key: "active",
            label: "Active",
            value: stat(sm?.staff.active),
            icon: UserCheck,
            color: "#00C48C",
            filterable: true,
          },
          {
            key: "inactive",
            label: "Inactive",
            value: stat(sm?.staff.inactive),
            icon: UserX,
            color: "#DC2626",
            filterable: true,
          },
          {
            key: "doctors",
            label: "Doctors",
            value: stat(sm?.staff.doctors),
            icon: Stethoscope,
            color: "#7C3AED",
            filterable: true,
          },
        ]}
        active={cardKey}
        onPick={setCardKey}
        shown={visible.length}
        total={cardKey === "all" ? sm?.staff.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by name, email, staff ID, designation or department…"
        filters={[
          {
            kind: "select",
            key: "role",
            label: "Role",
            value: fRole,
            onChange: setFRole,
            options: STAFF_ROLES.map((r) => ({
              value: r.value,
              label: r.label,
            })),
          },
          {
            kind: "select",
            key: "status",
            label: "Status",
            value: fStatus,
            onChange: setFStatus,
            options: ["active", "inactive"].map((v) => ({
              value: v,
              label: v,
            })),
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Designation / Dept</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((u) => {
                  const assignable = STAFF_ROLES.some(
                    (r) => r.value === u.role,
                  );
                  return (
                    <TableRow key={u._id}>
                      <TableCell>{u.staffId || "—"}</TableCell>
                      <TableCell>
                        <PersonCell
                          kind="staff"
                          id={u.hasPhoto ? u._id : undefined}
                          name={u.name}
                          version={u.photoV}
                        />
                      </TableCell>
                      <TableCell className="capitalize">
                        {assignable ? (
                          <select
                            aria-label={`Role for ${u.name}`}
                            value={u.role}
                            onChange={(e) =>
                              update.mutate({ id: u._id, role: e.target.value })
                            }
                            className="nb-input h-8 px-2 text-xs capitalize"
                          >
                            {STAFF_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          label(u.role)
                        )}
                      </TableCell>
                      <TableCell>
                        {[u.designation, u.department]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone || "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell>
                        {assignable && (
                          <div className="flex justify-end gap-2">
                            {u.hasProfile && (
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={`Edit ${u.name}`}
                                onClick={() => openEdit(u)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <ActionButton
                              label={
                                u.status === "active"
                                  ? `Deactivate ${u.name}`
                                  : `Activate ${u.name}`
                              }
                              icon={u.status === "active" ? UserX : UserCheck}
                              onClick={() =>
                                update.mutate({
                                  id: u._id,
                                  status:
                                    u.status === "active"
                                      ? "inactive"
                                      : "active",
                                })
                              }
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Delete ${u.name}`}
                              disabled={removeMutation.isPending}
                              onClick={() =>
                                window.confirm(
                                  `Delete ${u.name}? Their login is removed permanently. To only block access, deactivate instead.`,
                                ) && removeMutation.mutate(u._id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
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
