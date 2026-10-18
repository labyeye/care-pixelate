import React from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import {
  BLOCK_LABELS,
  CAN_WIDTH,
  TEMPLATE_VARS_BY_KIND,
  type Block,
  type BlockType,
  type DocKind,
  type Float,
  type InvoiceTemplate,
  type Theme,
} from "@/lib/invoiceTemplate";
import type { Selection } from "./DesignerCanvas";
import { fileToDataUrl } from "./imageUtil";

const label =
  "block text-[10px] font-black uppercase tracking-widest text-black/60 mb-1";
const input =
  "w-full border-2 border-black px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#024BAB]";

type Fx = {
  key: string;
  label: string;
  type: "check" | "text" | "area" | "num" | "color" | "select" | "image";
  min?: number;
  max?: number;
  step?: number;
  options?: [string, string][];
  optional?: boolean;
};

// One table drives every block's settings form.
const FIELDS: Record<BlockType, Fx[]> = {
  title: [
    { key: "text", label: "Title (blank = document name)", type: "text" },
    { key: "subtitle", label: "Small line under title", type: "text" },
    {
      key: "align",
      label: "Align",
      type: "select",
      options: [
        ["left", "Left"],
        ["center", "Centre"],
        ["right", "Right"],
      ],
    },
    { key: "filled", label: "Filled with brand colour", type: "check" },
  ],
  header: [
    {
      key: "layout",
      label: "Layout",
      type: "select",
      options: [
        ["split", "Company beside details"],
        ["stacked", "Company above details"],
      ],
    },
    { key: "swap", label: "Details on the left", type: "check" },
    { key: "showLogo", label: "Show logo", type: "check" },
    {
      key: "logoAlign",
      label: "Logo position",
      type: "select",
      options: [
        ["left", "Left"],
        ["center", "Centre"],
        ["right", "Right"],
      ],
    },
    {
      key: "logoSrc",
      label: "Logo image (blank = clinic logo)",
      type: "image",
      optional: true,
    },
    {
      key: "logoWidth",
      label: "Logo width",
      type: "num",
      min: 40,
      max: 300,
      step: 5,
    },
    {
      key: "logoHeight",
      label: "Logo height",
      type: "num",
      min: 10,
      max: 200,
      step: 5,
    },
    { key: "showAddress", label: "Show address", type: "check" },
    {
      key: "showContact",
      label: "Show email / phone / website",
      type: "check",
    },
    { key: "showTaxIds", label: "Show GSTIN / PAN / state", type: "check" },
    { key: "showMeta", label: "Show invoice no. / dates", type: "check" },
    {
      key: "showPlace",
      label: "Show payment status / supply type",
      type: "check",
    },
  ],
  parties: [
    { key: "label", label: "Heading", type: "text" },
    { key: "showEmail", label: "Show email", type: "check" },
    { key: "showPhone", label: "Show phone", type: "check" },
    { key: "showGst", label: "Show patient ID, age & gender", type: "check" },
    { key: "showDoctor", label: "Show treating doctor", type: "check" },
  ],
  items: [
    { key: "descLabel", label: "Description heading", type: "text" },
    { key: "sno", label: "S.No column", type: "check" },
    { key: "hsn", label: "HSN / SAC column", type: "check" },
    { key: "qty", label: "Quantity column", type: "check" },
    { key: "unit", label: "Unit column", type: "check" },
    { key: "rate", label: "Rate column", type: "check" },
    { key: "discount", label: "Discount column", type: "check" },
    { key: "gst", label: "GST column", type: "check" },
    { key: "amount", label: "Amount column", type: "check" },
    { key: "zebra", label: "Striped rows", type: "check" },
    { key: "accentHeader", label: "Header in brand colour", type: "check" },
    {
      key: "minRows",
      label: "Minimum rows",
      type: "num",
      min: 0,
      max: 20,
      step: 1,
    },
  ],
  words: [
    { key: "label", label: "Label", type: "text" },
    { key: "tint", label: "Grey background", type: "check" },
  ],
  summary: [
    { key: "showPayments", label: "Show payments received", type: "check" },
    { key: "showBank", label: "Show bank details", type: "check" },
    { key: "showTerms", label: "Show terms & notes", type: "check" },
    { key: "termsLabel", label: "Terms heading", type: "text" },
    { key: "showTotals", label: "Show totals", type: "check" },
    {
      key: "totalsSide",
      label: "Totals on",
      type: "select",
      options: [
        ["right", "Right"],
        ["left", "Left"],
      ],
    },
  ],
  taxSummary: [],
  footer: [
    { key: "showDeclaration", label: "Show declaration", type: "check" },
    {
      key: "declaration",
      label: "Declaration text (blank = default)",
      type: "area",
    },
    { key: "showSignature", label: "Show signature", type: "check" },
    {
      key: "signatoryLabel",
      label: "Signature label (name & title come from Invoice & Printing)",
      type: "text",
    },
    {
      key: "signatureSrc",
      label: "Signature / stamp image",
      type: "image",
      optional: true,
    },
    {
      key: "signatureWidth",
      label: "Signature width",
      type: "num",
      min: 30,
      max: 300,
      step: 5,
    },
    {
      key: "signatureHeight",
      label: "Signature height",
      type: "num",
      min: 10,
      max: 150,
      step: 5,
    },
  ],
  note: [
    { key: "text", label: "Text", type: "area" },
    {
      key: "size",
      label: "Font size",
      type: "num",
      min: 6,
      max: 30,
      step: 0.5,
    },
    {
      key: "align",
      label: "Align",
      type: "select",
      options: [
        ["left", "Left"],
        ["center", "Centre"],
        ["right", "Right"],
      ],
    },
    { key: "bold", label: "Bold", type: "check" },
    { key: "color", label: "Text colour", type: "color", optional: true },
    { key: "fill", label: "Background colour", type: "color", optional: true },
  ],
  image: [
    { key: "src", label: "Image", type: "image" },
    { key: "width", label: "Width", type: "num", min: 20, max: 500, step: 5 },
    { key: "height", label: "Height", type: "num", min: 10, max: 400, step: 5 },
    {
      key: "align",
      label: "Position",
      type: "select",
      options: [
        ["left", "Left"],
        ["center", "Centre"],
        ["right", "Right"],
      ],
    },
  ],
  spacer: [
    { key: "height", label: "Height", type: "num", min: 2, max: 200, step: 2 },
  ],
  divider: [
    {
      key: "thickness",
      label: "Thickness",
      type: "num",
      min: 0.5,
      max: 8,
      step: 0.5,
    },
    { key: "color", label: "Colour", type: "color", optional: true },
  ],
  patientInfo: [
    { key: "label", label: "Patient heading", type: "text" },
    { key: "showContact", label: "Show phone & address", type: "check" },
    { key: "showAllergies", label: "Show allergies (in red)", type: "check" },
    { key: "showDoctor", label: "Show consulting doctor", type: "check" },
    { key: "doctorLabel", label: "Doctor heading", type: "text" },
  ],
  vitals: [
    {
      key: "label",
      label: "Heading (shows only the vitals that were recorded)",
      type: "text",
    },
  ],
  clinical: [
    { key: "showComplaints", label: "Show complaints", type: "check" },
    { key: "complaintsLabel", label: "Complaints heading", type: "text" },
    { key: "showDiagnosis", label: "Show diagnosis", type: "check" },
    { key: "diagnosisLabel", label: "Diagnosis heading", type: "text" },
    { key: "showNotes", label: "Show doctor's notes", type: "check" },
    { key: "notesLabel", label: "Notes heading", type: "text" },
  ],
  medicines: [
    { key: "label", label: "Heading (blank = none)", type: "text" },
    { key: "sno", label: "Number column", type: "check" },
    { key: "dose", label: "Dose column", type: "check" },
    { key: "frequency", label: "Frequency column", type: "check" },
    { key: "days", label: "Days column", type: "check" },
    { key: "instructions", label: "Instructions column", type: "check" },
    { key: "zebra", label: "Striped rows", type: "check" },
    { key: "accentHeader", label: "Header in brand colour", type: "check" },
    {
      key: "minRows",
      label: "Minimum rows",
      type: "num",
      min: 0,
      max: 20,
      step: 1,
    },
  ],
  advice: [
    { key: "showAdvice", label: "Show advice", type: "check" },
    { key: "adviceLabel", label: "Advice heading", type: "text" },
    { key: "showFollowUp", label: "Show follow-up date", type: "check" },
    { key: "followUpLabel", label: "Follow-up label", type: "text" },
  ],
};

