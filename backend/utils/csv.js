// Minimal RFC 4180 CSV writer. Cells starting with = + - @ (or tab/CR) are prefixed with a single quote
// so a patient or doctor name can't become a spreadsheet formula when the file is opened in Excel.
const cell = (v) => {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// columns: [{ key, label }], rows: [{ [key]: value }]
function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8 names correctly
}

module.exports = { toCsv, cell };

if (require.main === module) {
  const assert = require("assert");
  assert.strictEqual(cell('He said "hi", ok'), '"He said ""hi"", ok"');
  assert.strictEqual(cell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.strictEqual(cell("-5"), "-5"); // plain negative numbers stay numbers
  assert.strictEqual(cell("-cmd"), "'-cmd");
  assert.strictEqual(cell(null), "");
  assert.strictEqual(toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: 1, b: "x,y" }]), "﻿A,B\r\n1,\"x,y\"\r\n");
  console.log("csv ok");
}
