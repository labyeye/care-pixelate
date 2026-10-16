import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CheckCircle, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-tab form modal — same layout as the NestHR employee form:
 * blue header with avatar, numbered uppercase tabs, scrolling body,
 * Previous / progress dots / Next-or-Submit footer.
 */

export const inputCls =
  "border-2 border-black w-full px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-[#024BAB]/30";

export function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-bold text-black">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}

// Downscale to a small JPEG data URL so the photo fits in the JSON body / document.
const toThumb = (file: File, size = 256) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = url;
  });

export function PhotoField({
  value,
  initial,
  onChange,
  onError,
}: {
  value: string;
  initial: string;
  onChange: (dataUrl: string) => void;
  onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return onError("Please choose an image file");
    if (f.size > 10 * 1024 * 1024) return onError("Image must be under 10MB");
    try {
      onChange(await toThumb(f));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not read that image");
    }
  };

  return (
    <div className="flex items-start gap-4 border-2 border-black bg-[#F8FAFF] p-4">
      <div className="relative shrink-0">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden border-2 border-black bg-[#024BAB]">
          {value ? (
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-white">{initial?.[0]?.toUpperCase() || "?"}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          aria-label="Upload photo"
          className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center border-2 border-black bg-[#024BAB] hover:bg-[#01368A]"
        >
          <Upload className="h-3.5 w-3.5 text-white" />
        </button>
        <input ref={ref} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
      <div className="flex-1">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-black">Profile Photo</p>
        <p className="text-xs text-muted-foreground">Click the upload icon. PNG or JPG — resized automatically.</p>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mt-2 flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"
          >
            <X className="h-3 w-3" /> Remove photo
          </button>
        )}
      </div>
    </div>
  );
}

interface WizardModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Shown under the title (e.g. the name typed so far). */
  subtitle?: string;
  avatar?: string;
  avatarFallback?: string;
  tabs: string[];
  tab: number;
  onTab: (i: number) => void;
  /** Called when "Next" is pressed; return false to stay on this tab. */
  onNext?: (from: number) => boolean;
  onSubmit: () => void;
  submitLabel: string;
  saving?: boolean;
  children: ReactNode;
}

export function WizardModal({
  open,
  onClose,
  title,
  subtitle,
  avatar,
  avatarFallback,
  tabs,
  tab,
  onTab,
  onNext,
  onSubmit,
  submitLabel,
  saving,
  children,
}: WizardModalProps) {
  if (!open) return null;
  const last = tab === tabs.length - 1;

  // Portal to body so a transformed/animated page wrapper can't offset the fixed overlay.
  return createPortal(
    <div className="nb-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="nb-modal flex max-h-[95vh] w-full max-w-3xl flex-col border-2 border-black bg-white">
        <div className="flex items-center justify-between border-b-2 border-black bg-[#024BAB] px-6 py-4">
          <div className="flex items-center gap-3">
            {avatar ? (
              <img src={avatar} alt="avatar" className="h-10 w-10 rounded-full border-2 border-white object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-white/20 font-bold text-white">
                {avatarFallback?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{title}</h3>
              {subtitle && <p className="text-xs text-white/70">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-white hover:text-white/70">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b-2 border-black">
          {tabs.map((t, idx) => (
            <button
              key={t}
              type="button"
              onClick={() => onTab(idx)}
              className={cn(
                "flex-1 border-r-2 border-black py-3 text-xs font-bold uppercase tracking-wider transition-colors last:border-r-0",
                tab === idx ? "bg-[#024BAB] text-white" : "bg-white text-black hover:bg-[#024BAB]/5",
              )}
            >
              <span
                className={cn(
                  "mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  tab === idx ? "bg-white text-[#024BAB]" : "bg-black/10 text-black",
                )}
              >
                {idx + 1}
              </span>
              <span className="hidden sm:inline">{t}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        <div className="flex items-center justify-between border-t-2 border-black bg-[#F8FAFF] px-6 py-4">
          <button
            type="button"
            onClick={() => onTab(Math.max(0, tab - 1))}
            disabled={tab === 0}
            className="flex items-center gap-2 border-2 border-black bg-white px-4 py-2 text-sm font-bold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>

          <div className="flex gap-1.5">
            {tabs.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to step ${idx + 1}`}
                onClick={() => onTab(idx)}
                className={cn(
                  "h-2 rounded-full border border-black transition-all",
                  tab === idx ? "w-6 bg-[#024BAB]" : "w-2 bg-white",
                )}
              />
            ))}
          </div>

          {last ? (
            <button
              type="button"
              disabled={saving}
              onClick={onSubmit}
              className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-6 py-2 text-sm font-bold text-white hover:bg-[#01368A] disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              {saving ? "Saving..." : submitLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!onNext || onNext(tab)) onTab(Math.min(tabs.length - 1, tab + 1));
              }}
              className="flex items-center gap-2 border-2 border-black bg-[#024BAB] px-4 py-2 text-sm font-bold text-white hover:bg-[#01368A]"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
