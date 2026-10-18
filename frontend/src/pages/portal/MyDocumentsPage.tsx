import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FolderOpen, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { inputCls } from "@/components/forms/WizardModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, portalAPI, type PortalRecord } from "@/services/api";
import { Empty, fmtDate, Intro, useProfiles, WhoTag } from "./shared";

const TYPES: PortalRecord["type"][] = [
  "prescription",
  "lab_report",
  "bill",
  "scan",
  "discharge",
  "other",
];
const MAX_BYTES = 2 * 1024 * 1024;
const OK_MIME = ["application/pdf", "image/jpeg", "image/png"];

const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(f);
  });

const kb = (n: number) =>
  n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Locker for reports/scans the patient already has (from other hospitals, old prescriptions…). */
export default function MyDocumentsPage() {
  const qc = useQueryClient();
  const profiles = useProfiles();
  const q = useQuery({
    queryKey: ["portal", "records"],
    queryFn: portalAPI.records,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<PortalRecord["type"]>("lab_report");
  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [profileId, setProfileId] = useState("");

  const onError = (err: unknown) =>
    toast.error(
      err instanceof ApiError || err instanceof Error
        ? err.message
        : "Something went wrong",
    );

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file");
      return portalAPI.uploadRecord({
        patientId: profileId || undefined,
        title: title.trim(),
        type,
        recordDate,
        mimeType: file.type,
        dataBase64: await readBase64(file),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "records"] });
      toast.success("Document saved");
      setOpen(false);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => portalAPI.deleteRecord(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal", "records"] });
      toast.success("Document deleted");
    },
    onError,
  });

  const pick = (f?: File) => {
    if (!f) return;
    if (!OK_MIME.includes(f.type))
      return toast.error("Only PDF, JPEG or PNG files are allowed");
    if (f.size > MAX_BYTES) return toast.error("File must be 2 MB or smaller");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const openNew = () => {
    setFile(null);
    setTitle("");
    setType("lab_report");
    setProfileId(profiles.data?.[0]?._id ?? "");
    setOpen(true);
  };

  const view = async (id: string) => {
    try {
      await portalAPI.openRecord(id);
    } catch (err) {
      onError(err);
    }
  };

  return (
    <AppLayout title="My Documents">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Intro>
          Keep your medical files in one place — old reports, scans, discharge
          summaries. PDF, JPEG or PNG up to 2 MB.
        </Intro>
        <Button onClick={openNew} disabled={!profiles.data?.length}>
          <Upload className="h-4 w-4" /> Upload document
        </Button>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !q.data?.length ? (
        <Empty
          icon={FolderOpen}
          text="No documents yet. Upload your first report."
        />
      ) : (
        <div className="space-y-3">
          {q.data.map((r) => (
            <div
              key={r._id}
              className="flex flex-col gap-3 border-2 border-black bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-bold">
                  {r.title} <WhoTag profiles={profiles.data} id={r.patientId} />
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="capitalize">{r.type.replace("_", " ")}</span>{" "}
                  · {fmtDate(r.recordDate)} · {kb(r.size)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => view(r._id)}>
                  <Eye className="h-4 w-4" /> Open
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() =>
                    window.confirm(`Delete "${r.title}"?`) &&
                    remove.mutate(r._id)
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-black p-6 text-sm font-semibold hover:bg-gray-50"
              >
                <Upload className="h-4 w-4" />{" "}
                {file ? `${file.name} (${kb(file.size)})` : "Choose a file"}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                Title
              </label>
              <input
                className={inputCls}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Blood test — March 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                  Type
                </label>
                <select
                  className={`${inputCls} capitalize`}
                  value={type}
                  onChange={(e) =>
                    setType(e.target.value as PortalRecord["type"])
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                  Date
                </label>
                <input
                  type="date"
                  className={inputCls}
                  max={new Date().toISOString().slice(0, 10)}
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                />
              </div>
            </div>
            {(profiles.data?.length ?? 0) > 1 && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider">
                  For
                </label>
                <select
                  className={inputCls}
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                >
                  {profiles.data!.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={!file || !title.trim() || upload.isPending}
              onClick={() => upload.mutate()}
            >
              {upload.isPending ? "Uploading…" : "Save document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
