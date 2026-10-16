import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileWarning, Pencil, PackageX, Plus, ShieldAlert, ShieldCheck, Trash2, Truck, UserX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Field, inputCls, WizardModal } from "@/components/forms/WizardModal";
import { FilterBar, useDebounced } from "@/components/FilterBar";
import { inr, stat, SummaryBar } from "@/components/SummaryCards";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, medicinesAPI, vendorsAPI } from "@/services/api";
import type { Vendor } from "@/types";

const TYPES = ["manufacturer", "distributor", "wholesaler", "retailer", "other"];
const TERMS = ["immediate", "7_days", "15_days", "30_days", "45_days", "60_days", "custom"];
const STATUSES = ["active", "inactive", "blocked"];
const LICENCE_WARN_DAYS = 60;

const blank = {
  businessName: "", vendorType: "distributor", status: "active", phone: "", alternatePhone: "", email: "",
  contactName: "", contactDesignation: "", contactPhone: "", contactEmail: "",
  street: "", city: "", state: "", pincode: "", country: "India",
  gstin: "", drugLicenseNumber: "", drugLicenseExpiry: "", paymentTerms: "immediate", creditLimit: "0", openingBalance: "0",
  accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", notes: "",
};
type Form = typeof blank;

const label = (s: string) => s.replace(/_/g, " ");

/** days until the drug licence lapses; null when no expiry on file. */
const licenceDays = (v: Vendor) => (v.drugLicenseExpiry ? Math.floor((new Date(v.drugLicenseExpiry).getTime() - Date.now()) / 86_400_000) : null);
const licenceDue = (v: Vendor) => {
  const d = licenceDays(v);
  return d !== null && d <= LICENCE_WARN_DAYS;
};
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/10 py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-semibold">{v || "—"}</span>
    </div>
  );
}

