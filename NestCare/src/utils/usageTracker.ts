// Sends screen views and crashes to the product backend (/api/telemetry) for the Pixelate Nest CRM dashboard,
// and tags every API call from this app with "X-Client: app" so the dashboard can split app vs web traffic.
// Never throws and never blocks the UI. Call initUsageTracker(API_BASE_URL) once at startup.
type Ev = { type: 'page' | 'crash' | 'error'; path: string; message?: string; stack?: string };

let base = '';
let identity: { userId?: string; role?: string } = {};
let version: string | undefined;
const queue: any[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function send(events: any[]) {
  if (!base || !events.length) return;
  try {
    fetch(`${base}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': 'app' },
      body: JSON.stringify({ events }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
function flush() {
  timer = undefined;
  send(queue.splice(0, 20));
  if (queue.length) timer = setTimeout(flush, 2000);
}
function push(e: Ev, now = false) {
  if (queue.length > 100) return;
  queue.push({ platform: 'app', version, ...identity, ...e });
  if (now) flush();
  else timer ??= setTimeout(flush, 4000);
}

export function initUsageTracker(apiBase: string, appVersion?: string) {
  if (base) return;
  base = apiBase;
  version = appVersion;
  // Tag this app's API calls so the server can count app and web separately.
  const orig = globalThis.fetch;
  globalThis.fetch = ((input: any, init: any = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && url.startsWith(base)) {
        const h = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        h.set('X-Client', 'app');
        init = { ...init, headers: h };
      }
    } catch {
      /* fall through with the original request */
    }
    return orig(input, init);
  }) as typeof fetch;
  const EU = (globalThis as any).ErrorUtils;
  const prev = EU?.getGlobalHandler?.();
  EU?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    push({ type: isFatal ? 'crash' : 'error', path: lastScreen, message: error?.message, stack: error?.stack }, true);
    prev?.(error, isFatal);
  });
}

export function setUsageIdentity(user?: { id?: string; _id?: string; role?: string } | null) {
  identity = { userId: user?._id ?? user?.id, role: user?.role };
}

let lastScreen = '/';
function routeName(state: any): string | undefined {
  const r = state?.routes?.[state.index ?? 0];
  if (!r) return undefined;
  return r.state ? `${r.name}/${routeName(r.state) ?? ''}`.replace(/\/$/, '') : r.name;
}
// Pass as <NavigationContainer onStateChange={trackNavState}>.
export function trackNavState(state: any) {
  const name = routeName(state);
  if (!name || name === lastScreen) return;
  lastScreen = name;
  push({ type: 'page', path: '/' + name });
}
