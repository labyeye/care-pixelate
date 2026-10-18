import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Mail, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { FilterBar, matches, useDebounced } from "@/components/FilterBar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, authAPI, staffAPI } from "@/services/api";
import type { StaffMember } from "@/types";

const label = (r: string) => r.replace(/_/g, " ");

export default function PasswordResetPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [fRole, setFRole] = useState("all");
  const [target, setTarget] = useState<StaffMember | null>(null);
  const [custom, setCustom] = useState("");
  const [issued, setIssued] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: staffAPI.getAll,
  });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Request failed");

  const reset = useMutation({
    mutationFn: () =>
      staffAPI.resetPassword(target!._id, custom.trim() || undefined),
    onSuccess: (r) => {
      setIssued(r);
      setTarget(null);
      setCustom("");
      setCopied(false);
    },
    onError,
  });

  const emailLink = useMutation({
    mutationFn: (email: string) => authAPI.forgotPassword(email),
    onSuccess: () =>
      toast.success(
        "Reset link requested. If email isn't configured on the server, use a temporary password instead.",
      ),
    onError,
  });

  const canReset = (s: StaffMember) =>
    s._id !== user?._id &&
    (s.role !== "hospital_admin" || user?.role === "tenant_owner");

  const roles = [...new Set((staff ?? []).map((s) => s.role))];
  const visible = (staff ?? []).filter(
    (s) =>
      (fRole === "all" || s.role === fRole) &&
      matches(dq, s.name, s.email, s.role, s.staffId ?? ""),
  );

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${issued.email}\nPassword: ${issued.password}`,
      );
      setCopied(true);
    } catch {
      toast.error("Copy failed — select the password and copy it manually");
    }
  };

  return (
    <AppLayout title="Password Reset">
      <p className="mb-4 text-muted-foreground">
        Reset a doctor's or staff member's password. They are signed out
        everywhere and should change it after logging in.
      </p>

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search by name, email, role or staff ID…"
        filters={[
          {
            kind: "select",
            key: "role",
            label: "Role",
            value: fRole,
            onChange: setFRole,
            options: roles.map((r) => ({ value: r, label: label(r) })),
          },
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
          ) : !visible.length ? (
            <p className="p-6 text-center text-muted-foreground">
              No matching users.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Login email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-bold">{s.name}</TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell className="capitalize">
                      {label(s.role)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={emailLink.isPending}
                          onClick={() => emailLink.mutate(s.email)}
                          title="Email a reset link (needs email configured on the server)"
                        >
                          <Mail className="h-4 w-4" /> Email link
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canReset(s)}
                          onClick={() => {
                            setTarget(s);
                            setCustom("");
                          }}
                          title={
                            canReset(s)
                              ? "Set a temporary password"
                              : "You can't reset this account here"
                          }
                        >
                          <KeyRound className="h-4 w-4" /> Reset password
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

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {target?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            A secure temporary password is generated for <b>{target?.email}</b>.
            Or type your own:
          </p>
          <Input
            placeholder="Leave blank to auto-generate"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Custom passwords need 8+ characters with upper, lower case and a
            number.
          </p>
          <DialogFooter>
            <Button disabled={reset.isPending} onClick={() => reset.mutate()}>
              {reset.isPending ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New password for {issued?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 border-2 border-black bg-[#F8FAFF] p-3 text-sm">
            <p>
              <b>Email:</b> {issued?.email}
            </p>
            <p>
              <b>Password:</b>{" "}
              <code className="select-all text-base font-bold">
                {issued?.password}
              </code>
            </p>
          </div>
          <p className="flex items-start gap-2 text-xs font-bold text-[#FA731C]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            This is shown only once. Share it privately and ask them to change
            it after signing in.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={copy}>
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}{" "}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