export default function VendorsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete = ["super_admin", "tenant_owner", "hospital_admin"].includes(user?.role ?? "");

  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [fType, setFType] = useState("all");
  const [cardKey, setCardKey] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Form>({ ...blank });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<Vendor | null>(null);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["vendors", "page", dq],
    queryFn: () => vendorsAPI.getAll({ q: dq || undefined, limit: "500" }),
  });
  const { data: sm } = useQuery({ queryKey: ["vendor-stats"], queryFn: vendorsAPI.stats, staleTime: 15_000 });
  const { data: supplied, isLoading: loadingSupplied } = useQuery({
    queryKey: ["medicines", "vendor", viewing?._id],
    queryFn: () => medicinesAPI.getAll({ vendor: viewing!._id, limit: "200" }),
    enabled: !!viewing,
  });

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Request failed");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["vendors"] });
    qc.invalidateQueries({ queryKey: ["vendor-stats"] });
    qc.invalidateQueries({ queryKey: ["report"] });
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.businessName.trim()) e.businessName = "Business name is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Enter a valid email";
    if (form.gstin && form.gstin.trim().length !== 15) e.gstin = "GSTIN must be 15 characters";
    if (form.ifscCode && form.ifscCode.trim().length !== 11) e.ifscCode = "IFSC must be 11 characters";
    if (Number(form.creditLimit) < 0) e.creditLimit = "Cannot be negative";
    return e;
  };
  const tabOfError = (e: Record<string, string>) =>
    ["businessName", "phone", "email"].some((k) => e[k]) ? 0 : e.gstin || e.creditLimit ? 2 : e.ifscCode ? 3 : 0;

  const save = useMutation({
    mutationFn: () => {
      const f = form;
      const payload = {
        businessName: f.businessName.trim(), vendorType: f.vendorType, status: f.status, phone: f.phone.trim(),
        alternatePhone: f.alternatePhone.trim(), email: f.email.trim(),
        contactPerson: { name: f.contactName.trim(), designation: f.contactDesignation.trim(), phone: f.contactPhone.trim(), email: f.contactEmail.trim() },
        address: { street: f.street.trim(), city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim(), country: f.country.trim() || "India" },
        gstin: f.gstin.trim(), drugLicenseNumber: f.drugLicenseNumber.trim(), drugLicenseExpiry: f.drugLicenseExpiry || null,
        paymentTerms: f.paymentTerms, creditLimit: Number(f.creditLimit) || 0, openingBalance: Number(f.openingBalance) || 0,
        bankDetails: { accountHolderName: f.accountHolderName.trim(), bankName: f.bankName.trim(), accountNumber: f.accountNumber.trim(), ifscCode: f.ifscCode.trim().toUpperCase() },
        notes: f.notes.trim(),
      } as unknown as Partial<Vendor>;
      return editId ? vendorsAPI.update(editId, payload) : vendorsAPI.create(payload);
    },
    onSuccess: (v) => {
      refresh();
      toast.success(editId ? "Vendor updated" : `${v.businessName} added (${v.vendorId})`);
      setOpen(false);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => vendorsAPI.remove(id),
    onSuccess: () => {
      refresh();
      toast.success("Vendor deleted");
    },
    onError,
  });

  const openNew = () => {
    setEditId(null);
    setForm({ ...blank });
    setErrors({});
    setTab(0);
    setOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditId(v._id);
    setForm({
      businessName: v.businessName, vendorType: v.vendorType, status: v.status, phone: v.phone, alternatePhone: v.alternatePhone ?? "",
      email: v.email ?? "", contactName: v.contactPerson?.name ?? "", contactDesignation: v.contactPerson?.designation ?? "",
      contactPhone: v.contactPerson?.phone ?? "", contactEmail: v.contactPerson?.email ?? "", street: v.address?.street ?? "",
      city: v.address?.city ?? "", state: v.address?.state ?? "", pincode: v.address?.pincode ?? "", country: v.address?.country ?? "India",
      gstin: v.gstin ?? "", drugLicenseNumber: v.drugLicenseNumber ?? "", drugLicenseExpiry: v.drugLicenseExpiry ? v.drugLicenseExpiry.slice(0, 10) : "",
      paymentTerms: v.paymentTerms, creditLimit: String(v.creditLimit ?? 0), openingBalance: String(v.openingBalance ?? 0),
      accountHolderName: v.bankDetails?.accountHolderName ?? "", bankName: v.bankDetails?.bankName ?? "",
      accountNumber: v.bankDetails?.accountNumber ?? "", ifscCode: v.bankDetails?.ifscCode ?? "", notes: v.notes ?? "",
    });
    setErrors({});
    setTab(0);
    setOpen(true);
  };

  const submit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setTab(tabOfError(e));
      return toast.error("Please fix the highlighted fields");
    }
    save.mutate();
  };

  const text = (k: keyof Form, lbl: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, required = false) => (
    <Field label={lbl} required={required} error={errors[k]}>
      <input {...props} className={inputCls} value={form[k]} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );
  const select = (k: keyof Form, lbl: string, options: string[]) => (
    <Field label={lbl}>
      <select className={`${inputCls} capitalize`} value={form[k]} onChange={(e) => set(k, e.target.value as never)}>
        {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
      </select>
    </Field>
  );

  const all = vendors ?? [];
  const rows = all.filter((v) => {
    if (fType !== "all" && v.vendorType !== fType) return false;
    if (cardKey === "licence") return licenceDue(v);
    if (["active", "inactive", "blocked"].includes(cardKey)) return v.status === cardKey;
    return true;
  });

  return (
    <AppLayout title="Vendors">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">Suppliers you buy medicines from — contacts, licences, payment terms and what each one supplies.</p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add vendor
        </Button>
      </div>

      <SummaryBar
        cards={[
          { key: "all", label: "Total vendors", value: stat(sm?.total), icon: Truck, filterable: true },
          { key: "active", label: "Active", value: stat(sm?.active), icon: ShieldCheck, color: "#00C48C", filterable: true },
          { key: "inactive", label: "Inactive", value: stat(sm?.inactive), icon: UserX, color: "#6B7280", filterable: true },
          { key: "blocked", label: "Blocked", value: stat(sm?.blocked), icon: ShieldAlert, color: "#EF4444", filterable: true },
          { key: "licence", label: "Licence due ≤ 60 days", value: stat(sm?.licenceDue), icon: FileWarning, color: "#FA731C", filterable: true },
          { key: "nolink", label: "Medicines w/o vendor", value: stat(sm?.medicinesWithoutVendor), icon: PackageX, color: "#A855F7" },
          { key: "value", label: "Stock supplied", value: inr(sm?.stockValue), icon: Wallet, color: "#024BAB" },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="vendor-directory"
        exportLabel="Export vendors"
        shown={rows.length}
        total={cardKey === "all" && fType === "all" && !dq ? sm?.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by business name, vendor ID, phone or GSTIN…"
        filters={[{ kind: "select", key: "type", label: "Type", value: fType, onChange: setFType, options: TYPES.map((v) => ({ value: v, label: v })) }]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !rows.length ? (
            <p className="p-6 text-center text-muted-foreground">
              {all.length ? "No vendors match these filters." : "No vendors yet. Add the suppliers you buy medicines from."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>GSTIN / Licence</TableHead>
                  <TableHead>Terms / Credit</TableHead>
                  <TableHead>Medicines</TableHead>
                  <TableHead>Stock value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => {
                  const d = licenceDays(v);
                  return (
                    <TableRow key={v._id} className={v.status !== "active" ? "opacity-70" : undefined}>
                      <TableCell className="whitespace-nowrap">{v.vendorId}</TableCell>
                      <TableCell>
                        <p className="font-bold">{v.businessName}</p>
                        <p className="text-xs text-muted-foreground">{[v.address?.city, v.email].filter(Boolean).join(" · ") || "—"}</p>
                      </TableCell>
                      <TableCell className="capitalize">{v.vendorType}</TableCell>
                      <TableCell>
                        <p>{v.contactPerson?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{v.phone}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs">{v.gstin || "—"}</p>
                        <p className={`text-xs ${d !== null && d < 0 ? "font-bold text-red-600" : d !== null && d <= LICENCE_WARN_DAYS ? "font-bold text-amber-700" : "text-muted-foreground"}`}>
                          {v.drugLicenseNumber || "No licence"}
                          {d !== null && ` · ${d < 0 ? "expired" : `${d}d left`}`}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="capitalize">{label(v.paymentTerms)}</p>
                        <p className="text-xs text-muted-foreground">Limit ₹{(v.creditLimit ?? 0).toLocaleString("en-IN")}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <b>{v.supply?.medicines ?? 0}</b>
                        {!!v.supply?.low && <span className="ml-1 text-xs font-bold text-red-600">{v.supply.low} low</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">₹{(v.supply?.value ?? 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell><StatusBadge status={v.status} /></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" aria-label={`View ${v.businessName}`} onClick={() => setViewing(v)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" aria-label={`Edit ${v.businessName}`} onClick={() => openEdit(v)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Delete ${v.businessName}`}
                              disabled={remove.isPending}
                              onClick={() => window.confirm(`Delete ${v.businessName}? This cannot be undone.`) && remove.mutate(v._id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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

      <WizardModal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit vendor" : "Add vendor"}
        subtitle={form.businessName}
        avatarFallback={form.businessName || "V"}
        tabs={["Basic", "Contact & address", "Compliance & payment", "Bank & notes"]}
        tab={tab}
        onTab={setTab}
        onNext={(from) => {
          if (from === 0) {
            const e: Record<string, string> = {};
            if (!form.businessName.trim()) e.businessName = "Business name is required";
            if (!form.phone.trim()) e.phone = "Phone is required";
            if (Object.keys(e).length) {
              setErrors((s) => ({ ...s, ...e }));
              return false;
            }
          }
          return true;
        }}
        onSubmit={submit}
        submitLabel={editId ? "Save changes" : "Add vendor"}
        saving={save.isPending}
      >
        {tab === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("businessName", "Business name", { placeholder: "e.g. Sai Pharma Distributors" }, true)}</div>
            {select("vendorType", "Vendor type", TYPES)}
            {select("status", "Status", STATUSES)}
            {text("phone", "Phone", { type: "tel" }, true)}
            {text("alternatePhone", "Alternate phone", { type: "tel" })}
            <div className="sm:col-span-2">{text("email", "Email", { type: "email" })}</div>
          </div>
        )}

        {tab === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact person</p>
            {text("contactName", "Name")}
            {text("contactDesignation", "Designation", { placeholder: "e.g. Sales manager" })}
            {text("contactPhone", "Phone", { type: "tel" })}
            {text("contactEmail", "Email", { type: "email" })}
            <p className="sm:col-span-2 mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Address</p>
            <div className="sm:col-span-2">{text("street", "Street / area")}</div>
            {text("city", "City")}
            {text("state", "State")}
            {text("pincode", "Pincode", { inputMode: "numeric", maxLength: 6 })}
            {text("country", "Country")}
          </div>
        )}

        {tab === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {text("gstin", "GSTIN", { placeholder: "15-character GSTIN", maxLength: 15, style: { textTransform: "uppercase" } })}
            {text("drugLicenseNumber", "Drug licence number")}
            {text("drugLicenseExpiry", "Drug licence expiry", { type: "date" })}
            {select("paymentTerms", "Payment terms", TERMS)}
            {text("creditLimit", "Credit limit (₹)", { type: "number", min: 0, step: "any" })}
            {text("openingBalance", "Opening balance owed (₹)", { type: "number", step: "any" })}
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Opening balance is what you already owe this vendor when you start tracking; the licence expiry feeds the "Licence due" alert and the Drug licence tracker report.
            </p>
          </div>
        )}

        {tab === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {text("accountHolderName", "Account holder name")}
            {text("bankName", "Bank name")}
            {text("accountNumber", "Account number", { inputMode: "numeric" })}
            {text("ifscCode", "IFSC code", { maxLength: 11, style: { textTransform: "uppercase" } })}
            <Field label="Notes" className="sm:col-span-2">
              <textarea className={inputCls} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Delivery days, discounts, special terms…" />
            </Field>
          </div>
        )}
      </WizardModal>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewing?.businessName} <span className="text-sm font-normal text-muted-foreground">{viewing?.vendorId}</span>
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                <div>
                  <Row k="Type" v={<span className="capitalize">{viewing.vendorType}</span>} />
                  <Row k="Status" v={<StatusBadge status={viewing.status} />} />
                  <Row k="Phone" v={[viewing.phone, viewing.alternatePhone].filter(Boolean).join(" / ")} />
                  <Row k="Email" v={viewing.email} />
                  <Row k="Contact person" v={[viewing.contactPerson?.name, viewing.contactPerson?.designation].filter(Boolean).join(", ")} />
                  <Row k="Contact phone / email" v={[viewing.contactPerson?.phone, viewing.contactPerson?.email].filter(Boolean).join(" · ")} />
                  <Row
                    k="Address"
                    v={[viewing.address?.street, viewing.address?.city, viewing.address?.state, viewing.address?.pincode, viewing.address?.country].filter(Boolean).join(", ")}
                  />
                </div>
                <div>
                  <Row k="GSTIN" v={viewing.gstin} />
                  <Row k="Drug licence" v={viewing.drugLicenseNumber} />
                  <Row k="Licence expiry" v={fmtDate(viewing.drugLicenseExpiry)} />
                  <Row k="Payment terms" v={<span className="capitalize">{label(viewing.paymentTerms)}</span>} />
                  <Row k="Credit limit" v={`₹${(viewing.creditLimit ?? 0).toLocaleString("en-IN")}`} />
                  <Row k="Opening balance" v={`₹${(viewing.openingBalance ?? 0).toLocaleString("en-IN")}`} />
                  <Row
                    k="Bank"
                    v={[viewing.bankDetails?.bankName, viewing.bankDetails?.accountNumber, viewing.bankDetails?.ifscCode].filter(Boolean).join(" · ")}
                  />
                </div>
              </div>
              {viewing.notes && <p className="border-2 border-black bg-[#F8FAFF] p-3 text-sm">{viewing.notes}</p>}

              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Medicines supplied ({supplied?.length ?? viewing.supply?.medicines ?? 0})
              </p>
              {loadingSupplied ? (
                <Skeleton className="h-24 w-full" />
              ) : !supplied?.length ? (
                <p className="text-sm text-muted-foreground">No medicines are linked to this vendor yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplied.map((m) => (
                      <TableRow key={m._id}>
                        <TableCell>
                          <p className="font-bold">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.medicineId}{m.strength ? ` · ${m.strength}` : ""}</p>
                        </TableCell>
                        <TableCell>{m.category || "—"}</TableCell>
                        <TableCell className={m.trackInventory && m.stockQty <= m.reorderLevel ? "font-bold text-red-600" : ""}>
                          {m.trackInventory ? `${m.stockQty} ${m.unit}` : "Not tracked"}
                        </TableCell>
                        <TableCell>₹{m.sellingPrice}</TableCell>
                        <TableCell>{fmtDate(m.expiryDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
