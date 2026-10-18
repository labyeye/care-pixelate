import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, permissionsAPI } from "@/services/api";
import { cn } from "@/lib/utils";

const label = (r: string) => r.replace(/_/g, " ");

/**
 * Role x page matrix. A ticked cell means "people with this role see that page in their menu and may use it".
 * Cells the server can never allow (route-level security) or that a role must always keep are disabled.
 */
export function RolePermissions() {
  const qc = useQueryClient();
  const { refreshSession } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: permissionsAPI.get,
  });
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (data)
      setDraft(
        Object.fromEntries(data.roles.map((r) => [r, [...data.current[r]]])),
      );
  }, [data]);

  const dirty = useMemo(() => {
    if (!data) return false;
    return data.roles.some((r) => {
      const a = [...(draft[r] ?? [])].sort().join();
      const b = [...data.current[r]].sort().join();
      return a !== b;
    });
  }, [data, draft]);

  const onError = (err: unknown) =>
    toast.error(
      err instanceof ApiError ? err.message : "Could not save permissions",
    );
  const done = async (msg: string) => {
    await qc.invalidateQueries({ queryKey: ["role-permissions"] });
    await refreshSession(); // the signed-in admin's own menu may change too
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: () => permissionsAPI.update(draft),
    onSuccess: () => done("Role permissions saved"),
    onError,
  });
  const reset = useMutation({
    mutationFn: () => permissionsAPI.reset(),
    onSuccess: () => done("Reset to recommended defaults"),
    onError,
  });

  if (isLoading) return null;
  if (isError || !data) return null;

  const toggle = (role: string, key: string) =>
    setDraft((d) => {
      const has = d[role]?.includes(key);
      return {
        ...d,
        [role]: has
          ? d[role].filter((k) => k !== key)
          : [...(d[role] ?? []), key],
      };
    });

  const groups = [...new Set(data.pages.map((p) => p.group))];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Role permissions</CardTitle>
        <CardDescription>
          Choose which pages each role can see and work in. Sensitive actions
          (creating admins, billing, audit log) stay restricted to
          administrators regardless. Owners always have full access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto border-2 border-black">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black bg-[#024BAB]/5">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">
                  Page
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Owner
                  </span>
                </th>
                {data.roles.map((r) => (
                  <th
                    key={r}
                    className="whitespace-nowrap px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider"
                  >
                    {label(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g}
                  group={g}
                  pages={data.pages.filter((p) => p.group === g)}
                  roles={data.roles}
                  draft={draft}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Greyed cells can't be granted to that role. Changes apply the next
            time those users load a page.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                window.confirm(
                  "Reset every role to the recommended defaults?",
                ) && reset.mutate()
              }
              disabled={reset.isPending}
              className="flex items-center gap-2 border-2 border-black bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />{" "}
              {save.isPending ? "Saving…" : "Save permissions"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupRows({
  group,
  pages,
  roles,
  draft,
  onToggle,
}: {
  group: string;
  pages: {
    key: string;
    label: string;
    base: string[];
    mandatoryFor: string[];
  }[];
  roles: string[];
  draft: Record<string, string[]>;
  onToggle: (role: string, key: string) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50">
        <td
          colSpan={roles.length + 2}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          {group}
        </td>
      </tr>
      {pages.map((p) => (
        <tr key={p.key} className="border-b border-black/10">
          <td className="whitespace-nowrap px-3 py-2 font-medium">{p.label}</td>
          <td className="px-3 py-2 text-center">
            <input
              type="checkbox"
              checked
              disabled
              aria-label={`Owner can open ${p.label}`}
            />
          </td>
          {roles.map((r) => {
            const grantable = p.base.includes(r);
            const locked = p.mandatoryFor.includes(r);
            const checked = grantable && (locked || draft[r]?.includes(p.key));
            return (
              <td
                key={r}
                className={cn(
                  "px-3 py-2 text-center",
                  !grantable && "bg-gray-100",
                )}
              >
                <input
                  type="checkbox"
                  checked={!!checked}
                  disabled={!grantable || locked}
                  onChange={() => onToggle(r, p.key)}
                  aria-label={`${label(r)} can open ${p.label}`}
                  title={
                    !grantable
                      ? "This role can never hold this page"
                      : locked
                        ? "Always on for this role"
                        : undefined
                  }
                  className="h-4 w-4 cursor-pointer accent-[#024BAB] disabled:cursor-not-allowed"
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
