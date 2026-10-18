import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar, matches } from "@/components/FilterBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Activity, ShieldAlert, SquarePen } from "lucide-react";
import { stat, SummaryBar, useSummary } from "@/components/SummaryCards";
import { complianceAPI } from "@/services/api";

const RESOURCES = [
  "",
  "patient",
  "appointment",
  "consultation",
  "invoice",
  "lab_order",
  "portal",
  "compliance",
];
const LIMIT = 50;

export default function AuditLogPage() {
  const [resource, setResource] = useState("");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const sm = useSummary().data?.auditToday;

  const { data, isLoading } = useQuery({
    queryKey: ["audit", resource, action, page],
    queryFn: () =>
      complianceAPI.audit({
        resource: resource || undefined,
        action: action === "all" ? undefined : action,
        page: String(page),
        limit: String(LIMIT),
      }),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <AppLayout title="Audit Log">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">
          Who viewed or changed patient data. Entries cannot be edited or
          deleted.
        </p>
        <select
          value={resource}
          onChange={(e) => {
            setResource(e.target.value);
            setPage(1);
          }}
          className="nb-input h-10 px-3 text-sm capitalize"
          aria-label="Filter by record type"
        >
          {RESOURCES.map((r) => (
            <option key={r} value={r}>
              {r ? r.replace("_", " ") : "All records"}
            </option>
          ))}
        </select>
      </div>

      <SummaryBar
        cards={[
          {
            key: "events",
            label: "Events today",
            value: stat(sm?.events),
            icon: Activity,
          },
          {
            key: "views",
            label: "Record views",
            value: stat(sm?.views),
            icon: Eye,
            color: "#024BAB",
          },
          {
            key: "changes",
            label: "Changes made",
            value: stat(sm?.changes),
            icon: SquarePen,
            color: "#FA731C",
          },
          {
            key: "denied",
            label: "Denied / failed",
            value: stat(sm?.denied),
            icon: ShieldAlert,
            color: "#DC2626",
          },
        ]}
        active="all"
        onPick={() => {}}
      />

      <FilterBar
        search={q}
        onSearch={setQ}
        placeholder="Search this page by user, record or path…"
        filters={[
          {
            kind: "select",
            key: "action",
            label: "Action",
            value: action,
            onChange: (v) => {
              setAction(v);
              setPage(1);
            },
            options: ["view", "create", "update", "delete", "action"].map(
              (v) => ({ value: v, label: v }),
            ),
          },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <p className="p-6 text-center text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items
                  .filter((e) =>
                    matches(
                      q,
                      typeof e.userId === "object" ? e.userId.name : "",
                      typeof e.userId === "object" ? e.userId.email : "",
                      e.resource,
                      e.resourceId,
                      e.path,
                    ),
                  )
                  .map((e) => (
                    <TableRow key={e._id}>
                      <TableCell>
                        {new Date(e.at).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 align-middle">
                          {typeof e.userId === "object" && (
                            <Avatar
                              kind="staff"
                              id={e.userId._id}
                              name={e.userId.name}
                              size={24}
                            />
                          )}
                          {typeof e.userId === "object" ? e.userId.name : "—"}
                        </span>
                        <span className="ml-1 text-xs capitalize text-muted-foreground">
                          {e.role?.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize">{e.action}</TableCell>
                      <TableCell className="capitalize">
                        {e.resource.replace("_", " ")}
                        {e.resourceId && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            …{e.resourceId.slice(-6)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={e.status} />
                      </TableCell>
                      <TableCell className="text-xs">{e.ip || "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </AppLayout>
  );
}
