import React from "react";
import type { SheetCompany } from "@/lib/invoiceSheetData";
import {
  blockH,
  blockW,
  fillVars,
  groupRows,
  isPlainRow,
  PAGE_H,
  PAGE_W,
  type Block,
  type Float,
  type InvoiceTemplate,
  type VarCtx,
} from "@/lib/invoiceTemplate";

export const FAMILY = {
  Helvetica: "Helvetica, Arial, sans-serif",
  Times: "'Times New Roman', Times, serif",
  Courier: "'Courier New', monospace",
} as const;
export const JUSTIFY = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

export const dateStr = (d: Date) =>
  d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export interface ImgBoxArgs {
  src: string;
  w: number;
  h: number;
  on: boolean;
  onResize: (w: number, h: number) => void;
  style?: React.CSSProperties;
}

/** What the designer canvas and the print page need from any document renderer (invoice, consultation…). */
export interface SheetApi {
  renderBlock: (b: Block) => React.ReactNode;
  renderStaticFloat: (f: Float) => React.ReactNode;
  ctx: VarCtx;
  px: (pt: number) => number;
  H: (w: number) => string;
  V: (w: number) => string;
  full: boolean;
}

/** Options every renderer takes; the designer adds the interactive hooks. */
export interface BuildOpts {
  k: number; // CSS px per pt: 96/72 for print, smaller for the designer preview
  imgBox?: (a: ImgBoxArgs) => React.ReactNode; // designer only: an image that can be resized in place
  isSel?: (b: Block) => boolean;
  onBlockProps?: (
    id: string,
    patch: Record<string, any>,
    group: string,
  ) => void;
}

export interface CoreOpts extends BuildOpts {
  template: InvoiceTemplate;
  logo?: string;
  company: SheetCompany;
  title: string; // default title-bar text
  meta: (p: Record<string, any>) => [string, string][]; // rows of the header's right-hand details box
  vars: VarCtx;
  signatory: { name?: string; title?: string };
  declaration: string; // default declaration text of the footer block
}

/**
 * The blocks every printed document shares (title bar, clinic header, declaration + signature, free text,
 * image, spacer, divider) plus the style helpers the document-specific blocks are built from.
 */