const Chk = ({
  text,
  value,
  onChange,
}: {
  text: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer py-0.5">
    <input
      type="checkbox"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
      className="w-3.5 h-3.5 accent-[#024BAB]"
    />
    {text}
  </label>
);

function Color({
  text,
  value,
  onChange,
  optional,
}: {
  text: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <div>
      <span className={label}>{text}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-8 border-2 border-black p-0 bg-white cursor-pointer"
        />
        <input
          value={value}
          placeholder={optional ? "theme default" : ""}
          onChange={(e) => onChange(e.target.value)}
          className={input}
          maxLength={7}
        />
        {optional && value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] font-bold underline shrink-0"
          >
            reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Num({
  text,
  value,
  min,
  max,
  step,
  onChange,
}: {
  text: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const set = (v: string) =>
    onChange(Math.min(max, Math.max(min, Number(v) || min)));
  return (
    <div>
      <span className={label}>{text}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => set(e.target.value)}
          className="flex-1 accent-[#024BAB]"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Math.round(value * 100) / 100}
          onChange={(e) => set(e.target.value)}
          className={`${input} !w-16`}
        />
      </div>
    </div>
  );
}

function Select({
  text,
  value,
  options,
  onChange,
}: {
  text: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className={label}>{text}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function ImageField({
  text,
  value,
  onChange,
  optional,
}: {
  text: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const [err, setErr] = React.useState("");
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setErr("");
      onChange(await fileToDataUrl(f));
    } catch (x: any) {
      setErr(x.message || "Could not use that image.");
    }
  };
  return (
    <div>
      <span className={label}>{text}</span>
      <div className="flex items-center gap-2">
        <div className="w-14 h-14 border-2 border-black bg-[repeating-conic-gradient(#eee_0%_25%,#fff_0%_50%)] bg-[length:10px_10px] flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            <img src={value} className="max-w-full max-h-full object-contain" />
          ) : (
            <ImageIcon className="w-5 h-5 text-black/30" />
          )}
        </div>
        <label className="cursor-pointer px-3 py-1.5 text-xs font-bold border-2 border-black bg-white hover:bg-[#024BAB]/10">
          {value ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            onChange={pick}
            className="hidden"
          />
        </label>
        {value && optional ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[10px] font-bold underline"
          >
            remove
          </button>
        ) : null}
      </div>
      {err ? (
        <p className="text-[11px] text-red-600 font-bold mt-1">{err}</p>
      ) : null}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-black">
      <div className="w-1 h-4 bg-[#024BAB]" />
      <p className="text-xs font-black uppercase tracking-widest">{children}</p>
    </div>
  );
}

const VarsHint = ({ kind }: { kind: DocKind }) => (
  <p className="text-[10px] text-black/50 leading-snug">
    Variables you can type:{" "}
    {TEMPLATE_VARS_BY_KIND[kind].map((v) => `{{${v}}}`).join("  ")}
  </p>
);

export function Inspector({
  template,
  selection,
  onTheme,
  onBlockProps,
  onFloat,
  onRemove,
  kind = "invoice",
}: {
  kind?: DocKind;
  template: InvoiceTemplate;
  selection: Selection;
  onTheme: (patch: Partial<Theme>, group: string) => void;
  onBlockProps: (id: string, patch: Record<string, any>, group: string) => void;
  onFloat: (id: string, patch: Partial<Float>, group: string) => void;
  onRemove: (s: NonNullable<Selection>) => void;
}) {
  const block: Block | undefined =
    selection?.kind === "block"
      ? template.blocks.find((b) => b.id === selection.id)
      : undefined;
  const float: Float | undefined =
    selection?.kind === "float"
      ? template.floats.find((f) => f.id === selection.id)
      : undefined;

  if (block) {
    const g = (k: string) => `b-${block.id}-${k}`;
    return (
      <div className="space-y-3">
        <Heading>{BLOCK_LABELS[block.type]}</Heading>
        {block.type === "header" && (
          <p className="text-[10px] text-black/50">
            Logo defaults to your clinic logo (Settings &gt; Branding); upload
            another here to override. Clinic details, bank details, terms and
            signatory come from General Info, Bank Details and Invoice &amp;
            Printing.
          </p>
        )}
        <div className="border-2 border-dashed border-black/30 p-2 space-y-2">
          {CAN_WIDTH(block.type) && (
            <Num
              text="Width % (under 100 sits beside the next block)"
              value={Number(block.props.w) || 100}
              min={10}
              max={100}
              step={5}
              onChange={(v) => onBlockProps(block.id, { w: v }, g("w"))}
            />
          )}
          <Num
            text="Minimum height (0 = fit content)"
            value={Number(block.props.h) || 0}
            min={0}
            max={800}
            step={5}
            onChange={(v) => onBlockProps(block.id, { h: v }, g("h"))}
          />
          <p className="text-[10px] text-black/50">
            Or drag the blue corner of the selected block on the page. Blocks in
            a row share the 100%: 50 + 50, or 30 + 70, or 3 x 33.
          </p>
        </div>
        {FIELDS[block.type].length === 0 && (
          <p className="text-xs text-black/50">
            Nothing to set here. It shows the GST table when the invoice has
            tax.
          </p>
        )}
        {FIELDS[block.type].map((f) => {
          const v = block.props[f.key];
          const set = (val: any) =>
            onBlockProps(block.id, { [f.key]: val }, g(f.key));
          switch (f.type) {
            case "check":
              return (
                <Chk key={f.key} text={f.label} value={v} onChange={set} />
              );
            case "text":
              return (
                <div key={f.key}>
                  <span className={label}>{f.label}</span>
                  <input
                    value={v ?? ""}
                    maxLength={200}
                    onChange={(e) => set(e.target.value)}
                    className={input}
                  />
                </div>
              );
            case "area":
              return (
                <div key={f.key}>
                  <span className={label}>{f.label}</span>
                  <textarea
                    value={v ?? ""}
                    rows={3}
                    maxLength={1000}
                    onChange={(e) => set(e.target.value)}
                    className={input}
                  />
                </div>
              );
            case "num":
              return (
                <Num
                  key={f.key}
                  text={f.label}
                  value={Number(v)}
                  min={f.min!}
                  max={f.max!}
                  step={f.step!}
                  onChange={set}
                />
              );
            case "color":
              return (
                <Color
                  key={f.key}
                  text={f.label}
                  value={v ?? ""}
                  optional={f.optional}
                  onChange={set}
                />
              );
            case "select":
              return (
                <Select
                  key={f.key}
                  text={f.label}
                  value={v}
                  options={f.options!}
                  onChange={set}
                />
              );
            case "image":
              return (
                <ImageField
                  key={f.key}
                  text={f.label}
                  value={v ?? ""}
                  optional={f.optional}
                  onChange={set}
                />
              );
          }
        })}
        {(block.type === "note" ||
          block.type === "footer" ||
          block.type === "title" ||
          block.type === "summary") && <VarsHint kind={kind} />}
        <button
          type="button"
          onClick={() => onRemove({ kind: "block", id: block.id })}
          className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline pt-2"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove this block
        </button>
      </div>
    );
  }

  if (float) {
    const g = (k: string) => `f-${float.id}-${k}`;
    const set = (k: keyof Float) => (val: any) =>
      onFloat(float.id, { [k]: val } as Partial<Float>, g(k));
    return (
      <div className="space-y-3">
        <Heading>
          {float.kind === "image" ? "Image on page" : "Text on page"}
        </Heading>
        <p className="text-[10px] text-black/50">
          Drag it on the page to move; drag the blue corner to resize. Arrow
          keys nudge it.
        </p>
        {float.kind === "image" ? (
          <ImageField text="Image" value={float.src} onChange={set("src")} />
        ) : (
          <>
            <div>
              <span className={label}>Text</span>
              <textarea
                value={float.text}
                rows={3}
                maxLength={500}
                onChange={(e) => set("text")(e.target.value)}
                className={input}
              />
            </div>
            <VarsHint kind={kind} />
            <Num
              text="Font size"
              value={float.size}
              min={6}
              max={80}
              step={1}
              onChange={set("size")}
            />
            <Color text="Colour" value={float.color} onChange={set("color")} />
            <Chk text="Bold" value={float.bold} onChange={set("bold")} />
            <Select
              text="Align"
              value={float.align}
              options={[
                ["left", "Left"],
                ["center", "Centre"],
                ["right", "Right"],
              ]}
              onChange={set("align")}
            />
          </>
        )}
        <Num
          text="Opacity %"
          value={Math.round(float.opacity * 100)}
          min={5}
          max={100}
          step={5}
          onChange={(v) => set("opacity")(v / 100)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Num
            text="X %"
            value={float.x}
            min={0}
            max={100}
            step={0.5}
            onChange={set("x")}
          />
          <Num
            text="Y %"
            value={float.y}
            min={0}
            max={100}
            step={0.5}
            onChange={set("y")}
          />
          <Num
            text="Width %"
            value={float.w}
            min={2}
            max={100}
            step={0.5}
            onChange={set("w")}
          />
          <Num
            text="Height %"
            value={float.h}
            min={1}
            max={100}
            step={0.5}
            onChange={set("h")}
          />
        </div>
        <Chk
          text="Behind the invoice (watermark)"
          value={float.back}
          onChange={set("back")}
        />
        <Chk
          text="Repeat on every page"
          value={float.allPages}
          onChange={set("allPages")}
        />
        <button
          type="button"
          onClick={() => onRemove({ kind: "float", id: float.id })}
          className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline pt-2"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete this element
        </button>
      </div>
    );
  }

  const T = template.theme;
  const t = (k: keyof Theme) => (val: any) =>
    onTheme({ [k]: val } as Partial<Theme>, `t-${k}`);
  return (
    <div className="space-y-3">
      <Heading>Page &amp; theme</Heading>
      <p className="text-[10px] text-black/50">
        Click any part of the invoice, or an item in the list, to edit it.
      </p>
      <Color text="Brand colour" value={T.primary} onChange={t("primary")} />
      <Color text="Text colour" value={T.text} onChange={t("text")} />
      <Color text="Secondary text" value={T.muted} onChange={t("muted")} />
      <Color
        text="Border / line colour"
        value={T.border}
        onChange={t("border")}
      />
      <Color
        text="Table header background"
        value={T.headerBg}
        onChange={t("headerBg")}
      />
      <Select
        text="Font"
        value={T.font}
        options={[
          ["Helvetica", "Sans-serif (Helvetica)"],
          ["Times", "Serif (Times)"],
          ["Courier", "Typewriter (Courier)"],
        ]}
        onChange={t("font")}
      />
      <Num
        text="Text size"
        value={Math.round(T.scale * 100)}
        min={80}
        max={130}
        step={5}
        onChange={(v) => t("scale")(v / 100)}
      />
      <Select
        text="Borders"
        value={T.borders}
        options={[
          ["full", "Boxed with dividers"],
          ["lines", "Dividers only"],
          ["none", "None"],
        ]}
        onChange={t("borders")}
      />
      <Num
        text="Page margin"
        value={T.margin}
        min={8}
        max={60}
        step={2}
        onChange={t("margin")}
      />
    </div>
  );
}
