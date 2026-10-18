import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Copy,
  CreditCard,
  MessageCircle,
  FileText,
  Globe,
  Landmark,
  LayoutTemplate,
  Loader2,
  ClipboardPlus,
  Lock,
  Palette,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { RolePermissions } from "@/components/RolePermissions";
import { WhatsAppSettings } from "@/components/WhatsAppSettings";
import { SecuritySettings } from "@/components/SecuritySettings";
import InvoiceDesigner from "@/components/settings/invoice-designer/InvoiceDesigner";
import { StatusBadge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, paymentsAPI, tenantAPI } from "@/services/api";
import { cn } from "@/lib/utils";

// ---- tabs (same shell as NestHR Settings: grouped list on the left, panel on the right) ----------
const TABS = [
  {
    group: "Organisation",
    items: [
      { id: "general", label: "General Info", icon: Building2 },
      { id: "bank", label: "Bank Details", icon: Landmark },
      { id: "invoice", label: "Invoice & Printing", icon: FileText },
      { id: "invoice-design", label: "Invoice Designer", icon: LayoutTemplate },
      {
        id: "consultation-design",
        label: "Consultation Designer",
        icon: ClipboardPlus,
      },
    ],
  },
  {
    group: "Appearance",
    items: [
      { id: "branding", label: "Branding", icon: Palette },
      { id: "regional", label: "Regional", icon: Globe },
    ],
  },
  {
    group: "Integrations",
    items: [
      { id: "payments", label: "Online Payments", icon: CreditCard },
      { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
      { id: "ai", label: "AI Scribe", icon: Sparkles },
    ],
  },
  {
    group: "Access",
    items: [
      { id: "permissions", label: "Role Permissions", icon: ShieldCheck },
    ],
  },
  {
    group: "Account",
    items: [
      { id: "profile", label: "My Profile", icon: UserCircle },
      { id: "security", label: "Security", icon: Lock },
    ],
  },
];
// full-width tabs that save themselves
const DESIGN_TABS = ["invoice-design", "consultation-design"];
// tabs that are saved with the footer button (the others save themselves)
const FORM_TABS = ["general", "bank", "invoice", "branding", "regional"];

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Europe/London",
  "America/New_York",
  "Australia/Sydney",
  "UTC",
];
const CURRENCIES = [
  "INR",
  "USD",
  "AED",
  "GBP",
  "EUR",
  "SGD",
  "AUD",
  "NPR",
  "BDT",
  "LKR",
];
const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["ml", "Malayalam"],
  ["bn", "Bengali"],
  ["pa", "Punjabi"],
];

type Form = ReturnType<typeof formFrom>;
const formFrom = (t: NonNullable<ReturnType<typeof useAuth>["tenant"]>) => ({
  name: t.name || "",
  slug: t.slug || "",
  legalName: t.gstDetails?.legalName || "",
  email: t.contact?.email || "",
  phone: t.contact?.phone || "",
  website: t.contact?.website || "",
  gstin: t.gstDetails?.gstin || "",
  pan: t.gstDetails?.pan || "",
  address: t.contact?.address || "",
  city: t.contact?.city || "",
  state: t.contact?.state || "",
  pincode: t.contact?.pincode || "",
  bankHolder: t.bank?.accountHolder || "",
  bankName: t.bank?.bankName || "",
  bankBranch: t.bank?.branch || "",
  bankAccount: t.bank?.accountNumber || "",
  bankIfsc: t.bank?.ifsc || "",
  bankType: t.bank?.accountType || "current",
  upiId: t.bank?.upiId || "",
  terms: t.invoiceSettings?.terms || "",
  footerNote: t.invoiceSettings?.footerNote || "",
  signatoryName: t.invoiceSettings?.signatoryName || "",
  signatoryTitle: t.invoiceSettings?.signatoryTitle || "",
  showBank: t.invoiceSettings?.showBank !== false,
  appName: t.branding?.appName || "",
  primaryColor: t.branding?.primaryColor || "#024BAB",
  secondaryColor: t.branding?.secondaryColor || "#FA731C",
  logoUrl: t.branding?.logoUrl || "",
  timezone: t.contact?.timezone || "Asia/Kolkata",
  currency: t.contact?.currency || "INR",
  language: t.contact?.language || "en",
});

