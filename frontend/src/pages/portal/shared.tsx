import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { portalAPI } from "@/services/api";
import type { Doctor, Patient } from "@/types";

export const useProfiles = () => useQuery({ queryKey: ["portal", "profiles"], queryFn: portalAPI.profiles });

/** Populated refs come back as objects; an unpopulated id is a string. */
export const nameOf = (v: unknown) => (v && typeof v === "object" ? (v as Patient | Doctor).name : "") || "";
export const doctorLabel = (v: unknown) => {
  const n = nameOf(v);
  return n ? `Dr. ${n.replace(/^Dr\.?\s+/i, "")}` : "—";
};
export const specialityOf = (v: unknown) => (v && typeof v === "object" ? ((v as Doctor).professionalDetails?.specializations ?? []).join(", ") : "");

export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const inr = (n?: number | null) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

/** Top-of-page description line used by every portal page. */
export const Intro = ({ children }: { children: ReactNode }) => <p className="mb-4 text-muted-foreground">{children}</p>;

export const Empty = ({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) => (
  <div className="flex flex-col items-center gap-3 border-2 bg-white p-12 text-center">
    <Icon className="h-10 w-10 text-black/20" />
    <p className="font-semibold text-black">{text}</p>
  </div>
);

/** "Whose record is this" chip — only shown when the account manages more than one profile. */
export const WhoTag = ({ profiles, id }: { profiles?: Patient[]; id: unknown }) => {
  if (!profiles || profiles.length < 2) return null;
  const n = nameOf(id) || profiles.find((p) => p._id === id)?.name;
  return n ? <span className="border border-black bg-[#F8FAFF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{n}</span> : null;
};
