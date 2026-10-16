import React, { useLayoutEffect, useRef, useState } from "react";
import { FAMILY, type BuildOpts, type ImgBoxArgs, type SheetApi } from "@/components/invoice/sheetCore";
import { blockH, blockW, CAN_WIDTH, fillVars, groupRows, isPlainRow, PAGE_H, PAGE_W, type Block, type Float, type InvoiceTemplate } from "@/lib/invoiceTemplate";

export type Selection = { kind: "block" | "float"; id: string } | null;

// A live, clickable A4 page. The blocks come from the same renderer the printed document uses
// (components/invoice/InvoiceSheet or ConsultationSheet, passed in as `build`), so what you see here is
// what prints; this file only adds selecting, dragging and resizing on top.
export function DesignerCanvas({
  template,
  build,
  selection,
  onSelect,
  onFloatChange,
  onBlockProps,
}: {
  template: InvoiceTemplate;
  build: (o: BuildOpts) => SheetApi;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onFloatChange: (id: string, patch: Partial<Float>, group: string) => void;
  onBlockProps: (id: string, patch: Record<string, any>, group: string) => void;
}) {
  const T = template.theme;
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Whole-pixel steps with a small dead zone: a 1px flip (a scrollbar appearing or the sub-pixel rounding
    // of the layout) must not resize the page, which would move the scrollbar again and loop (the "jitter").
    const ro = new ResizeObserver(() => {
      const next = Math.max(320, Math.min(820, Math.floor(el.clientWidth) - 8));
      setWidth((cur) => (Math.abs(cur - next) < 3 ? cur : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = width / PAGE_W;
  const px = (pt: number) => pt * k;
  const height = px(PAGE_H);

  useLayoutEffect(() => {
    const over = (contentRef.current?.offsetHeight ?? 0) + px(T.margin * 1.6) > height + 1;
    setOverflow((cur) => (cur === over ? cur : over));
  });

  const isSel = (b: Block) => selection?.kind === "block" && selection.id === b.id;

  // An image inside a section. While its section is selected, the blue corner resizes it (in pt,
  // clamped like the inspector sliders); replace / remove it from the panel on the right.
  const imgDrag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const imgBox = ({ src, w, h, on, onResize, style }: ImgBoxArgs) => (
    <div style={{ position: "relative", width: px(w), height: px(h), ...style }}>
      <img src={src} draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      {on && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            imgDrag.current = { x: e.clientX, y: e.clientY, w, h };
          }}
          onPointerMove={(e) => {
            const s = imgDrag.current;
            if (!s) return;
            const cl = (v: number) => Math.round(Math.min(500, Math.max(10, v)));
            onResize(cl(s.w + (e.clientX - s.x) / k), cl(s.h + (e.clientY - s.y) / k));
          }}
          onPointerUp={() => (imgDrag.current = null)}
          style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, background: "#2563eb", border: "2px solid #fff", cursor: "nwse-resize", borderRadius: 2, touchAction: "none" }}
        />
      )}
    </div>
  );

  const sheet = build({ k, imgBox, isSel, onBlockProps });
  const { H, V, full, ctx } = sheet;

  // Floats: drag to move, corner handle to resize. Percent of the page, like the print.
  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; f: Float } | null>(null);

  const onDown = (e: React.PointerEvent, f: Float, mode: "move" | "resize") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, sx: e.clientX, sy: e.clientY, f };
    onSelect({ kind: "float", id: f.id });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ((e.clientX - d.sx) / width) * 100;
    const dy = ((e.clientY - d.sy) / height) * 100;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const patch: Partial<Float> =
      d.mode === "move"
        ? { x: clamp(d.f.x + dx, 0, 100 - d.f.w), y: clamp(d.f.y + dy, 0, 100 - d.f.h) }
        : { w: clamp(d.f.w + dx, 2, 100 - d.f.x), h: clamp(d.f.h + dy, 1, 100 - d.f.y) };
    onFloatChange(d.id, patch, `drag-${d.id}`);
  };
  const onUp = () => {
    drag.current = null;
  };

  const renderFloat = (f: Float) => {
    const sel = selection?.kind === "float" && selection.id === f.id;
    return (
      <div
        key={f.id}
        onPointerDown={(e) => onDown(e, f, "move")}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%`, cursor: "move", touchAction: "none", outline: sel ? "2px solid #2563eb" : "1px dashed rgba(37,99,235,.35)", zIndex: sel ? 30 : f.back ? 0 : 20, userSelect: "none" }}
      >
        <div style={{ width: "100%", height: "100%", opacity: f.opacity, overflow: "hidden" }}>
          {f.kind === "image" ? (
            f.src ? <img src={f.src} draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} /> : <div style={{ fontSize: 10, color: "#999", padding: 4 }}>No image</div>
          ) : (
            <div style={{ fontSize: px(f.size), color: f.color, fontWeight: f.bold ? 700 : 400, textAlign: f.align, whiteSpace: "pre-wrap", lineHeight: 1.2 }}>{fillVars(f.text, ctx)}</div>
          )}
        </div>
        {sel && <div onPointerDown={(e) => onDown(e, f, "resize")} onPointerMove={onMove} onPointerUp={onUp} style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, background: "#2563eb", border: "2px solid #fff", cursor: "nwse-resize", borderRadius: 2 }} />}
      </div>
    );
  };

  // Drag the blue corner of the selected block: sideways = width (% of the row), down/up = height.
  const sizeDrag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Clickable wrapper around one block. Inside a shared row the block fills the row's height and
  // drops its own bottom line (the row draws one), so blocks of different heights still line up.
  const wrapBlock = (b: Block, inRow = false) => {
    const sel = isSel(b);
    let node = sheet.renderBlock(b);
    if (inRow && React.isValidElement<{ style?: React.CSSProperties }>(node)) node = React.cloneElement(node, { style: { ...node.props.style, flexGrow: 1, borderBottom: "none" } });
    const alone = !inRow && isPlainRow([b]);
    return (
      <div
        key={b.id}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect({ kind: "block", id: b.id });
        }}
        style={{ pointerEvents: "auto", cursor: "pointer", outline: sel ? "2px solid #2563eb" : undefined, outlineOffset: -2, position: "relative", ...(inRow ? { flex: 1, display: "flex", flexDirection: "column" } : {}) }}
        className={sel ? "" : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-400 hover:-outline-offset-1"}
      >
        {node}
        {sel && (
          <div
            title="Drag to resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              sizeDrag.current = { x: e.clientX, y: e.clientY, w: blockW(b), h: (e.currentTarget.parentElement?.offsetHeight ?? 0) / k };
            }}
            onPointerMove={(e) => {
              const d = sizeDrag.current;
              const inner = contentRef.current?.clientWidth;
              if (!d || !inner) return;
              const patch: Record<string, number> = { h: Math.round(Math.min(800, Math.max(0, d.h + (e.clientY - d.y) / k))) };
              if (CAN_WIDTH(b.type)) patch.w = Math.round(Math.min(100, Math.max(10, d.w + ((e.clientX - d.x) / inner) * 100)));
              onBlockProps(b.id, patch, `size-${b.id}`);
            }}
            onPointerUp={() => (sizeDrag.current = null)}
            style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, background: "#2563eb", border: "2px solid #fff", cursor: alone && !CAN_WIDTH(b.type) ? "ns-resize" : "nwse-resize", borderRadius: 2, touchAction: "none", zIndex: 40 }}
          />
        )}
      </div>
    );
  };

  const floats = template.floats.filter((f) => f.visible);
  return (
    <div ref={wrapRef} className="flex w-full flex-col items-center">
      <div
        onPointerDown={() => onSelect(null)}
        style={{ position: "relative", width, height, background: "#fff", boxShadow: "0 2px 16px rgba(0,0,0,.25)", overflow: "hidden", fontFamily: FAMILY[T.font], color: T.text }}
      >
        {floats.filter((f) => f.back).map(renderFloat)}
        <div style={{ position: "absolute", inset: 0, padding: `${px(T.margin * 0.8)}px ${px(T.margin)}px`, zIndex: 10, pointerEvents: "none" }}>
          <div ref={contentRef} style={{ border: full ? `${px(1.5)}px solid ${T.border}` : "none" }}>
            {groupRows(template.blocks.filter((b) => b.visible)).map((row) =>
              isPlainRow(row) ? (
                wrapBlock(row[0])
              ) : (
                <div key={row[0].id} style={{ display: "flex", alignItems: "stretch", borderBottom: H(1) }}>
                  {row.map((b, i) => (
                    <div key={b.id} style={{ width: `${blockW(b)}%`, flex: "none", minWidth: 0, display: "flex", flexDirection: "column", borderRight: i < row.length - 1 ? V(1) : undefined, minHeight: px(blockH(b)) || undefined }}>
                      {wrapBlock(b, true)}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        </div>
        {floats.filter((f) => !f.back).map(renderFloat)}
      </div>
      {overflow && <p className="mt-2 text-[11px] font-bold text-amber-700">Content is longer than one page here. The rest continues on page 2 when printed.</p>}
    </div>
  );
}
