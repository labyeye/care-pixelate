import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, FileText, GripVertical, ImagePlus, Loader2, Redo2, RotateCcw, Save, Trash2, Type, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { makeConsultSheet } from "@/components/invoice/ConsultationSheet";
import { makeSheet } from "@/components/invoice/InvoiceSheet";
import type { BuildOpts } from "@/components/invoice/sheetCore";
import { useAuth } from "@/contexts/AuthContext";
import { useHistoryState } from "@/hooks/useHistoryState";
import { sampleConsultation } from "@/lib/consultationSheetData";
import { sampleSheet } from "@/lib/invoiceSheetData";
import { BLOCK_LABELS, PAGE_H, PAGE_W, defaultFor, newBlock, newFloat, normalizeTemplate, presetsFor, templateFor, type BlockType, type DocKind, type Float, type InvoiceTemplate, type Theme } from "@/lib/invoiceTemplate";
import { logoOf, previewConsultationDesign, previewDesign } from "@/lib/openInvoice";
import { cn } from "@/lib/utils";
import { ApiError, tenantAPI } from "@/services/api";
import { DesignerCanvas, type Selection } from "./DesignerCanvas";
import { fileToDataUrl } from "./imageUtil";
import { Inspector } from "./Inspector";

const ADDABLE: Record<DocKind, BlockType[]> = {
  invoice: ["note", "image", "spacer", "divider", "title", "header", "parties", "items", "words", "summary", "taxSummary", "footer"],
  consultation: ["note", "image", "spacer", "divider", "title", "header", "patientInfo", "vitals", "clinical", "medicines", "advice", "footer"],
};

const COPY: Record<DocKind, { field: "invoiceTemplate" | "consultationTemplate"; noun: string; used: string; classic: string }> = {
  invoice: { field: "invoiceTemplate", noun: "Invoice", used: "new invoices will print with it.", classic: "the classic invoice" },
  consultation: { field: "consultationTemplate", noun: "Consultation", used: "every completed consultation will print with it.", classic: "the classic prescription" },
};

const blockHint = (b: InvoiceTemplate["blocks"][number]) => (b.type === "note" ? String(b.props.text || "").slice(0, 24) : "");

const editing = (el: HTMLElement) => el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["range", "checkbox", "color", "file"].includes((el as HTMLInputElement).type));

/**
 * Settings -> Invoice Designer / Consultation Designer. Drag blocks into order, restyle the theme, drop in logos /
 * stamps / watermarks, and save. The saved design is what every printed document of that kind uses (patients' copies too).
 */
