import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  MapPin,
  Pencil,
  PauseCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/RowActions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, complianceAPI } from "@/services/api";

const empty = {
  name: "",
  code: "",
  street: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
};

export default function LocationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState("all");
  const summary = useSummary();
  const sm = summary.data;
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");

  const { data: clinics } = useQuery({
    queryKey: ["clinics"],
    queryFn: complianceAPI.clinics,
  });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Request failed");

  const closeDialog = () => {
    setOpen(false);
    setEditId(null);
    setForm(empty);
  };

  const create = useMutation({
    mutationFn: () => {
      const address = {
        street: form.street,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
      };
      // code is the branch's stable identifier, so it is only sent on create
      return editId
        ? complianceAPI.updateClinic(editId, {
            name: form.name,
            phone: form.phone,
            address,
          })
        : complianceAPI.createClinic({
            name: form.name,
            code: form.code,
            phone: form.phone,
            address,
          });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(editId ? "Location updated" : "Location added");
      closeDialog();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => complianceAPI.deleteClinic(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success("Location deleted");
    },
    onError,
  });

  const toggle = useMutation({
    mutationFn: (c: { _id: string; status: "active" | "inactive" }) =>
      complianceAPI.updateClinic(c._id, {
        status: c.status === "active" ? "inactive" : "active",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinics"] }),
    onError,
  });

  const f = (
    k: keyof typeof empty,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`loc-${k}`}>{label}</Label>
      <Input
        id={`loc-${k}`}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        {...props}
      />
    </div>
  );

  const byCard = (clinics ?? []).filter((c) =>
    cardKey === "active" || cardKey === "inactive"
      ? c.status === cardKey
      : true,
  );
  const visible = byCard.filter(
    (c) =>
      (fStatus === "all" || c.status === fStatus) &&
      matches(q, c.name, c.code, c.address?.city, c.phone),
  );

  return (
    <AppLayout title="Locations">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground">
          Branches of your practice. Multi-branch needs the Clinic plan.
        </p>
        <Dialog
          open={open}
          onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}
        >
          <Button
            onClick={() => {
              setEditId(null);
              setForm(empty);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add location
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editId ? "Edit location" : "Add location"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  {f("name", "Name", { required: true })}
                </div>
                {f("code", "Code", {
                  required: true,
                  maxLength: 12,
                  placeholder: "KOTH",
                  disabled: !!editId,
                })}
              </div>
              {f("street", "Street")}
              <div className="grid grid-cols-3 gap-3">
                {f("city", "City")}
                {f("state", "State")}
                {f("pincode", "Pincode", {
                  inputMode: "numeric",
                  maxLength: 6,
                })}
              </div>
              {f("phone", "Phone", { type: "tel" })}
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending
                    ? "Saving..."
                    : editId
                      ? "Save changes"
                      : "Save location"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <SummaryBar
        cards={[
          {
            key: "all",
            label: "Locations",
            value: stat(sm?.clinics.total),
            icon: MapPin,
            filterable: true,
          },
          {
            key: "active",
            label: "Active",
            value: stat(sm?.clinics.active),
            icon: CheckCircle2,
            color: "#00C48C",
            filterable: true,
          },
          {
            key: "inactive",
            label: "Inactive",
            value: stat(sm ? sm.clinics.total - sm.clinics.active : undefined),
            icon: PauseCircle,
            color: "#6B7280",
            filterable: true,
          },
        ]}
        active={cardKey}
        onPick={setCardKey}
        shown={visible.length}
        total={cardKey === "all" ? sm?.clinics.total : undefined}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by name, code, city or phone…"
        filters={[
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
          {!clinics?.length ? (
            <p className="p-6 text-center text-muted-foreground">
              No locations yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="font-bold">{c.code}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.address?.city || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => {
                            setEditId(c._id);
                            setForm({
                              name: c.name,
                              code: c.code,
                              street: c.address?.street ?? "",
                              city: c.address?.city ?? "",
                              state: c.address?.state ?? "",
                              pincode: c.address?.pincode ?? "",
                              phone: c.phone ?? "",
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ActionButton
                          label={
                            c.status === "active"
                              ? `Deactivate ${c.name}`
                              : `Activate ${c.name}`
                          }
                          icon={
                            c.status === "active" ? PauseCircle : CheckCircle2
                          }
                          onClick={() => toggle.mutate(c)}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Delete ${c.name}`}
                          disabled={remove.isPending}
                          onClick={() =>
                            window.confirm(`Delete ${c.name}?`) &&
                            remove.mutate(c._id)
                          }
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