// ---- HRMS-style fields ----------------------------------------------------------------------------
const inputCls =
  "w-full border-2 border-black bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#024BAB]";
const labelCls = "block text-xs font-bold uppercase tracking-wider text-black";

function InputField({
  label,
  value,
  onChange,
  required,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        {...rest}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>
      <textarea
        {...rest}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, "resize-none")}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

// Downscale a logo to <= 360px on the long side so it stays a small data URL (stored on the tenant, printed on invoices).
async function logoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = c.toDataURL("image/png");
  return png.length <= 300_000 ? png : c.toDataURL("image/jpeg", 0.85);
}

export default function SettingsPage() {
  const { tenant, user, refreshSession } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [form, setForm] = useState<Form | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenant) setForm(formFrom(tenant));
  }, [tenant]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const dirty = useMemo(
    () =>
      !!tenant &&
      !!form &&
      JSON.stringify(form) !== JSON.stringify(formFrom(tenant)),
    [tenant, form],
  );

  const scribeOn = !!tenant?.activeModules?.includes("ai_scribe");
  const moduleMutation = useMutation({
    mutationFn: (on: boolean) => {
      const rest = (tenant?.activeModules ?? []).filter(
        (m) => m !== "ai_scribe",
      );
      return tenantAPI.updateTenant({
        activeModules: on ? [...rest, "ai_scribe"] : rest,
      });
    },
    onSuccess: async () => {
      await refreshSession();
      toast.success("Updated");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to update"),
  });

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      return tenantAPI.updateTenant({
        name: f.name,
        ...(f.slug && f.slug !== tenant?.slug ? { slug: f.slug } : {}),
        branding: {
          appName: f.appName,
          primaryColor: f.primaryColor,
          secondaryColor: f.secondaryColor,
          logoUrl: f.logoUrl,
        },
        contact: {
          email: f.email,
          phone: f.phone,
          website: f.website,
          address: f.address,
          city: f.city,
          state: f.state,
          pincode: f.pincode,
          timezone: f.timezone,
          currency: f.currency,
          language: f.language,
        },
        gstDetails: { gstin: f.gstin, pan: f.pan, legalName: f.legalName },
        bank: {
          accountHolder: f.bankHolder,
          bankName: f.bankName,
          branch: f.bankBranch,
          accountNumber: f.bankAccount,
          ifsc: f.bankIfsc,
          accountType: f.bankType,
          upiId: f.upiId,
        },
        invoiceSettings: {
          terms: f.terms,
          footerNote: f.footerNote,
          signatoryName: f.signatoryName,
          signatoryTitle: f.signatoryTitle,
          showBank: f.showBank,
        },
      } as never);
    },
    onSuccess: async () => {
      await refreshSession();
      toast.success("Settings saved");
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Failed to save settings",
      ),
  });

  const handleSave = () => {
    if (
      form &&
      tenant &&
      form.slug !== tenant.slug &&
      !window.confirm(
        "Changing the clinic code means patients must use the new code to join. Continue?",
      )
    )
      return;
    save.mutate();
  };

  const onLogo = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
      return toast.error("Choose a PNG, JPG or WebP image");
    setLogoBusy(true);
    try {
      set("logoUrl", await logoToDataUrl(file));
    } catch {
      toast.error("Could not read that image");
    } finally {
      setLogoBusy(false);
      if (logoInput.current) logoInput.current.value = "";
    }
  };

  if (!tenant || !form) {
    return (
      <AppLayout title="Settings">
        <p className="text-muted-foreground">
          No organisation is associated with this account.
        </p>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Settings">
      <div
        className={cn(
          "mx-auto",
          DESIGN_TABS.includes(activeTab) ? "max-w-[1500px]" : "max-w-6xl",
        )}
      >
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-black">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your organisation, billing sheet and access
          </p>
        </div>

        <div className="flex flex-col border-2 border-black bg-white md:flex-row">
          {/* ---- left: grouped tabs ---- */}
          <aside className="flex shrink-0 flex-col border-b-2 border-black bg-white md:w-56 md:border-b-0 md:border-r-2">
            {TABS.map((g) => (
              <div
                key={g.group}
                className="border-b-2 border-black last:border-b-0"
              >
                <p className="border-b border-black/10 bg-gray-50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {g.group}
                </p>
                {g.items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-black/10 px-4 py-2.5 text-left text-sm font-bold transition-all last:border-b-0",
                      activeTab === t.id
                        ? "bg-[#024BAB] text-white"
                        : "text-black hover:bg-[#F0F6FF]",
                    )}
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>

          {/* ---- right: panel ---- */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className={cn(
                "flex-1",
                DESIGN_TABS.includes(activeTab) ? "p-0" : "p-6",
              )}
            >
              {activeTab === "invoice-design" && (
                <InvoiceDesigner active kind="invoice" />
              )}
              {activeTab === "consultation-design" && (
                <InvoiceDesigner active kind="consultation" />
              )}
              {activeTab === "general" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <InputField
                      label="Organisation Name"
                      value={form.name}
                      onChange={(v) => set("name", v)}
                      required
                    />
                    <InputField
                      label="Legal / Billing Name"
                      value={form.legalName}
                      onChange={(v) => set("legalName", v)}
                      placeholder="As registered for GST"
                    />
                    <InputField
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(v) => set("email", v)}
                    />
                    <InputField
                      label="Phone"
                      value={form.phone}
                      maxLength={10}
                      inputMode="numeric"
                      placeholder="10-digit number"
                      onChange={(v) =>
                        set("phone", v.replace(/\D/g, "").slice(0, 10))
                      }
                    />
                    <InputField
                      label="Website"
                      type="url"
                      value={form.website}
                      placeholder="https://"
                      onChange={(v) => set("website", v)}
                    />
                    <InputField
                      label="Clinic Code"
                      value={form.slug}
                      onChange={(v) => set("slug", v.toLowerCase())}
                      hint="Patients type this in the app to join you."
                    />
                    <InputField
                      label="GST Number"
                      value={form.gstin}
                      maxLength={15}
                      placeholder="e.g. 27ABCDE1234F1Z5"
                      onChange={(v) =>
                        set("gstin", v.toUpperCase().slice(0, 15))
                      }
                    />
                    <InputField
                      label="PAN"
                      value={form.pan}
                      maxLength={10}
                      placeholder="e.g. ABCDE1234F"
                      onChange={(v) => set("pan", v.toUpperCase().slice(0, 10))}
                    />
                  </div>
                  <TextAreaField
                    label="Address"
                    value={form.address}
                    placeholder="Street, area, landmark"
                    onChange={(v) => set("address", v)}
                  />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <InputField
                      label="City"
                      value={form.city}
                      onChange={(v) => set("city", v)}
                    />
                    <InputField
                      label="State"
                      value={form.state}
                      onChange={(v) => set("state", v)}
                      hint="Decides CGST+SGST vs IGST on invoices."
                    />
                    <InputField
                      label="Pincode"
                      value={form.pincode}
                      maxLength={6}
                      inputMode="numeric"
                      onChange={(v) =>
                        set("pincode", v.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                  </div>
                </div>
              )}

              {activeTab === "bank" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Shown in the “Bank Details” block of your invoice PDF so
                    patients know where to pay.
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <InputField
                      label="Account Holder Name"
                      value={form.bankHolder}
                      onChange={(v) => set("bankHolder", v)}
                    />
                    <InputField
                      label="Bank Name"
                      value={form.bankName}
                      onChange={(v) => set("bankName", v)}
                    />
                    <InputField
                      label="Branch"
                      value={form.bankBranch}
                      onChange={(v) => set("bankBranch", v)}
                    />
                    <SelectField
                      label="Account Type"
                      value={form.bankType}
                      onChange={(v) => set("bankType", v as Form["bankType"])}
                      options={[
                        ["current", "Current"],
                        ["savings", "Savings"],
                      ]}
                    />
                    <InputField
                      label="Account Number"
                      value={form.bankAccount}
                      inputMode="numeric"
                      maxLength={18}
                      placeholder="9–18 digits"
                      onChange={(v) =>
                        set("bankAccount", v.replace(/\D/g, "").slice(0, 18))
                      }
                    />
                    <InputField
                      label="IFSC Code"
                      value={form.bankIfsc}
                      maxLength={11}
                      placeholder="e.g. SBIN0001234"
                      onChange={(v) =>
                        set("bankIfsc", v.toUpperCase().slice(0, 11))
                      }
                    />
                    <InputField
                      label="UPI ID"
                      value={form.upiId}
                      placeholder="clinic@bank"
                      onChange={(v) => set("upiId", v)}
                    />
                  </div>
                </div>
              )}

              {activeTab === "invoice" && (
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={form.showBank}
                      onChange={(e) => set("showBank", e.target.checked)}
                      className="accent-[#024BAB]"
                    />
                    Show bank details on the invoice
                  </label>
                  <TextAreaField
                    label="Terms & Notes"
                    rows={5}
                    value={form.terms}
                    onChange={(v) => set("terms", v)}
                    placeholder={
                      "One term per line, e.g.\nPayment is due within 7 days.\nMedicines once dispensed cannot be returned."
                    }
                    hint="Leave empty to use the default terms."
                  />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <InputField
                      label="Authorised Signatory"
                      value={form.signatoryName}
                      onChange={(v) => set("signatoryName", v)}
                      placeholder="e.g. Dr. Asha Verma"
                    />
                    <InputField
                      label="Signatory Designation"
                      value={form.signatoryTitle}
                      onChange={(v) => set("signatoryTitle", v)}
                      placeholder="e.g. Medical Director"
                    />
                  </div>
                  <InputField
                    label="Footer Note"
                    value={form.footerNote}
                    maxLength={200}
                    onChange={(v) => set("footerNote", v)}
                    placeholder="e.g. Get well soon!"
                  />
                </div>
              )}

              {activeTab === "branding" && (
                <div className="space-y-4">
                  <InputField
                    label="Display Name"
                    value={form.appName}
                    onChange={(v) => set("appName", v)}
                    placeholder="Shown in the sidebar"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    {(["primaryColor", "secondaryColor"] as const).map((k) => (
                      <div key={k} className="space-y-2">
                        <label className={labelCls}>
                          {k === "primaryColor"
                            ? "Primary Colour"
                            : "Secondary Colour"}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={form[k]}
                            onChange={(e) => set(k, e.target.value)}
                            className="h-10 w-14 cursor-pointer border-2 border-black bg-white p-0.5"
                          />
                          <input
                            value={form[k]}
                            onChange={(e) => set(k, e.target.value)}
                            maxLength={7}
                            className={cn(inputCls, "font-mono")}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t-2 border-black pt-4">
                    <label className={cn(labelCls, "mb-3")}>Logo</label>
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <input
                          ref={logoInput}
                          id="logo-upload"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={logoBusy}
                          onChange={(e) => onLogo(e.target.files?.[0])}
                        />
                        <label
                          htmlFor="logo-upload"
                          className={cn(
                            "block w-full cursor-pointer border-2 border-dashed border-black px-4 py-3 text-center transition-colors hover:bg-[#024BAB]/5",
                            logoBusy && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <div className="text-xs font-bold text-black">
                            {logoBusy ? "Processing…" : "Click to upload logo"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            PNG, JPG or WebP. It is resized automatically and
                            printed on invoices.
                          </div>
                        </label>
                      </div>
                      {form.logoUrl && (
                        <div className="flex items-center gap-2">
                          <img
                            src={form.logoUrl}
                            alt="Logo"
                            className="h-24 w-24 border-2 border-black bg-white object-contain p-2"
                          />
                          <button
                            type="button"
                            aria-label="Remove logo"
                            onClick={() => set("logoUrl", "")}
                            className="border-2 border-black bg-[#EF4444] px-2 py-1 text-white hover:bg-[#DC2626]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "regional" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <SelectField
                      label="Timezone"
                      value={form.timezone}
                      onChange={(v) => set("timezone", v)}
                      options={TIMEZONES.map((t) => [t, t])}
                    />
                    <SelectField
                      label="Currency"
                      value={form.currency}
                      onChange={(v) => set("currency", v)}
                      options={CURRENCIES.map((c) => [c, c])}
                    />
                    <SelectField
                      label="Language"
                      value={form.language}
                      onChange={(v) => set("language", v)}
                      options={LANGUAGES}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Appointment slots and reports currently run in Indian
                    Standard Time; these values are stored for printing and
                    future use.
                  </p>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4 border-2 border-black p-4">
                    <div>
                      <p className="flex items-center gap-2 font-bold">
                        <Sparkles className="h-4 w-4 text-[#024BAB]" /> AI
                        Scribe
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Lets doctors turn consultation notes into a draft
                        record. The notes text is sent to an AI service; doctors
                        must review and sign every draft.
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={scribeOn}
                        disabled={moduleMutation.isPending}
                        onChange={(e) =>
                          moduleMutation.mutate(e.target.checked)
                        }
                        className="h-4 w-4 accent-[#024BAB]"
                      />
                      {scribeOn ? "Enabled" : "Disabled"}
                    </label>
                  </div>
                </div>
              )}

              {activeTab === "payments" && <PaymentsPanel />}
              {activeTab === "whatsapp" && <WhatsAppSettings />}

              {activeTab === "permissions" && <RolePermissions />}

              {activeTab === "profile" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ReadOnly label="Name" value={user?.name} />
                    <ReadOnly label="Login Email" value={user?.email} />
                    <ReadOnly
                      label="Role"
                      value={(user?.role ?? "").replace(/_/g, " ")}
                    />
                    <div className="space-y-2">
                      <label className={labelCls}>Mobile</label>
                      <div className="flex items-center gap-2 border-2 border-black bg-muted px-3 py-2 text-sm">
                        <span className="flex-1">{user?.phone || "—"}</span>
                        <StatusBadge
                          status={user?.phoneVerified ? "verified" : "pending"}
                          label={
                            user?.phoneVerified ? "Verified" : "Not verified"
                          }
                        />
                      </div>
                    </div>
                    <ReadOnly label="Organisation" value={tenant.name} />
                    <div className="space-y-2">
                      <label className={labelCls}>Plan</label>
                      <div className="flex items-center gap-2 border-2 border-black bg-muted px-3 py-2 text-sm">
                        <span className="flex-1 capitalize">
                          {tenant.plan}
                          {tenant.planExpiresAt
                            ? ` · until ${new Date(tenant.planExpiresAt).toLocaleDateString("en-IN")}`
                            : ""}
                        </span>
                        <Link
                          to="/billing"
                          className="text-xs font-bold text-[#024BAB] hover:underline"
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className={labelCls}>Clinic Code</label>
                      <div className="flex items-center gap-2 border-2 border-black bg-muted px-3 py-2 font-mono text-sm">
                        <span className="flex-1">{tenant.slug}</span>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs font-bold text-[#024BAB] hover:underline"
                          onClick={() =>
                            navigator.clipboard?.writeText(tenant.slug).then(
                              () => toast.success("Copied"),
                              () => toast.error("Could not copy"),
                            )
                          }
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use the Security tab to set up two-factor sign-in and verify
                    your WhatsApp number.
                  </p>
                </div>
              )}

              {activeTab === "security" && <SecuritySettings />}
            </div>

            {FORM_TABS.includes(activeTab) && (
              <div className="flex items-center justify-between gap-3 border-t-2 border-black bg-gray-50/50 p-4">
                <p className="text-xs text-muted-foreground">
                  {dirty ? "You have unsaved changes." : "All changes saved."}
                </p>
                <button
                  onClick={handleSave}
                  disabled={save.isPending || !dirty}
                  className={cn(
                    "flex items-center gap-2 border-2 border-black px-6 py-2.5 text-sm font-bold text-white transition-all",
                    save.isPending || !dirty
                      ? "cursor-not-allowed bg-gray-400"
                      : "bg-[#024BAB] hover:bg-[#01368A] active:scale-95",
                  )}
                >
                  {save.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Changes
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>{label}</label>
      <div className="border-2 border-black bg-muted px-3 py-2 text-sm capitalize-none">
        {value || "—"}
      </div>
    </div>
  );
}

const GATEWAYS = [
  {
    key: "razorpay",
    label: "Razorpay",
    url: "https://dashboard.razorpay.com/signup",
    fields: [
      ["razorpayKeyId", "Key ID", false],
      ["razorpayKeySecret", "Key Secret", true],
    ],
  },
  {
    key: "cashfree",
    label: "Cashfree",
    url: "https://merchant.cashfree.com/merchants/signup",
    fields: [
      ["cashfreeAppId", "App ID", false],
      ["cashfreeSecretKey", "Secret Key", true],
    ],
  },
  {
    key: "phonepe",
    label: "PhonePe",
    url: "https://business.phonepe.com/payment-gateway",
    fields: [
      ["phonepeMerchantId", "Merchant ID", false],
      ["phonepeSaltKey", "Salt Key", true],
      ["phonepeSaltIndex", "Salt Index", false],
    ],
  },
  {
    key: "paytm",
    label: "Paytm",
    url: "https://business.paytm.com/payment-gateway",
    fields: [
      ["paytmMerchantId", "Merchant ID (MID)", false],
      ["paytmMerchantKey", "Merchant Key", true],
    ],
  },
] as const;

// Organisation's own gateway: patient fees settle in the clinic's bank. Secrets are write-only (blank = keep).
function PaymentsPanel() {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["payments", "config"],
    queryFn: paymentsAPI.getConfig,
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const c = cfg.data;
  const active = provider ?? c?.provider ?? "razorpay";
  const on = enabled ?? c?.enabled ?? false;
  const gw = GATEWAYS.find((g) => g.key === active)!;

  const save = useMutation({
    mutationFn: () =>
      paymentsAPI.saveConfig({ provider: active, enabled: on, ...draft }),
    onSuccess: () => {
      setDraft({});
      setProvider(null);
      setEnabled(null);
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success("Payment settings saved");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to save"),
  });

  if (!c) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Connect your clinic's own gateway account. Patients (and your front
        desk) can then pay consultation fees online; money goes straight to your
        bank, and the appointment and invoice are marked paid automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        {GATEWAYS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setProvider(g.key)}
            className={cn(
              "border-2 border-black px-4 py-2 text-sm font-bold",
              active === g.key
                ? "bg-[#024BAB] text-white"
                : "bg-white hover:bg-[#F0F6FF]",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        No account yet?{" "}
        <a
          href={gw.url}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-[#024BAB] hover:underline"
        >
          Sign up with {gw.label}
        </a>
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {gw.fields.map(([key, label, secret]) => {
          const isSet = secret
            ? c[`${key}Set` as keyof typeof c] === true
            : false;
          const value =
            draft[key] ??
            (secret ? "" : String(c[key as keyof typeof c] ?? ""));
          return (
            <InputField
              key={key}
              label={label}
              type={secret ? "password" : "text"}
              autoComplete="off"
              value={value}
              placeholder={isSet ? "•••••••• saved — leave blank to keep" : ""}
              onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
            />
          );
        })}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-[#024BAB]"
        />
        Accept online payments
        <StatusBadge
          status={c.enabled && c.configured ? "active" : "pending"}
          label={c.enabled && c.configured ? "Live" : "Off"}
        />
      </label>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#01368A] disabled:bg-gray-400"
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}{" "}
        Save payment settings
      </button>
    </div>
  );
}
