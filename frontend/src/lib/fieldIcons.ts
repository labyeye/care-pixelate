import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Award, BadgeCheck, Banknote, BookOpen, Briefcase, Building2, Calendar, Clock, CreditCard, FileText, Globe, GraduationCap,
  Hash, HeartPulse, IndianRupee, KeyRound, Landmark, Layers, Lock, Mail, MapPin, Megaphone, Package, Phone, PhoneCall,
  Ruler, Scale, Stethoscope, Tag, Target, Trophy, User, Users, type LucideIcon,
} from "lucide-react";

/**
 * Adds a small icon in front of every form label and an "Enter ..." placeholder to text inputs
 * that have none, on every page, without touching individual forms. The first keyword found in
 * the label text picks the icon. Labels that already contain an icon, checkbox / radio labels and
 * very long labels are left alone. Safe to run repeatedly.
 */
const ICONS: [string[], LucideIcon][] = [
  [["emergency"], PhoneCall],
  [["email", "e-mail"], Mail],
  [["phone", "mobile", "whatsapp", "contact no", "tel"], Phone],
  [["password", "otp", "pin "], Lock],
  [["api key", "token", "secret"], KeyRound],
  [["website", "url", "link", "domain"], Globe],
  [["pincode", "pin code", "zip", "address", "state", "city", "location", "country", "area", "room", "studio", "venue"], MapPin],
  [["date", "due", "follow-up", "followup", "schedule", "birth", "dob", "joining", "from", "until", "valid", "expiry"], Calendar],
  [["time", "slot", "shift", "duration", "start", "end", "hours"], Clock],
  [["height", "waist"], Ruler],
  [["weight", "water"], Scale],
  [["bank", "ifsc", "account", "upi", "branch code"], Landmark],
  [["salary", "ctc", "basic", "allowance", "deduction", "bonus", "₹", "price", "fee", "discount", "collect", "refund", "commission", "gst", "rate", "cost", "amount", "budget", "invoice", "sell", "balance", "loan", "emi", "tax"], IndianRupee],
  [["method", "payment", "reference", "txn", "transaction", "card"], CreditCard],
  [["pan", "aadhaar", "aadhar", "id proof", "id number", "employee id", "roll", "uan", "esi", "passport", "licen"], BadgeCheck],
  [["goal", "target", "outcome", "objective", "kpi"], Target],
  [["diet", "supplement", "medic", "injur", "calorie", "protein", "health", "blood", "allerg", "symptom", "disease"], HeartPulse],
  [["diagnosis", "doctor", "patient", "prescription", "treatment", "ward", "specialisation", "specialization"], Stethoscope],
  [["class", "section", "subject", "grade", "student", "school", "course", "exam", "marks", "syllabus"], GraduationCap],
  [["homework", "assignment", "lesson", "book", "topic", "chapter"], BookOpen],
  [["sport", "team", "match", "tournament", "batch", "league", "coach"], Trophy],
  [["sku", "stock", "reorder", "opening", "product", "item", "quantity", "qty", "service", "unit", "asset"], Package],
  [["experience", "special", "level", "skill", "qualification", "rating", "score"], Award],
  [["company", "organisation", "organization", "business", "department", "industry", "client", "firm", "institute"], Building2],
  [["designation", "occupation", "role", "position", "job", "title", "profession"], Briefcase],
  [["how did", "source", "campaign", "referr", "medium", "channel"], Megaphone],
  [["gender", "relation", "roster", "clients", "trainer", "assign", "guardian", "parent", "father", "mother", "team member", "reporting", "manager", "recipient", "audience"], Users],
  [["name", "member", "login", "staff", "employee", "user", "owner", "contact", "person", "author", "applicant", "candidate"], User],
  [["note", "reason", "description", "remark", "comment", "message", "what was", "details", "feedback", "summary", "instruction", "template", "body", "subject line", "log"], FileText],
  [["plan", "package", "category", "type", "membership", "status", "priority", "label", "tag", "mode", "frequency", "cycle"], Tag],
  [["max", "sessions", "number", "count", "no.", "limit", "total", "age"], Hash],
];

const cache = new Map<LucideIcon, string>();
function svgOf(Icon: LucideIcon) {
  let s = cache.get(Icon);
  if (!s) {
    s = renderToStaticMarkup(createElement(Icon, { size: 14, strokeWidth: 2.5, "aria-hidden": true }));
    cache.set(Icon, s);
  }
  return s;
}

// Keywords match at the start of a word ("pan" matches "PAN number", not "company").
const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULES = ICONS.map(([keys, Icon]) => [new RegExp(keys.map((k) => (/^\w/.test(k) ? "\\b" : "") + esc(k)).join("|")), Icon] as const);

function iconFor(text: string): LucideIcon {
  const t = text.toLowerCase();
  for (const [re, Icon] of RULES) if (re.test(t)) return Icon;
  return Layers;
}

const TEXTY = new Set(["", "text", "email", "tel", "number", "url", "password", "search"]);
const plain = (s: string) => s.replace(/\(.*?\)/g, "").replace(/[*:?]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function decorate(label: HTMLLabelElement) {
  if (label.firstElementChild?.classList.contains("nb-label-icon")) return;
  const text = (label.textContent || "").trim();
  if (!text || text.length > 60) return;
  if (label.querySelector("svg, img, input[type=checkbox], input[type=radio]")) return;

  const icon = document.createElement("span");
  icon.className = "nb-label-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = svgOf(iconFor(text));
  label.insertBefore(icon, label.firstChild);

  // Placeholder for the control this label belongs to.
  const target =
    (label.htmlFor && (document.getElementById(label.htmlFor) as HTMLElement | null)) ||
    label.querySelector("input, textarea") ||
    label.parentElement?.querySelector("input:not([type=checkbox]):not([type=radio]), textarea");
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXTY.has(target.type))) {
    if (!target.placeholder) target.placeholder = `Enter ${plain(text)}`;
  }
}

function scan(root: ParentNode) {
  root.querySelectorAll?.("label").forEach((l) => decorate(l as HTMLLabelElement));
}

export function installFieldIcons() {
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent =
    ".nb-label-icon{display:inline-flex;vertical-align:-2px;margin-right:6px;color:#024bab}.nb-label-icon svg{width:14px;height:14px}";
  document.head.appendChild(style);

  let queued = false;
  const run = () => {
    queued = false;
    scan(document);
  };
  new MutationObserver(() => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(run);
    }
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
