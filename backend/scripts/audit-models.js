// Static consistency audit: do the fields controllers whitelist / populate actually exist on the models?
// Offline: loads schemas only, no DB.  Run: node scripts/audit-models.js   (exit 1 on any mismatch)
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const models = {};
for (const f of fs.readdirSync(path.join(root, "models"))) {
  const mod = require(path.join(root, "models", f));
  for (const m of mod.modelName ? [mod] : Object.values(mod))
    if (m && m.modelName) models[m.modelName] = m;
}

const pathsOf = (M) => {
  const s = M.schema;
  const all = new Set([
    ...Object.keys(s.paths),
    ...Object.keys(s.virtuals),
    ...Object.keys(s.subpaths || {}),
  ]);
  s.eachPath((p) => all.add(p));
  return all;
};
const hasPath = (M, p) => {
  const all = pathsOf(M);
  p = p.replace(/^[-+]/, "");
  if (all.has(p)) return true;
  // nested object / array-of-subdocs prefix: "contact" or "professionalDetails.qualifications.degree"
  return [...all].some(
    (x) => x === p || x.startsWith(p + ".") || p.startsWith(x + "."),
  );
};

const problems = [];
const check = (file, modelName, p, why) => {
  const M = models[modelName];
  if (!M)
    return problems.push(`${file}: unknown model "${modelName}" (${why})`);
  if (!hasPath(M, p))
    problems.push(`${file}: ${modelName} has no field "${p}" (${why})`);
};

// 1) populate("ref", "a b c"): resolve ref -> model through the *source* model's schema
const sourceFiles = ["controllers", "utils"].flatMap((d) =>
  fs.readdirSync(path.join(root, d)).map((f) => path.join(d, f)),
);
const refModel = (srcModelNames, p) => {
  for (const n of srcModelNames) {
    const sp = models[n].schema.path(p);
    const ref =
      sp &&
      (sp.options.ref ||
        (sp.caster && sp.caster.options && sp.caster.options.ref));
    if (ref) return ref;
  }
  return null;
};
for (const rel of sourceFiles) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const used = Object.keys(models).filter((n) =>
    new RegExp(`\\b${n}\\b`).test(src),
  );
  for (const m of src.matchAll(
    /\.populate\(\s*"(\w+)"\s*,\s*"([^"]+)"\s*\)/g,
  )) {
    const ref = refModel(used.length ? used : Object.keys(models), m[1]);
    if (!ref) {
      problems.push(
        `${rel}: populate("${m[1]}") has no ref on any model used in this file`,
      );
      continue;
    }
    for (const f of m[2].split(/\s+/).filter(Boolean))
      check(rel, ref, f, `populate ${m[1]}`);
  }
}

// 2) whitelist arrays -> the model each controller owns
const owners = {
  "controllers/patientController.js": ["Patient", ["FIELDS"]],
  "controllers/doctorController.js": ["Doctor", ["FIELDS"]],
  "controllers/appointmentController.js": ["Appointment", ["FIELDS"]],
  "controllers/consultationController.js": ["Consultation", ["FIELDS"]],
  "controllers/patientPortalController.js": ["Patient", ["PROFILE_FIELDS"]],
};
for (const [rel, [model, names]] of Object.entries(owners)) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  for (const n of names) {
    const m = src.match(new RegExp(`const ${n} = \\[([^\\]]+)\\]`));
    if (!m) {
      problems.push(`${rel}: could not find ${n}`);
      continue;
    }
    for (const f of [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]))
      check(rel, model, f, n);
  }
}

// 3) counters used by $inc must be declared, or Mongoose strict mode silently drops the increment
for (const rel of sourceFiles) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  for (const m of src.matchAll(/"counters\.(\w+)"/g))
    check(rel, "Tenant", `counters.${m[1]}`, "counter");
}

// 4) required fields that API create handlers never set from the body (informational)
const info = [];
for (const [name, M] of Object.entries(models)) {
  const req = [];
  M.schema.eachPath((p, t) => {
    if (t.isRequired && !/^(_id|__v|tenantId|createdBy|registeredBy)$/.test(p))
      req.push(p);
  });
  info.push(`${name}: ${req.length ? req.join(", ") : "-"}`);
}

console.log("Models: " + Object.keys(models).join(", "));
console.log("\nRequired fields per model:\n  " + info.join("\n  "));
if (problems.length) {
  console.log(
    `\n${problems.length} PROBLEM(S):\n  - ` + problems.join("\n  - "),
  );
  process.exit(1);
}
console.log(
  "\nAll whitelisted / populated / counter fields exist on their models.",
);
