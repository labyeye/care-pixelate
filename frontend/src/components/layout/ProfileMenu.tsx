import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Coins, Crown, LogOut, Plus, Wallet } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { fmtCredits, useCredits } from "@/contexts/CreditsContext";

const titleCase = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

/** Header profile: avatar + name, Premium badge and the WhatsApp credits pill (clinic owner / admin). */
export function ProfileMenu() {
  const { user, tenant, logout } = useAuth();
  const { credits } = useCredits();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!user) return null;

  const initials = (user.name || "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const isTrial = tenant?.plan === "trial";
  const isPaid = !!tenant && tenant.status === "active" && !isTrial;
  const badge = isPaid ? "Premium" : isTrial ? "Trial" : null;
  const metered = !!credits?.metered;
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border-2 border-black bg-white px-2 py-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-colors hover:bg-[#F8FAFF]"
        aria-label="Account menu"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[110px] truncate text-sm font-medium md:block">
          {user.name}
        </span>
        {badge && (
          <span className="hidden items-center gap-1 border-2 border-black bg-[#FFF4D6] px-1.5 py-0.5 text-[11px] font-medium sm:flex">
            <Crown className="h-3 w-3 text-[#024BAB]" /> {badge}
          </span>
        )}
        {metered && (
          <span
            className={`flex items-center gap-1 border-2 border-black px-1.5 py-0.5 text-[11px] font-medium text-white ${credits?.zero ? "bg-red-600" : credits?.low ? "bg-[#FA731C]" : "bg-[#00A878]"}`}
            title="WhatsApp credits"
          >
            <Coins className="h-3 w-3" /> {fmtCredits(credits?.total)}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="border-b-2 border-black bg-[#024BAB] px-4 py-3">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-[11px] capitalize text-white/70">
              {tenant?.name || user.role.replace(/_/g, " ")}
            </p>
          </div>

          {badge && (
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Crown className="h-3.5 w-3.5 text-[#024BAB]" /> {badge}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {isTrial ? "Free trial" : `${titleCase(tenant?.plan)} plan`}
              </span>
            </div>
          )}

          {metered && (
            <div className="space-y-2 border-b border-black/10 px-4 py-3">
              <div className="flex items-end justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  WhatsApp credits
                </span>
                <span
                  className={`text-xl font-medium ${credits?.zero ? "text-red-600" : ""}`}
                >
                  {fmtCredits(credits?.total)}
                </span>
              </div>
              {!!credits?.bonus && (
                <p className="text-[11px] text-gray-500">
                  incl. {fmtCredits(credits.bonus)} bonus
                  {credits.bonusExpiresAt
                    ? ` (till ${new Date(credits.bonusExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`
                    : ""}
                </p>
              )}
              {credits?.zero ? (
                <p className="text-[11px] font-medium text-red-600">
                  Patient WhatsApp messages are paused. Add credits to resume.
                </p>
              ) : credits?.low ? (
                <p className="text-[11px] font-medium text-[#FA731C]">Running low.</p>
              ) : null}
              <button
                onClick={() => go("/credits")}
                className="flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#024BAB] py-2 text-xs font-medium text-white transition-colors hover:bg-[#013a85]"
              >
                <Plus className="h-3.5 w-3.5" /> Add credits
              </button>
            </div>
          )}

          <button
            onClick={() => go("/billing")}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium hover:bg-[#024BAB]/5"
          >
            <Wallet className="h-3.5 w-3.5" /> Plan &amp; billing
          </button>
          {metered && (
            <button
              onClick={() => go("/credits")}
              className="flex w-full items-center gap-2 border-t border-black/10 px-4 py-2.5 text-left text-xs font-medium hover:bg-[#024BAB]/5"
            >
              <Coins className="h-3.5 w-3.5" /> Credits &amp; usage
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 border-t-2 border-black px-4 py-2.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