export function makeCore(o: CoreOpts) {
  const { template, k, logo, company: co } = o;
  const T = template.theme;
  const px = (pt: number) => pt * k;
  const full = T.borders === "full";
  const lines = T.borders !== "none";
  const H = (w: number) => (lines ? `${px(w)}px solid ${T.border}` : "none");
  const V = (w: number) => (full ? `${px(w)}px solid ${T.border}` : "none");
  const soft = `${px(0.5)}px solid #ddd`;
  const fs = (n: number) => px(n * T.scale);
  const bold = 700;
  const text = (
    size: number,
    extra: React.CSSProperties = {},
  ): React.CSSProperties => ({ fontSize: fs(size), color: T.text, ...extra });

  const img = (a: ImgBoxArgs) =>
    o.imgBox ? (
      o.imgBox(a)
    ) : (
      <div style={{ width: px(a.w), height: px(a.h), ...a.style }}>
        <img
          src={a.src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>
    );
  const on = (b: Block) => !!o.isSel?.(b);
  const setProps = (b: Block, patch: Record<string, any>) =>
    o.onBlockProps?.(b.id, patch, `img-${b.id}`);
  const sec = (t: string) => (
    <div
      style={text(7.5, {
        fontWeight: bold,
        color: T.muted,
        textTransform: "uppercase",
        marginBottom: px(4),
        letterSpacing: px(0.5),
      })}
    >
      {t}
    </div>
  );

  const renderCommon = (b: Block): React.ReactNode | undefined => {
    const p = b.props;
    switch (b.type) {
      case "title":
        return (
          <div
            style={{
              borderBottom: H(1.5),
              padding: `${px(5)}px ${px(8)}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: JUSTIFY[p.align as keyof typeof JUSTIFY],
              background: p.filled ? T.primary : undefined,
            }}
          >
            <div
              style={text(13, {
                fontWeight: bold,
                letterSpacing: px(2),
                color: p.filled ? "#fff" : T.text,
              })}
            >
              {fillVars(p.text, o.vars) || o.title}
            </div>
            {p.subtitle ? (
              <div
                style={text(7, {
                  color: p.filled ? "#fff" : T.muted,
                  marginTop: px(1),
                })}
              >
                {fillVars(p.subtitle, o.vars)}
              </div>
            ) : null}
          </div>
        );

      case "header": {
        const stacked = p.layout === "stacked";
        const line = (t: string, extra: React.CSSProperties = {}) => (
          <div
            style={text(8, { color: T.muted, marginBottom: px(1), ...extra })}
          >
            {t}
          </div>
        );
        return (
          <div
            style={{
              display: "flex",
              flexDirection: stacked
                ? "column"
                : p.swap
                  ? "row-reverse"
                  : "row",
              borderBottom: H(1),
            }}
          >
            <div
              style={{
                flex: 1,
                padding: px(8),
                borderRight: !stacked && !p.swap ? V(1) : undefined,
                borderLeft: !stacked && p.swap ? V(1) : undefined,
              }}
            >
              {p.showLogo && (p.logoSrc || logo)
                ? img({
                    src: p.logoSrc || logo!,
                    w: p.logoWidth,
                    h: p.logoHeight || p.logoWidth / 3,
                    on: on(b),
                    onResize: (w, h) =>
                      setProps(b, { logoWidth: w, logoHeight: h }),
                    style: {
                      marginBottom: px(4),
                      marginLeft: p.logoAlign === "left" ? 0 : "auto",
                      marginRight: p.logoAlign === "right" ? 0 : "auto",
                    },
                  })
                : null}
              {line(co.name, {
                fontWeight: bold,
                fontSize: fs(9),
                color: T.text,
              })}
              {p.showAddress &&
                co.addressLines.map((l, i) => (
                  <React.Fragment key={i}>{line(l)}</React.Fragment>
                ))}
              {p.showContact && (co.email || co.phone)
                ? line(
                    [
                      co.email && `Email: ${co.email}`,
                      co.phone && `Phone: ${co.phone}`,
                    ]
                      .filter(Boolean)
                      .join(" | "),
                  )
                : null}
              {p.showContact && co.website
                ? line(`Website: ${co.website}`)
                : null}
              {p.showTaxIds && co.gst
                ? line(`GSTIN: ${co.gst}`, {
                    fontWeight: bold,
                    color: T.text,
                    marginTop: px(3),
                  })
                : null}
              {p.showTaxIds && (co.pan || co.state)
                ? line(
                    [
                      co.pan && `PAN: ${co.pan}`,
                      co.state && `State: ${co.state}`,
                    ]
                      .filter(Boolean)
                      .join(" | "),
                  )
                : null}
            </div>
            {p.showMeta ? (
              <div
                style={{
                  width: stacked ? "auto" : px(195),
                  padding: px(8),
                  borderTop: stacked ? V(1) : undefined,
                }}
              >
                {o.meta(p).map(([label, value]) => (
                  <div
                    key={label}
                    style={{ display: "flex", marginBottom: px(4) }}
                  >
                    <div
                      style={text(8, {
                        width: px(80),
                        fontWeight: bold,
                        color: T.muted,
                      })}
                    >
                      {label}
                    </div>
                    <div style={text(8, { flex: 1 })}>: {value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      }

      case "footer":
        return (
          <div
            style={{
              display: "flex",
              borderBottom: H(1),
              breakInside: "avoid",
            }}
          >
            {p.showDeclaration ? (
              <div
                style={{
                  flex: 1,
                  padding: px(8),
                  borderRight: p.showSignature ? V(1) : undefined,
                }}
              >
                {sec("Declaration")}
                <div
                  style={text(7, {
                    color: T.muted,
                    lineHeight: 1.2,
                    whiteSpace: "pre-line",
                  })}
                >
                  {p.declaration
                    ? fillVars(p.declaration, o.vars)
                    : o.declaration}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {p.showSignature ? (
              <div
                style={{
                  width: px(210),
                  padding: px(8),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <div style={text(8, { color: T.muted })}>For {co.name}</div>
                {p.signatureSrc
                  ? img({
                      src: p.signatureSrc,
                      w: p.signatureWidth,
                      h: p.signatureHeight,
                      on: on(b),
                      onResize: (w, h) =>
                        setProps(b, { signatureWidth: w, signatureHeight: h }),
                      style: { marginTop: px(4), marginBottom: px(-20) },
                    })
                  : null}
                <div
                  style={{
                    width: px(150),
                    borderTop: `${px(1)}px solid ${T.border}`,
                    marginTop: px(32),
                    marginBottom: px(4),
                  }}
                />
                <div style={text(8, { fontWeight: bold })}>
                  {p.signatoryLabel}
                </div>
                {o.signatory.name ? (
                  <div style={text(7.5, { color: T.muted })}>
                    {o.signatory.name}
                    {o.signatory.title ? `, ${o.signatory.title}` : ""}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );

      case "note":
        return (
          <div
            style={{
              padding: `${px(5)}px ${px(8)}px`,
              textAlign: p.align,
              background: p.fill || undefined,
              fontSize: fs(Number(p.size) || 7.5),
              color: p.color || T.muted,
              fontWeight: p.bold ? bold : 400,
              whiteSpace: "pre-line",
            }}
          >
            {fillVars(p.text, o.vars)}
          </div>
        );

      case "image":
        return p.src ? (
          <div
            style={{
              padding: px(6),
              display: "flex",
              justifyContent: JUSTIFY[p.align as keyof typeof JUSTIFY],
            }}
          >
            {img({
              src: p.src,
              w: p.width,
              h: p.height,
              on: on(b),
              onResize: (w, h) => setProps(b, { width: w, height: h }),
            })}
          </div>
        ) : (
          <div
            style={{
              padding: px(6),
              fontSize: 11,
              color: "#999",
              textAlign: "center",
              border: "1px dashed #bbb",
              margin: px(6),
            }}
          >
            Image block: pick a file in the panel
          </div>
        );

      case "spacer":
        return <div style={{ height: px(Number(p.height) || 0) }} />;

      case "divider":
        return (
          <div
            style={{
              borderBottom: `${px(Number(p.thickness) || 1)}px solid ${p.color || T.border}`,
            }}
          />
        );
    }
    return undefined;
  };

  // Non-interactive float (print); the designer draws its own draggable ones.
  const renderStaticFloat = (f: Float) => (
    <div
      key={f.id}
      style={{
        position: "absolute",
        left: `${f.x}%`,
        top: `${f.y}%`,
        width: `${f.w}%`,
        height: `${f.h}%`,
        opacity: f.opacity,
        overflow: "hidden",
        zIndex: f.back ? 0 : 20,
      }}
    >
      {f.kind === "image" ? (
        f.src ? (
          <img
            src={f.src}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : null
      ) : (
        <div
          style={{
            fontSize: px(f.size),
            color: f.color,
            fontWeight: f.bold ? 700 : 400,
            textAlign: f.align,
            whiteSpace: "pre-wrap",
            lineHeight: 1.2,
          }}
        >
          {fillVars(f.text, o.vars)}
        </div>
      )}
    </div>
  );

  return {
    T,
    px,
    full,
    H,
    V,
    soft,
    fs,
    bold,
    text,
    sec,
    renderCommon,
    renderStaticFloat,
    ctx: o.vars,
  };
}

/** The printable A4 page for any document renderer. */
export function SheetPage({
  template,
  sheet,
}: {
  template: InvoiceTemplate;
  sheet: SheetApi;
}) {
  const T = template.theme;
  const floats = template.floats.filter((f) => f.visible);
  const k = sheet.px(1);
  return (
    <div
      style={{
        position: "relative",
        width: PAGE_W * k,
        minHeight: PAGE_H * k,
        background: "#fff",
        fontFamily: FAMILY[T.font],
        color: T.text,
        boxSizing: "border-box",
        padding: `${sheet.px(T.margin * 0.8)}px ${sheet.px(T.margin)}px`,
      }}
    >
      {floats.filter((f) => f.back).map(sheet.renderStaticFloat)}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          border: sheet.full ? `${sheet.px(1.5)}px solid ${T.border}` : "none",
        }}
      >
        {groupRows(template.blocks.filter((b) => b.visible)).map((row) =>
          isPlainRow(row) ? (
            <React.Fragment key={row[0].id}>
              {sheet.renderBlock(row[0])}
            </React.Fragment>
          ) : (
            <div
              key={row[0].id}
              style={{
                display: "flex",
                alignItems: "stretch",
                borderBottom: sheet.H(1),
              }}
            >
              {row.map((b, i) => {
                const node = sheet.renderBlock(b);
                return (
                  <div
                    key={b.id}
                    style={{
                      width: `${blockW(b)}%`,
                      flex: "none",
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      borderRight: i < row.length - 1 ? sheet.V(1) : undefined,
                      minHeight: sheet.px(blockH(b)) || undefined,
                    }}
                  >
                    {React.isValidElement<{ style?: React.CSSProperties }>(node)
                      ? React.cloneElement(node, {
                          style: {
                            ...node.props.style,
                            flexGrow: 1,
                            borderBottom: "none",
                          },
                        })
                      : node}
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>
      {floats.filter((f) => !f.back).map(sheet.renderStaticFloat)}
    </div>
  );
}
