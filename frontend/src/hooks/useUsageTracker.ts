// Sends page views and crashes to the product backend (/api/telemetry) so the Pixelate Nest CRM dashboard can show
// live usage. Must be called once inside <BrowserRouter> and <AuthProvider>. Never throws, never blocks the UI.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type Ev = { type: "page" | "crash" | "error"; path: string; userId?: string; role?: string; message?: string; stack?: string };

const queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let identity: { userId?: string; role?: string } = {};
let hooked = false;

function flush() {
  timer = undefined;
  if (!queue.length) return;
  const events = queue.splice(0, 20).map((e) => ({ platform: "web", ...e }));
  try {
    fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5050/api"}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  if (queue.length) timer = setTimeout(flush, 2000);
}
function push(e: Ev) {
  if (queue.length > 100) return;
  queue.push({ ...identity, ...e });
  timer ??= setTimeout(flush, 4000);
}

export function useUsageTracker() {
  const { pathname } = useLocation();
  const { user } = useAuth() as { user: any };
  identity = { userId: user?._id ?? user?.id, role: user?.role };

  useEffect(() => {
    if (hooked) return;
    hooked = true;
    window.addEventListener("error", (ev) =>
      push({ type: "crash", path: location.pathname, message: ev.message, stack: ev.error?.stack }),
    );
    window.addEventListener("unhandledrejection", (ev) =>
      push({ type: "error", path: location.pathname, message: String(ev.reason?.message ?? ev.reason), stack: ev.reason?.stack }),
    );
    window.addEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    push({ type: "page", path: pathname });
  }, [pathname]);
}
