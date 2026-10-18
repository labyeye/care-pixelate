import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/ui/badge";
import { ApiError, whatsappAPI } from "@/services/api";

const when = (v: string) =>
  new Date(v).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Settings > WhatsApp: master switch, which messages are on, wording preview, and the recent send log. */
export function WhatsAppSettings() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["whatsapp"], queryFn: whatsappAPI.get });
  const log = useQuery({
    queryKey: ["whatsapp", "log"],
    queryFn: whatsappAPI.log,
  });

  const save = useMutation({
    mutationFn: whatsappAPI.save,
    onSuccess: (data) => {
      qc.setQueryData(["whatsapp"], data);
      toast.success("Saved");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not save"),
  });

  const c = cfg.data;
  if (!c) return <Loader2 className="h-5 w-5 animate-spin" />;
  const off = c.templates.filter((t) => !t.enabled).map((t) => t.key);
  const toggle = (key: string, on: boolean) =>
    save.mutate({
      disabledTemplates: on ? off.filter((k) => k !== key) : [...off, key],
    });

  return (
    <div className="space-y-5">
      <div
        className={`border-2 p-3 text-sm ${c.connected ? "border-green-700 bg-green-50" : "border-amber-600 bg-amber-50"}`}
      >
        {c.connected
          ? "WhatsApp is connected. Messages below are sent automatically."
          : "The WhatsApp API is not connected yet. Messages are recorded in the log below but nothing is sent until the connection is set up."}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#024BAB]"
          checked={c.enabled}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ enabled: e.target.checked })}
        />
        Send WhatsApp messages to patients
        <StatusBadge
          status={c.enabled ? "active" : "inactive"}
          label={c.enabled ? "On" : "Off"}
        />
      </label>

      <div className="space-y-3">
        {c.templates.map((t) => (
          <div key={t.key} className="border-2 border-black p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">
                  {t.title}{" "}
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t.category}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{t.trigger}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#024BAB]"
                  checked={t.enabled}
                  disabled={save.isPending}
                  onChange={(e) => toggle(t.key, e.target.checked)}
                />
                {t.enabled ? "On" : "Off"}
              </label>
            </div>
            <p className="mt-2 border-l-4 border-green-600 bg-[#F0F6FF] p-2 text-sm">
              {t.preview}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Meta template: {t.name} · variables in order: {t.vars.join(", ")}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider">
          Recent messages
        </p>
        {!log.data?.length ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto border-2 border-black">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 font-bold uppercase">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">Message</th>
                  <th className="p-2">To</th>
                  <th className="p-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {log.data.map((m) => (
                  <tr key={m._id} className="border-t border-black/10">
                    <td className="p-2 whitespace-nowrap">
                      {when(m.createdAt)}
                    </td>
                    <td className="p-2">{m.template.replace(/_/g, " ")}</td>
                    <td className="p-2">{m.to || "-"}</td>
                    <td className="p-2">
                      <StatusBadge status={m.status} />
                      {m.reason && (
                        <span className="ml-2 text-muted-foreground">
                          {m.reason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
