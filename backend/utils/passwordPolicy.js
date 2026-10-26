const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/*
 * One password policy for every Nest product (same file in each backend, same wording as the apps' checklist):
 *   - 8+ characters with an uppercase, a lowercase, a number and a special character
 *   - no simple series (1234, 4321, abcd) and no long repeats (1111, aaaa)
 *   - not a common / compromised password
 *   - not one of the last HISTORY_KEEP passwords the account has used (current one included)
 * Enforced in the User model (addPasswordPolicy), so register, change, every reset method and admin-set
 * passwords are all covered. System-made passwords come from generatePassword() and always pass.
 */

const HISTORY_KEEP = 5;

// Matched anywhere in the password (letters/digits only, lower-cased).
const COMMON_CONTAINS = [
  "password", "passw0rd", "qwerty", "asdfgh", "zxcvbn", "letmein", "welcome", "iloveyou", "monkey", "dragon",
  "football", "baseball", "sunshine", "princess", "superman", "trustno1", "changeme", "default", "secret",
  "admin", "pixelate", "nesthr", "nestgym", "nestleads", "nestacademy", "nestdoc", "nestcare",
];
// Only rejected when this is all the letters in the password (e.g. "Admin@1" but not "Admiral@7").
const COMMON_EXACT = ["root", "user", "test", "login", "abc", "pass", "guest", "demo", "temp", "qaz", "xyz"];

const seq = (s, len, digits) => {
  const re = digits ? /\d/ : /[a-z]/;
  for (let i = 0; i + len <= s.length; i++) {
    const w = s.slice(i, i + len);
    if (![...w].every((c) => re.test(c))) continue;
    const d = [...w].map((c) => c.charCodeAt(0));
    const up = d.every((v, k) => k === 0 || v - d[k - 1] === 1);
    const down = d.every((v, k) => k === 0 || d[k - 1] - v === 1);
    if (up || down) return true;
  }
  return false;
};

// Each rule: id, label shown in the apps, test. Keep wording identical to the apps' checklist.
const RULES = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 && p.length <= 128 },
  { id: "upper", label: "An uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "A number (0–9)", test: (p) => /\d/.test(p) },
  { id: "special", label: "A special character (! @ # $ …)", test: (p) => /[^A-Za-z0-9]/.test(p) },
  {
    id: "series",
    label: "No simple series like 1234, 4321, abcd or 1111",
    test: (p) => {
      const s = p.toLowerCase();
      return !(seq(s, 3, true) || seq(s, 4, false) || /(.)\1{3,}/.test(s) || /(\d)\1{2,}/.test(s));
    },
  },
  {
    id: "common",
    label: "Not a common or compromised password",
    test: (p) => {
      const s = p.toLowerCase().replace(/[^a-z0-9]/g, "");
      const letters = p.toLowerCase().replace(/[^a-z]/g, "");
      return !(COMMON_CONTAINS.some((w) => s.includes(w)) || COMMON_EXACT.includes(letters));
    },
  },
];

/** First broken rule's label as a sentence, or null when the password is acceptable. */
function checkPasswordRules(password) {
  if (typeof password !== "string") return "Password is required";
  const broken = RULES.find((r) => !r.test(password));
  return broken ? `Password needs: ${broken.label.charAt(0).toLowerCase()}${broken.label.slice(1)}` : null;
}

const REUSED_MSG = `You have used this password before. Choose one that is not among your last ${HISTORY_KEEP} passwords.`;

/** Random password that always satisfies the policy (for temporary / system-created accounts). */
function generatePassword(length = 14) {
  const pick = (set) => set[crypto.randomInt(set.length)];
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const L = "abcdefghijkmnpqrstuvwxyz";
  const D = "23456789";
  const S = "!@#$%&*?";
  for (let attempt = 0; attempt < 50; attempt++) {
    const chars = [pick(U), pick(L), pick(D), pick(S)];
    const all = U + L + D + S;
    while (chars.length < length) chars.push(pick(all));
    const pw = chars.sort(() => crypto.randomInt(3) - 1).join("");
    if (!checkPasswordRules(pw)) return pw;
  }
  return "Kx7#mQv2!Rt9Zp"; // unreachable in practice
}

/**
 * Adds the policy and the password history to a User schema. Call before mongoose.model().
 * Runs on every save that changes `password` (plain text at that point).
 */
function addPasswordPolicy(schema) {
  schema.add({
    // hashes of earlier passwords, newest first
    passwordHistory: { type: [{ hash: String, at: { type: Date, default: Date.now } }], default: [], select: false },
  });

  schema.pre("validate", async function () {
    if (!this.isModified("password")) return;
    const plain = this.password;
    if (this.$locals.skipPasswordPolicy) return;
    const msg = checkPasswordRules(plain);
    if (msg) return this.invalidate("password", msg, plain);
    if (this.isNew) return;
    const cur = await this.constructor.findById(this._id).select("+password +passwordHistory");
    if (!cur?.password) return;
    const hashes = [cur.password, ...(cur.passwordHistory || []).map((h) => h.hash)];
    for (const h of hashes) {
      if (h && (await bcrypt.compare(plain, h))) return this.invalidate("password", REUSED_MSG, plain);
    }
    // remembered for the save hook below: the hash being replaced goes into the history
    this.$locals.replacedPassword = cur.password;
    this.$locals.oldHistory = cur.passwordHistory || [];
  });

  schema.pre("save", function () {
    const prev = this.$locals.replacedPassword;
    if (!prev) return;
    this.passwordHistory = [{ hash: prev, at: new Date() }, ...(this.$locals.oldHistory || [])].slice(0, HISTORY_KEEP);
    this.$locals.replacedPassword = undefined;
    this.$locals.oldHistory = undefined;
  });
}

module.exports = { RULES, HISTORY_KEEP, REUSED_MSG, checkPasswordRules, generatePassword, addPasswordPolicy };
