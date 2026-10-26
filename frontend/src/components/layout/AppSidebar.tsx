import { useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, X } from "lucide-react";
import logoLong from "@/assets/logos/logo-long.png";
import logoShort from "@/assets/logos/logo-short.png";
import { cn } from "@/lib/utils";
import { getNavGroupsForRole } from "@/config/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Every page mounts its own <AppLayout>, so the sidebar remounts on navigation.
// Keep the menu's scroll offset at module level so it doesn't jump back to the top.
let navScrollTop = 0;

const COLLAPSE_KEY = "nestcare.sidebar.collapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const { user, tenant, pages, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = navScrollTop;
  }, [user]);

  if (!user) return null;

  const groups = getNavGroupsForRole(user.role, tenant?.orgType, pages);
  const orgName = tenant?.branding?.appName || tenant?.name || "NestDoc";

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage blocked — still collapse for this session */
      }
      return !c;
    });

  // `slim` = icon-only desktop rail. The mobile drawer is always full width.
  const build = (slim: boolean) => (
    <div className="flex h-full flex-col bg-white">
      {/* Brand — fixed at the top */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b-2 border-black",
          slim ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <img
          src={slim ? logoShort : logoLong}
          alt="NestDoc"
          className={cn("object-contain", slim ? "h-10 w-10" : "h-12 w-auto")}
        />
        {!slim && (
          <button
            onClick={onMobileClose}
            className="ml-auto border-2 border-black p-1 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Only this part scrolls */}
      <nav
        ref={navRef}
        onScroll={(e) => (navScrollTop = e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((group) => (
          <div key={group.label}>
            {slim ? (
              <div className="mx-3 mb-1 border-t-2 border-black/10" />
            ) : (
              <p className="mb-1 select-none px-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    to={item.href}
                    onClick={onMobileClose}
                    title={slim ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 border-2 py-2.5 text-sm font-semibold transition-all duration-150 ease-out",
                        slim ? "justify-center px-0" : "px-3",
                        isActive
                          ? "border-black bg-[#024BAB] text-white"
                          : "border-transparent text-black hover:translate-x-0.5 hover:border-black hover:bg-[#024BAB]/10",
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110" />
                    {!slim && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User + sign out — fixed at the bottom */}
      {!slim && (
        <div className="shrink-0 border-t-2 border-black px-3 py-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden border-2 border-black bg-[#024BAB] text-xs font-bold text-white">
              {user.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-black">
                {user.name}
              </p>
              <p className="truncate text-[10px] capitalize text-muted-foreground">
                {user.role?.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 py-1 text-xs font-semibold text-black transition-colors hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: pinned to the viewport; the page scrolls, the sidebar doesn't. */}
      <aside
        className={cn(
          "relative hidden shrink-0 border-r-2 border-black bg-white transition-[width] duration-300 ease-out md:sticky md:top-0 md:z-20 md:block md:h-screen",
          collapsed ? "md:w-16" : "md:w-64",
        )}
      >
        {build(collapsed)}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-4 top-20 z-10 flex h-7 w-7 items-center justify-center border-2 border-black bg-[#024BAB] text-white transition-colors hover:bg-[#023d8c]"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onMobileClose}
          />
          <div className="absolute inset-y-0 left-0 w-64 animate-slide-in-left border-r-2 border-black">
            {build(false)}
          </div>
        </div>
      )}
    </>
  );
}
