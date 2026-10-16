import { cn } from "@/lib/utils";
import { photoUrl, type PhotoKind } from "@/services/api";

const PALETTE = ["#024BAB", "#00C48C", "#FA731C", "#7C3AED", "#0891B2", "#DC2626"];
const colorOf = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
};
const initialsOf = (name: string) =>
  name
    .replace(/^dr\.?\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

/**
 * Round photo with the NestHR employee-list fallback: coloured circle + initials.
 * The photo is fetched from /api/photos/:kind/:id (cached by the browser); anything
 * that goes wrong (no photo, 404, offline) just leaves the initials showing.
 */
export function Avatar({
  kind,
  id,
  name,
  src,
  version,
  size = 28,
  className,
}: {
  kind: PhotoKind;
  id?: string;
  name: string;
  /** A photo already in hand (e.g. the record's own `profileImage`): used instead of fetching. */
  src?: string;
  version?: string | number;
  size?: number;
  className?: string;
}) {
  const url = src || (id ? photoUrl(kind, id, version) : "");

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black font-semibold text-white", className)}
      style={{ width: size, height: size, backgroundColor: colorOf(name || "?"), fontSize: Math.max(9, Math.round(size * 0.36)) }}
      aria-hidden={!name}
      title={name}
    >
      {initialsOf(name)}
      {!!url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            // keep the initials; hide the broken image icon
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

/** Avatar + name on one line, for table cells. */
export function PersonCell({
  kind,
  id,
  name,
  sub,
  src,
  version,
  className,
}: {
  kind: PhotoKind;
  id?: string;
  name: string;
  sub?: string;
  src?: string;
  version?: string | number;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Avatar kind={kind} id={id} name={name} src={src} version={version} />
      <span className="min-w-0">
        <span className="block truncate font-bold leading-tight">{name || "—"}</span>
        {sub && <span className="block truncate text-xs font-normal text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}
