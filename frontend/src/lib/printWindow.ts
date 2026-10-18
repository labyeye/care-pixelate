// Print windows (salary slips, reports, invoices) are same-origin documents built from HTML strings, and the login
// token lives in localStorage. A script injected through any interpolated field (an employee name, a note…) could
// read it, so every generated document gets a Content-Security-Policy that forbids scripts, plugins and forms.
// Printing is therefore triggered from here (the opener), never from an inline <script>.
const CSP =
  '<meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';

/** Writes `html` into an already-opened window with the CSP injected first. */
export function writePrintDocument(win: Window, html: string, print = false): void {
  const withCsp = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + CSP) : CSP + html;
  win.document.write(withCsp);
  win.document.close();
  if (print) setTimeout(() => win.print(), 500);
}

/** Opens a new tab with the document; returns null when the browser blocked the pop-up. */
export function openPrintWindow(html: string, print = false): Window | null {
  const win = window.open("", "_blank");
  if (!win) return null;
  writePrintDocument(win, html, print);
  return win;
}
