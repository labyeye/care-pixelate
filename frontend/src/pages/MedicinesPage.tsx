import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Clock, Package, PackageMinus, PackagePlus, Pencil, Pill, Plus, Trash2, Truck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Field, inputCls, WizardModal } from "@/components/forms/WizardModal";
import { Suggest, TagInput } from "@/components/forms/Suggest";
import { FilterBar, useDebounced } from "@/components/FilterBar";
import { inr, stat, SummaryBar } from "@/components/SummaryCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, medicinesAPI, vendorsAPI } from "@/services/api";
import type { Medicine } from "@/types";

const FORMS = ["tablet", "capsule", "syrup", "suspension", "injection", "cream", "ointment", "drops", "inhaler", "powder", "gel", "lotion", "other"];
const UNITS = ["tablet", "capsule", "ml", "bottle", "vial", "tube", "strip", "piece", "pack", "other"];
const CATEGORIES = [
  "Analgesic / Antipyretic", "Antibiotic", "Antiviral", "Antifungal", "Antihistamine / Allergy", "Antacid / GI",
  "Antidiabetic", "Antihypertensive", "Cardiac", "Cholesterol", "Respiratory", "Vitamin / Supplement", "Steroid",
  "Dermatological", "Eye / Ear", "Neurological", "Psychiatric", "Hormonal", "IV Fluid", "Vaccine", "Surgical / Consumable", "Other",
];
const SCHEDULES = ["OTC", "Schedule H", "Schedule H1", "Schedule X", "Schedule G", "Narcotic (NDPS)"];

const blank = {
  name: "", genericName: "", brandName: "", manufacturer: "", category: "", dosageForm: "tablet", strength: "",
  activeIngredients: [] as string[], packSize: "1", unit: "piece", prescriptionRequired: true, scheduleCategory: "",
  storageInstructions: "", warnings: [] as string[], mrp: "", sellingPrice: "", gstRate: "12", hsnCode: "", barcode: "",
  sku: "", reorderLevel: "10", trackInventory: true, description: "", isActive: true, vendor: "",
};
type Form = typeof blank;

// activeIngredients are stored as {name, strength}; the form edits them as "Name strength" chips.
const ingToChip = (i: { name: string; strength?: string }) => (i.strength ? `${i.name} ${i.strength}` : i.name);
const chipToIng = (c: string) => {
  const m = c.match(/^(.*?)\s+(\d[\d.,]*\s?\w+(\/\w+)?)$/);
  return m ? { name: m[1].trim(), strength: m[2].trim() } : { name: c.trim(), strength: "" };
};

const expiryState = (d?: string | null) => {
  if (!d) return null;
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? "expired" : days <= 90 ? "soon" : "ok";
};