export default function InvoiceDesigner({ active, kind = "invoice" }: { active: boolean; kind?: DocKind }) {
  const { tenant, refreshSession } = useAuth();
  const copy = COPY[kind];
  const PRESETS = presetsFor(kind);
  const logo = logoOf(tenant);
  const invoiceData = useMemo(() => sampleSheet(tenant), [tenant]);
  const consultData = useMemo(() => sampleConsultation(tenant), [tenant]);
  // One function per document kind that draws the page at any scale; the canvas adds the interactive bits.
  const build = (o: BuildOpts) => (kind === "consultation" ? makeConsultSheet({ ...o, template: tpl, data: consultData, logo }) : makeSheet({ ...o, template: tpl, data: invoiceData, logo }));

  const saved0 = tenant?.[copy.field];
  const initial = useMemo(() => templateFor(saved0, kind), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { state: tpl, set, undo, redo, canUndo, canRedo } = useHistoryState<InvoiceTemplate>(initial);
  const savedRef = useRef<InvoiceTemplate>(initial); // dirty = the current object isn't the one last saved
  const [hasSaved, setHasSaved] = useState(!!saved0);
  const [sel, setSel] = useState<Selection>(null);
  const [saving, setSaving] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = tpl !== savedRef.current;

  // ---- edits (every one is undoable; `group` merges rapid changes into one undo step) ----
  const setTheme = (patch: Partial<Theme>, group: string) => set((t) => ({ ...t, theme: { ...t.theme, ...patch } }), group);
  const setBlockProps = (id: string, patch: Record<string, any>, group: string) =>
    set((t) => ({ ...t, blocks: t.blocks.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...patch } } : b)) }), group);
  const setFloat = (id: string, patch: Partial<Float>, group: string) => set((t) => ({ ...t, floats: t.floats.map((f) => (f.id === id ? { ...f, ...patch } : f)) }), group);

  const moveBlock = (from: number, to: number) => {
    if (from === to || to < 0) return;
    set((t) => {
      if (to >= t.blocks.length) return t;
      const blocks = [...t.blocks];
      blocks.splice(to, 0, blocks.splice(from, 1)[0]);
      return { ...t, blocks };
    });
  };
  const toggleBlock = (id: string) => set((t) => ({ ...t, blocks: t.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)) }));
  const toggleFloat = (id: string) => set((t) => ({ ...t, floats: t.floats.map((f) => (f.id === id ? { ...f, visible: !f.visible } : f)) }));

  const remove = (s: NonNullable<Selection>) => {
    set((t) => (s.kind === "block" ? { ...t, blocks: t.blocks.filter((b) => b.id !== s.id) } : { ...t, floats: t.floats.filter((f) => f.id !== s.id) }));
    setSel(null);
  };

  const addBlock = (type: BlockType) => {
    const b = newBlock(type);
    set((t) => ({ ...t, blocks: [...t.blocks, b] }));
    setSel({ kind: "block", id: b.id });
  };

  const addFloat = (kind: Float["kind"], patch: Partial<Float> = {}) => {
    const f = newFloat(kind, patch);
    set((t) => ({ ...t, floats: [...t.floats, f] }));
    setSel({ kind: "float", id: f.id });
  };

  const addImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const src = await fileToDataUrl(file);
      const img = new Image();
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
        img.src = src;
      });
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2;
      const w = 25;
      addFloat("image", { src, w, h: Math.min(60, (((w / 100) * PAGE_W) / ratio / PAGE_H) * 100), x: 60, y: 3 });
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "Could not add image");
    }
  };

  const applyPreset = (key: string) => {
    if (!PRESETS[key]) return;
    set(PRESETS[key].build());
    setSel(null);
  };

  // ---- save / preview ----
  const persist = async (value: InvoiceTemplate | null) => {
    setSaving(true);
    try {
      await tenantAPI.updateTenant({ [copy.field]: value } as never);
      await refreshSession();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving || !dirty) return;
    if (await persist(normalizeTemplate(tpl, kind))) {
      savedRef.current = tpl;
      setHasSaved(true);
      toast.success(`${copy.noun} design saved — ${copy.used}`);
    }
  };

  const useClassic = async () => {
    if (!window.confirm(`Remove your custom design and go back to ${copy.classic}?`)) return;
    if (await persist(null)) {
      const fresh = defaultFor(kind);
      set(fresh);
      savedRef.current = fresh;
      setHasSaved(false);
      toast.success(`Back to ${copy.classic}`);
    }
  };

  const preview = () => {
    const t = normalizeTemplate(tpl, kind);
    const ok = kind === "consultation" ? previewConsultationDesign(t, consultData, tenant) : previewDesign(t, invoiceData, tenant);
    if (!ok) toast.error("Allow pop-ups to preview the document");
  };

  // ---- keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+S, Delete, arrows (only while this tab is showing) ----
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (editing(e.target as HTMLElement)) return; // let text fields keep their own undo
      if (mod && key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (sel && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove(sel);
      } else if (sel?.kind === "float" && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const f = tpl.floats.find((x) => x.id === sel.id);
        if (!f) return;
        const step = e.shiftKey ? 2 : 0.4;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setFloat(f.id, { x: Math.min(100 - f.w, Math.max(0, f.x + dx)), y: Math.min(100 - f.h, Math.max(0, f.y + dy)) }, `nudge-${f.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const btn = "px-3 py-1.5 text-xs font-bold border-2 border-black bg-white hover:bg-[#024BAB]/10 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed";
  const rowCls = (on: boolean, over: boolean) =>
    cn("flex items-center gap-1 border-2 px-1.5 py-1.5 text-xs font-bold bg-white cursor-pointer", on ? "border-[#024BAB] bg-[#024BAB]/10" : "border-black/20 hover:border-black", over && "border-t-4 border-t-[#024BAB]");

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[600px] flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-black bg-white px-4 py-2">
        <button className={btn} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
        <button className={btn} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
        <select value="" onChange={(e) => applyPreset(e.target.value)} className="border-2 border-black bg-white px-2 py-1.5 text-xs font-bold" aria-label="Start from a preset">
          <option value="">Start from preset…</option>
          {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select>
        <button className={btn} onClick={() => { set(defaultFor(kind)); setSel(null); }} title="Back to the classic layout (you can undo this)"><RotateCcw className="h-3.5 w-3.5" /> Reset layout</button>
        {hasSaved && <button className={cn(btn, "text-red-600")} onClick={useClassic} disabled={saving} title="Stop using the custom design">Use classic {kind === "consultation" ? "prescription" : "invoice"}</button>}
        <div className="flex-1" />
        {dirty ? <span className="text-[11px] font-bold text-amber-700">Unsaved changes</span> : hasSaved ? <span className="text-[11px] font-bold text-[#00A070]">Design in use</span> : <span className="text-[11px] font-bold text-black/50">Using {copy.classic}</span>}
        <button className={btn} onClick={preview}><FileText className="h-3.5 w-3.5" /> Preview PDF</button>
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-1.5 border-2 border-black bg-[#024BAB] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#01368A] disabled:cursor-not-allowed disabled:bg-gray-400" title="Ctrl+S">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save design
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_290px]">
        {/* layers */}
        <div className="max-h-72 space-y-4 overflow-y-auto border-b-2 border-black bg-white p-3 lg:max-h-none lg:border-b-0 lg:border-r-2">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-black/50">Layout (drag to reorder)</p>
            <div className="space-y-1">
              {tpl.blocks.map((b, i) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
                  onDrop={() => { if (dragFrom !== null) moveBlock(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  onClick={() => setSel({ kind: "block", id: b.id })}
                  className={rowCls(sel?.kind === "block" && sel.id === b.id, dragOver === i && dragFrom !== null && dragFrom !== i)}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-black/40" />
                  <span className={cn("flex-1 truncate", !b.visible && "line-through opacity-40")}>
                    {BLOCK_LABELS[b.type]}
                    {Number(b.props.w) > 0 && Number(b.props.w) < 100 ? <span className="font-black text-[#024BAB]"> {Math.round(Number(b.props.w))}%</span> : null}
                    {blockHint(b) ? <span className="font-normal text-black/40"> · {blockHint(b)}</span> : null}
                  </span>
                  <button aria-label="Move up" onClick={(e) => { e.stopPropagation(); moveBlock(i, i - 1); }} disabled={i === 0} className="p-0.5 disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button aria-label="Move down" onClick={(e) => { e.stopPropagation(); moveBlock(i, i + 1); }} disabled={i === tpl.blocks.length - 1} className="p-0.5 disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button aria-label={b.visible ? "Hide" : "Show"} onClick={(e) => { e.stopPropagation(); toggleBlock(b.id); }} className="p-0.5">{b.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                </div>
              ))}
            </div>
            <select
              value=""
              onChange={(e) => e.target.value && addBlock(e.target.value as BlockType)}
              className="mt-2 w-full border-2 border-dashed border-black bg-white px-2 py-1.5 text-xs font-bold"
              aria-label="Add a block"
            >
              <option value="">+ Add block…</option>
              {ADDABLE[kind].map((t) => <option key={t} value={t}>{BLOCK_LABELS[t]}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-black/50">Images &amp; text on the page</p>
            <div className="mb-2 flex gap-2">
              <button className={cn(btn, "flex-1 justify-center")} onClick={() => fileRef.current?.click()}><ImagePlus className="h-3.5 w-3.5" /> Image</button>
              <button className={cn(btn, "flex-1 justify-center")} onClick={() => addFloat("text")}><Type className="h-3.5 w-3.5" /> Text</button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={addImage} />
            </div>
            <div className="space-y-1">
              {tpl.floats.length === 0 && <p className="text-[11px] text-black/40">Logo, stamp, watermark, QR code, badge… add any image and drag it anywhere on the page.</p>}
              {tpl.floats.map((f) => (
                <div key={f.id} onClick={() => setSel({ kind: "float", id: f.id })} className={rowCls(sel?.kind === "float" && sel.id === f.id, false)}>
                  {f.kind === "image" ? <ImagePlus className="h-3.5 w-3.5 shrink-0" /> : <Type className="h-3.5 w-3.5 shrink-0" />}
                  <span className={cn("flex-1 truncate", !f.visible && "line-through opacity-40")}>{f.kind === "image" ? "Image" : f.text.slice(0, 22) || "Text"}</span>
                  <button aria-label={f.visible ? "Hide" : "Show"} onClick={(e) => { e.stopPropagation(); toggleFloat(f.id); }} className="p-0.5">{f.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                  <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); remove({ kind: "float", id: f.id }); }} className="p-0.5 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* canvas */}
        <div className="overflow-auto bg-[#e5e7eb] p-4 sm:p-6 [scrollbar-gutter:stable]">
          <DesignerCanvas template={tpl} build={build} selection={sel} onSelect={setSel} onFloatChange={setFloat} onBlockProps={setBlockProps} />
          <p className="mt-3 text-center text-[11px] text-black/50">Preview with sample data. Press <b>Preview PDF</b> for the exact print.</p>
        </div>

        {/* inspector */}
        <div className="overflow-y-auto border-t-2 border-black bg-white p-4 lg:border-l-2 lg:border-t-0">
          <Inspector kind={kind} template={tpl} selection={sel} onTheme={setTheme} onBlockProps={setBlockProps} onFloat={setFloat} onRemove={remove} />
        </div>
      </div>
    </div>
  );
}
