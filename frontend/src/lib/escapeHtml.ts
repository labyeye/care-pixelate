// Everything interpolated into a document.write()/print template must go
// through this: names, titles and free text are user-controlled, and the print
// window is same-origin (it can read the auth token).
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
