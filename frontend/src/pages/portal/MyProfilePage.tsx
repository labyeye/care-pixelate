import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Field, inputCls } from "@/components/forms/WizardModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, portalAPI } from "@/services/api";
import type { Patient } from "@/types";
import { fmtDate, Intro, useProfiles } from "./shared";

const BLOOD = ["unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const blank = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "male",
  bloodGroup: "unknown",
  phone: "",
  email: "",
  street: "",
  city: "",
  state: "",
  pincode: "",
  emergencyName: "",
  emergencyPhone: "",
  allergies: "",
  conditions: "",
};
type Form = typeof blank;

export default function MyProfilePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const profiles = useProfiles();
  const [editing, setEditing] = useState<Patient | "new" | null>(null);
  const [f, setF] = useState<Form>(blank);
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const open = (p: Patient | "new") => {
    setEditing(p);
    if (p === "new") return setF({ ...blank });
    setF({
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth?.slice(0, 10) ?? "",
      gender: p.gender,
      bloodGroup: p.bloodGroup ?? "unknown",
      phone: p.contact?.phone ?? "",
      email: p.contact?.email ?? "",
      street: p.address?.street ?? "",
      city: p.address?.city ?? "",
      state: p.address?.state ?? "",
      pincode: p.address?.pincode ?? "",
      emergencyName: p.emergencyContact?.name ?? "",
      emergencyPhone: p.emergencyContact?.phone ?? "",
      allergies: (p.medicalSummary?.allergies ?? []).join(", "),
      conditions: (p.medicalSummary?.chronicConditions ?? []).join(", "),
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const base = editing && editing !== "new" ? editing : null;
      const payload = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        dateOfBirth: f.dateOfBirth,
        gender: f.gender,
        bloodGroup: f.bloodGroup,
        contact: {
          ...base?.contact,
          phone: f.phone.trim(),
          email: f.email.trim(),
        },
        address: {
          ...base?.address,
          street: f.street.trim(),
          city: f.city.trim(),
          state: f.state.trim(),
          pincode: f.pincode.trim(),
        },
        emergencyContact: {
          ...base?.emergencyContact,
          name: f.emergencyName.trim(),
          phone: f.emergencyPhone.trim(),
        },
        medicalSummary: {
          ...base?.medicalSummary,
          allergies: list(f.allergies),
          chronicConditions: list(f.conditions),
        },
      };
      return base
        ? portalAPI.updateProfile(base._id, payload)
        : portalAPI.addProfile(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal"] });
      toast.success(
        editing === "new" ? "Family member added" : "Profile updated",
      );
      setEditing(null);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save"),
  });

  const valid =
    f.firstName.trim() &&
    f.lastName.trim() &&
    f.dateOfBirth &&
    f.phone.trim().length >= 10;

  const text = (
    k: keyof Form,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Field label={label}>
      <input
        {...props}
        className={inputCls}
        value={f[k]}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  return (
    <AppLayout title="My Profile">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Intro>
          Your details and your family's. Doctors see this when you book, so
          keep it up to date.
        </Intro>
        <Button onClick={() => open("new")}>
          <UserPlus className="h-4 w-4" /> Add family member
        </Button>
      </div>

      <div className="mb-4 border-2 border-black bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Login
        </p>
        <p className="font-bold">{user?.name}</p>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      {profiles.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(profiles.data ?? []).map((p, i) => (
            <div key={p._id} className="border-2 border-black bg-white">
              <div className="flex items-center justify-between border-b-2 border-black bg-[#F8FAFF] px-4 py-3">
                <div>
                  <p className="font-bold">
                    {p.name}{" "}
                    {i === 0 && (
                      <span className="ml-1 border border-black px-1 text-[10px] font-bold uppercase">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.patientId}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => open(p)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </div>
              <dl className="space-y-1 p-4 text-sm">
                {[
                  ["Date of birth", fmtDate(p.dateOfBirth)],
                  [
                    "Gender / Blood group",
                    `${p.gender} · ${p.bloodGroup && p.bloodGroup !== "unknown" ? p.bloodGroup : "—"}`,
                  ],
                  ["Phone", p.contact?.phone],
                  [
                    "Address",
                    [
                      p.address?.street,
                      p.address?.city,
                      p.address?.state,
                      p.address?.pincode,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  ],
                  [
                    "Emergency contact",
                    [p.emergencyContact?.name, p.emergencyContact?.phone]
                      .filter(Boolean)
                      .join(" · "),
                  ],
                  ["Allergies", (p.medicalSummary?.allergies ?? []).join(", ")],
                  [
                    "Conditions",
                    (p.medicalSummary?.chronicConditions ?? []).join(", "),
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-4 border-b border-black/10 py-1"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-semibold capitalize">
                      {v || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Add family member" : "Edit profile"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("firstName", "First name")}
            {text("lastName", "Last name")}
            {text("dateOfBirth", "Date of birth", {
              type: "date",
              max: new Date().toISOString().slice(0, 10),
            })}
            <Field label="Gender">
              <select
                className={inputCls}
                value={f.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                {["male", "female", "other", "undisclosed"].map((g) => (
                  <option key={g} value={g} className="capitalize">
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Blood group">
              <select
                className={inputCls}
                value={f.bloodGroup}
                onChange={(e) => set("bloodGroup", e.target.value)}
              >
                {BLOOD.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            {text("phone", "Phone", { type: "tel" })}
            {text("email", "Email", { type: "email" })}
            {text("street", "Street / area")}
            {text("city", "City")}
            {text("state", "State")}
            {text("pincode", "Pincode", { inputMode: "numeric", maxLength: 6 })}
            {text("emergencyName", "Emergency contact name")}
            {text("emergencyPhone", "Emergency contact phone", { type: "tel" })}
            <Field
              label="Allergies (comma separated)"
              className="sm:col-span-2"
            >
              <input
                className={inputCls}
                value={f.allergies}
                onChange={(e) => set("allergies", e.target.value)}
                placeholder="e.g. Penicillin, Peanuts"
              />
            </Field>
            <Field
              label="Chronic conditions (comma separated)"
              className="sm:col-span-2"
            >
              <input
                className={inputCls}
                value={f.conditions}
                onChange={(e) => set("conditions", e.target.value)}
                placeholder="e.g. Diabetes, Hypertension"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
