import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseCsv } from "@/lib/csvParse";
import { ApiError, patientsAPI } from "@/services/api";

const SAMPLE =
  "First Name,Last Name,Date of Birth,Gender,Mobile,Email,Blood Group,City,State,Pincode\nAsha,Verma,1990-03-05,female,9876543210,asha@example.com,O+,Pune,Maharashtra,411001\n";

export function PatientImport({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [name, setName] = useState("");
  const [result, setResult] = useState<{
    created: number;
    skipped: { row: number; reason: string }[];
  } | null>(null);

  const close = () => {
    setRows([]);
    setName("");
    setResult(null);
    if (file.current) file.current.value = "";
    onClose();
  };

  const run = useMutation({
    mutationFn: () => patientsAPI.importRows(rows),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(
        `${r.created} patient${r.created === 1 ? "" : "s"} imported`,
      );
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Import failed"),
  });

  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > 2_000_000) return toast.error("File is too large (max 2 MB)");
    const parsed = parseCsv(await f.text());
    if (!parsed.length)
      return toast.error(
        "No rows found. The first row must be the column headings.",
      );
    if (parsed.length > 500)
      return toast.error("Import at most 500 patients at a time");
    setRows(parsed);
    setName(f.name);
    setResult(null);
  };

  const sample = () => {
    const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
    Object.assign(document.createElement("a"), {
      href: url,
      download: "patients-sample.csv",
    }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import patients from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Export your old records to a CSV file (Excel: Save As, CSV). Needed
            columns: first name, mobile, gender and date of birth (or age).
            Dates can be YYYY-MM-DD or DD/MM/YYYY. Duplicates (same mobile and
            first name) are skipped.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={sample}>
            <Download className="h-4 w-4" /> Download sample file
          </Button>
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            className="block w-full border-2 border-dashed border-black p-3 text-sm"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {rows.length > 0 && !result && (
            <p className="font-semibold">
              {name}: {rows.length} rows ready. Columns:{" "}
              {Object.keys(rows[0]).join(", ")}
            </p>
          )}
          {result && (
            <div className="space-y-2">
              <p className="font-bold">
                {result.created} imported, {result.skipped.length} skipped.
              </p>
              {result.skipped.length > 0 && (
                <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-700">
                  {result.skipped.map((s) => (
                    <li key={s.row}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              disabled={!rows.length || run.isPending}
              onClick={() => run.mutate()}
            >
              <Upload className="h-4 w-4" />{" "}
              {run.isPending
                ? "Importing…"
                : `Import ${rows.length || ""} patients`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