export default function MedicinesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = ["super_admin", "tenant_owner", "hospital_admin", "pharmacist"].includes(user?.role ?? "");
  const canDelete = ["super_admin", "tenant_owner", "hospital_admin"].includes(user?.role ?? "");

  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [fCategory, setFCategory] = useState("all");
  const [fForm, setFForm] = useState("all");
  const [cardKey, setCardKey] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Form>({ ...blank });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stockFor, setStockFor] = useState<Medicine | null>(null);
  const [stockType, setStockType] = useState<"in" | "out" | "set">("in");
  const [stockQty, setStockQty] = useState("");
  const [stockExpiry, setStockExpiry] = useState("");
  const [stockVendor, setStockVendor] = useState("");
  const [fVendor, setFVendor] = useState("all");

  const stockFilter = cardKey === "low" || cardKey === "out" || cardKey === "expiring" ? cardKey : undefined;
  const params = {
    q: dq || undefined,
    category: fCategory === "all" ? undefined : fCategory,
    form: fForm === "all" ? undefined : fForm,
    vendor: fVendor === "all" ? undefined : fVendor,
    stock: stockFilter,
    active: cardKey === "active" ? "true" : undefined,
    limit: "200",
  };
  const { data: medicines, isLoading } = useQuery({ queryKey: ["medicines", params], queryFn: () => medicinesAPI.getAll(params) });
  const { data: vendors } = useQuery({ queryKey: ["vendors"], queryFn: () => vendorsAPI.getAll({ limit: "500" }), staleTime: 30_000 });
  const { data: sm } = useQuery({ queryKey: ["medicine-stats"], queryFn: medicinesAPI.stats, staleTime: 15_000 });

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Request failed");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["medicines"] });
    qc.invalidateQueries({ queryKey: ["medicine-stats"] });
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (form.mrp === "" || Number(form.mrp) < 0) e.mrp = "MRP is required";
    if (form.sellingPrice === "" || Number(form.sellingPrice) < 0) e.sellingPrice = "Selling price is required";
    else if (form.mrp !== "" && Number(form.sellingPrice) > Number(form.mrp)) e.sellingPrice = "Cannot exceed MRP";
    if (Number(form.packSize) < 1) e.packSize = "Pack size must be at least 1";
    if (Number(form.gstRate) < 0 || Number(form.gstRate) > 100) e.gstRate = "GST must be 0–100";
    return e;
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        packSize: Number(form.packSize) || 1,
        mrp: Number(form.mrp),
        sellingPrice: Number(form.sellingPrice),
        gstRate: Number(form.gstRate) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        activeIngredients: form.activeIngredients.map(chipToIng),
      } as unknown as Partial<Medicine>;
      return editId ? medicinesAPI.update(editId, payload) : medicinesAPI.create(payload);
    },
    onSuccess: (m) => {
      refresh();
      toast.success(editId ? "Medicine updated" : `${m.name} added (${m.medicineId})`);
      setOpen(false);
    },
    onError,
  });

  const adjust = useMutation({
    mutationFn: () =>
      medicinesAPI.stock(stockFor!._id, {
        type: stockType,
        qty: Number(stockQty),
        expiryDate: stockType === "in" && stockExpiry ? stockExpiry : undefined,
        vendor: stockType === "in" && stockVendor ? stockVendor : undefined,
      }),
    onSuccess: (m) => {
      refresh();
      toast.success(`${m.name}: ${m.stockQty} in stock`);
      setStockFor(null);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => medicinesAPI.remove(id),
    onSuccess: () => {
      refresh();
      toast.success("Medicine deleted");
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

  const openEdit = (m: Medicine) => {
    setEditId(m._id);
    setForm({
      name: m.name, genericName: m.genericName ?? "", brandName: m.brandName ?? "", manufacturer: m.manufacturer ?? "",
      category: m.category ?? "", dosageForm: m.dosageForm, strength: m.strength ?? "",
      activeIngredients: (m.activeIngredients ?? []).map(ingToChip), packSize: String(m.packSize ?? 1), unit: m.unit,
      prescriptionRequired: m.prescriptionRequired, scheduleCategory: m.scheduleCategory ?? "",
      storageInstructions: m.storageInstructions ?? "", warnings: m.warnings ?? [], mrp: String(m.mrp),
      sellingPrice: String(m.sellingPrice), gstRate: String(m.gstRate ?? 0), hsnCode: m.hsnCode ?? "", barcode: m.barcode ?? "",
      sku: m.sku ?? "", reorderLevel: String(m.reorderLevel ?? 0), trackInventory: m.trackInventory,
      description: m.description ?? "", isActive: m.isActive,
      vendor: m.vendor && typeof m.vendor === "object" ? m.vendor._id : ((m.vendor as string | null | undefined) ?? ""),
    });
    setErrors({});
    setTab(0);
    setOpen(true);
  };

  const submit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setTab(e.name ? 0 : 1);
      return toast.error("Please fix the highlighted fields");
    }
    save.mutate();
  };

  const text = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, required = false) => (
    <Field label={label} required={required} error={errors[k]}>
      <input
        {...props}
        className={inputCls}
        value={String(form[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </Field>
  );
  const select = (k: keyof Form, label: string, options: string[]) => (
    <Field label={label} error={errors[k]}>
      <select className={`${inputCls} capitalize`} value={String(form[k])} onChange={(e) => set(k, e.target.value as never)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
  const check = (k: "prescriptionRequired" | "trackInventory" | "isActive", label: string) => (
    <label className="flex items-center gap-2 text-sm font-bold">
      <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );

  const margin = form.mrp && form.sellingPrice ? Math.round(((Number(form.mrp) - Number(form.sellingPrice)) / Number(form.mrp)) * 100) : null;

  return (
    <AppLayout title="Medicines & Inventory">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">Medicine catalogue with live stock, reorder alerts and expiry tracking.</p>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/vendors">
                <Truck className="h-4 w-4" /> Vendors
              </Link>
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add medicine
            </Button>
          </div>
        )}
      </div>

      <SummaryBar
        cards={[
          { key: "all", label: "Total medicines", value: stat(sm?.total), icon: Pill, filterable: true },
          { key: "low", label: "Low stock", value: stat(sm?.lowStock), icon: AlertTriangle, color: "#FA731C", filterable: true },
          { key: "out", label: "Out of stock", value: stat(sm?.outOfStock), icon: Package, color: "#EF4444", filterable: true },
          { key: "expiring", label: "Expiring ≤ 90 days", value: stat(sm?.expiringSoon), icon: Clock, color: "#A855F7", filterable: true },
          { key: "active", label: "Active", value: stat(sm?.active), icon: Boxes, color: "#00C48C", filterable: true },
          { key: "value", label: "Stock value", value: inr(sm?.stockValue), icon: Wallet, color: "#024BAB" },
        ]}
        active={cardKey}
        onPick={setCardKey}
        exportType="stock-on-hand"
        exportLabel="Export stock"
        shown={medicines?.length}
        total={cardKey === "all" ? sm?.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by name, generic, brand, barcode, SKU or ID…"
        filters={[
          { kind: "select", key: "category", label: "Category", value: fCategory, onChange: setFCategory, options: CATEGORIES.map((v) => ({ value: v, label: v })) },
          { kind: "select", key: "form", label: "Form", value: fForm, onChange: setFForm, options: FORMS.map((v) => ({ value: v, label: v })) },
          { kind: "select", key: "vendor", label: "Vendor", value: fVendor, onChange: setFVendor, options: [{ value: "none", label: "No vendor" }, ...(vendors ?? []).map((v) => ({ value: v._id, label: v.businessName }))] },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !medicines?.length ? (
            <p className="p-6 text-center text-muted-foreground">No medicines found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Form / Strength</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>MRP / Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicines.map((m) => {
                  const low = m.trackInventory && m.stockQty <= m.reorderLevel;
                  const ex = expiryState(m.expiryDate);
                  return (
                    <TableRow key={m._id} className={!m.isActive ? "opacity-60" : undefined}>
                      <TableCell className="whitespace-nowrap">{m.medicineId}</TableCell>
                      <TableCell>
                        <p className="font-bold">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[m.genericName, m.manufacturer].filter(Boolean).join(" · ") || "—"}
                          {m.prescriptionRequired && <span className="ml-1 border border-black px-1 text-[10px] font-bold">Rx</span>}
                        </p>
                      </TableCell>
                      <TableCell className="capitalize">{m.dosageForm}{m.strength ? ` · ${m.strength}` : ""}</TableCell>
                      <TableCell>{m.category || "—"}</TableCell>
                      <TableCell>{typeof m.vendor === "object" && m.vendor ? m.vendor.businessName : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="text-xs text-muted-foreground line-through">{m.sellingPrice < m.mrp ? `₹${m.mrp}` : ""}</span>{" "}
                        <b>₹{m.sellingPrice}</b>
                      </TableCell>
                      <TableCell>
                        {m.trackInventory ? (
                          <span className={low ? "font-bold text-red-600" : "font-bold"}>
                            {m.stockQty} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
                            {m.stockQty === 0 ? " · out" : low ? " · low" : ""}
                          </span>
                        ) : <span className="text-muted-foreground">Not tracked</span>}
                      </TableCell>
                      <TableCell className={ex === "expired" ? "font-bold text-red-600" : ex === "soon" ? "font-bold text-amber-700" : ""}>
                        {m.expiryDate ? new Date(m.expiryDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {canManage && m.trackInventory && (
                            <Button variant="outline" size="icon" aria-label={`Adjust stock of ${m.name}`} onClick={() => { setStockFor(m); setStockType("in"); setStockQty(""); setStockExpiry(""); setStockVendor(typeof m.vendor === "object" && m.vendor ? m.vendor._id : ""); }}>
                              <PackagePlus className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && (
                            <Button variant="outline" size="icon" aria-label={`Edit ${m.name}`} onClick={() => openEdit(m)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label={`Delete ${m.name}`}
                              disabled={remove.isPending}
                              onClick={() => window.confirm(`Delete ${m.name}? This cannot be undone.`) && remove.mutate(m._id)}
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
        title={editId ? "Edit medicine" : "Add medicine"}
        subtitle={form.name}
        avatarFallback={form.name || "M"}
        tabs={["Basic", "Pricing & stock", "Clinical details"]}
        tab={tab}
        onTab={setTab}
        onNext={(from) => {
          if (from === 0 && !form.name.trim()) {
            setErrors((e) => ({ ...e, name: "Name is required" }));
            return false;
          }
          return true;
        }}
        onSubmit={submit}
        submitLabel={editId ? "Save changes" : "Add medicine"}
        saving={save.isPending}
      >
        {tab === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Medicine name", { placeholder: "e.g. Paracetamol 500" }, true)}
            {text("genericName", "Generic name", { placeholder: "e.g. Paracetamol" })}
            {text("brandName", "Brand name", { placeholder: "e.g. Crocin" })}
            {text("manufacturer", "Manufacturer")}
            <Field label="Category">
              <Suggest value={form.category} onChange={(v) => set("category", v)} presets={CATEGORIES} placeholder="Pick or type a category" />
            </Field>
            {select("dosageForm", "Dosage form", FORMS)}
            {text("strength", "Strength", { placeholder: "e.g. 500 mg" })}
            <div className="grid grid-cols-2 gap-3">
              {text("packSize", "Pack size", { type: "number", min: 1 })}
              {select("unit", "Unit", UNITS)}
            </div>
            <Field label="Active ingredients" className="sm:col-span-2">
              <TagInput values={form.activeIngredients} onChange={(v) => set("activeIngredients", v)} placeholder="e.g. Paracetamol 500mg — press Enter" />
            </Field>
          </div>
        )}

        {tab === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {text("mrp", "MRP (₹)", { type: "number", min: 0, step: "any" }, true)}
            {text("sellingPrice", "Selling price (₹)", { type: "number", min: 0, step: "any" }, true)}
            {margin !== null && margin >= 0 && (
              <p className="sm:col-span-2 text-xs font-bold text-muted-foreground">Discount off MRP: {margin}%</p>
            )}
            {text("gstRate", "GST rate (%)", { type: "number", min: 0, max: 100 })}
            {text("hsnCode", "HSN code")}
            {text("barcode", "Barcode")}
            {text("sku", "SKU")}
            <Field label="Vendor / supplier">
              <select className={inputCls} value={form.vendor} onChange={(e) => set("vendor", e.target.value)}>
                <option value="">— None —</option>
                {(vendors ?? []).filter((v) => v.status === "active" || v._id === form.vendor).map((v) => (
                  <option key={v._id} value={v._id}>{v.businessName} ({v.vendorId})</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 flex flex-wrap gap-6 border-2 border-black bg-[#F8FAFF] p-3">
              {check("trackInventory", "Track inventory")}
              {check("isActive", "Active (available for use)")}
            </div>
            {form.trackInventory && text("reorderLevel", "Reorder level (alert at or below)", { type: "number", min: 0 })}
            {editId && <p className="self-end text-xs text-muted-foreground">Use the stock button in the table to add or remove stock.</p>}
          </div>
        )}

        {tab === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{check("prescriptionRequired", "Prescription required (Rx)")}</div>
            <Field label="Schedule category">
              <Suggest value={form.scheduleCategory} onChange={(v) => set("scheduleCategory", v)} presets={SCHEDULES} placeholder="e.g. Schedule H" />
            </Field>
            {text("storageInstructions", "Storage instructions", { placeholder: "e.g. Store below 25°C, away from light" })}
            <Field label="Warnings" className="sm:col-span-2">
              <TagInput values={form.warnings} onChange={(v) => set("warnings", v)} placeholder="e.g. Avoid alcohol — press Enter" />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea className={inputCls} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
        )}
      </WizardModal>

      <Dialog open={!!stockFor} onOpenChange={(o) => !o && setStockFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update stock — {stockFor?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            On hand: <b>{stockFor?.stockQty}</b> {stockFor?.unit}
          </p>
          <div className="flex gap-2">
            {([["in", "Stock in", PackagePlus], ["out", "Stock out", PackageMinus], ["set", "Set count", Boxes]] as const).map(([t, label, Icon]) => (
              <Button key={t} type="button" variant={stockType === t ? "default" : "outline"} onClick={() => setStockType(t)}>
                <Icon className="h-4 w-4" /> {label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold">{stockType === "set" ? "New stock count" : "Quantity"}</label>
              <Input type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} autoFocus />
            </div>
            {stockType === "in" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-bold">Batch expiry (optional)</label>
                  <Input type="date" value={stockExpiry} onChange={(e) => setStockExpiry(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold">Received from (vendor)</label>
                  <select className={inputCls} value={stockVendor} onChange={(e) => setStockVendor(e.target.value)}>
                    <option value="">— Not specified —</option>
                    {(vendors ?? []).filter((v) => v.status === "active" || v._id === stockVendor).map((v) => (
                      <option key={v._id} value={v._id}>{v.businessName} ({v.vendorId})</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button disabled={adjust.isPending || stockQty === ""} onClick={() => adjust.mutate()}>
              {adjust.isPending ? "Saving..." : "Update stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
