/**
 * src/lib/entryAudit.js
 *
 * Status-aware entry audit for patient records, limited to the major tracked
 * fields: which of them a patient of a given ops.status is expected to carry,
 * and which uploaded documents sit in the wrong file format.
 *
 * Used by /api/super-admin/entries-report (Entries Report page).
 */

export const ALL_STATUSES = [
  "NEW", "NOT_VISITED", "NOT_CONVERTED", "CONSULTED",
  "SURGERY_BOOKED", "BOOKING_DONE", "CLOSED",
];

// Statuses the report focuses on (money / surgery already in play).
export const FOCUS_STATUSES = ["BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];

const CONSULTED_PLUS = ["CONSULTED", "NOT_CONVERTED", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];
const BOOKED_PLUS = ["BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"];
const SURGERY_READY = ["SURGERY_BOOKED", "CLOSED"];
const CLOSED_ONLY = ["CLOSED"];

export const SEVERITY_WEIGHT = { high: 10000, medium: 100, low: 1 };

/* -- Document sections and the format each one must hold ------------------ */

export const DOC_SECTIONS = {
  images:       { label: "Patient Images", expects: "image" },
  consentForm:  { label: "Consent Form",   expects: "pdf" },
  suregeryForm: { label: "Surgery Form",   expects: "pdf" },
};

// Kept as source strings so the same patterns can run inside a Mongo
// $regexMatch (see the entries-report route) and in the browser.
export const IMAGE_RE_SRC = "\\.(jpe?g|png|webp|gif|bmp|heic|heif)(\\?.*)?$";
export const PDF_RE_SRC = "\\.pdf(\\?.*)?$";

// 10 digits, optional +91 / 0 prefix, optional spaces or dashes between digits.
export const PHONE_RE_SRC = "^(\\+?91|0)?[\\s-]?(\\d[\\s-]?){9}\\d$";

const IMAGE_RE = new RegExp(IMAGE_RE_SRC, "i");
const PDF_RE = new RegExp(PDF_RE_SRC, "i");
const PHONE_RE = new RegExp(PHONE_RE_SRC);

/** image | pdf | unknown - derived from the file URL. */
export function fileKind(url) {
  const u = String(url || "");
  if (IMAGE_RE.test(u)) return "image";
  if (PDF_RE.test(u)) return "pdf";
  return "unknown";
}

/* -- Tracked fields, layered by status (later layer wins per field) ------- */

const f = (label, severity, section) => ({ label, severity, section });

const LAYERS = [
  {
    statuses: ALL_STATUSES,
    fields: {
      "personal.name":      f("Patient Name", "high", "Personal"),
      "personal.phone":     f("Phone Number", "high", "Personal"),
      "personal.branch":    f("Branch", "high", "Personal"),
      "personal.visitDate": f("Visit Date", "medium", "Personal"),
      "personal.reference": f("Reference", "medium", "Personal"),
      "personal.address":   f("Address", "low", "Personal"),
    },
  },
  {
    statuses: CONSULTED_PLUS,
    fields: {
      "counselling.counsellor":           f("Counsellor", "high", "Counselling"),
      "counselling.techniqueSuggested":   f("Technique Suggested", "medium", "Counselling"),
      "counselling.additionalbenefits":   f("Additional Benefits", "low", "Counselling"),
    },
  },
  {
    statuses: BOOKED_PLUS,
    fields: {
      "counselling.finlpackage": f("Final Package", "high", "Counselling"),
    },
  },
  {
    statuses: SURGERY_READY,
    fields: {
      "counselling.readyForSurgery": f("Ready For Surgery", "medium", "Counselling"),
      "medical.hiv":                 f("HIV Report", "high", "Medical"),
      "medical.hcv":                 f("HCV Report", "high", "Medical"),
      "documents.consentForm":       f("Consent Form uploaded", "high", "Documents"),
    },
  },
  {
    statuses: CLOSED_ONLY,
    fields: {
      "surgery.surgeryDate":     f("Surgery Date", "high", "Surgery"),
      "surgery.technique":       f("Technique Performed", "high", "Surgery"),
      "surgery.graftsImplanted": f("Grafts Implanted", "high", "Surgery"),
      "surgery.doctor":          f("Doctor", "high", "Surgery"),
      "surgery.location":        f("Surgery Location", "medium", "Surgery"),
      "surgery.OT":              f("OT", "medium", "Surgery"),
      "surgery.seniorTech":      f("Senior Technician", "medium", "Surgery"),
      "surgery.implanterRight":  f("Implanter (Right)", "medium", "Surgery"),
      "surgery.implanterLeft":   f("Implanter (Left)", "medium", "Surgery"),
      "surgery.graftingPerson":  f("Grafting Person", "medium", "Surgery"),
      "documents.images":        f("Patient Images uploaded", "high", "Documents"),
      "documents.consentForm":   f("Consent Form uploaded", "high", "Documents"),
      "documents.suregeryForm":  f("Surgery Form uploaded", "high", "Documents"),
    },
  },
];

/** Non-document field paths the audit reads - drives the Mongo projection. */
export const TRACKED_PATHS = [
  ...new Set(LAYERS.flatMap((l) => Object.keys(l.fields))),
].filter((p) => !p.startsWith("documents."));

/** Paths read by the money checks - not field-presence rules, but projected. */
export const MONEY_PATHS = [
  "payments.totalAmount",
  "payments.amountReceived",
  "payments.discount",
  "payments.pendingAmount",
];

/** Every path the audit reads - drives the Mongo projection. */
export const READ_PATHS = [...TRACKED_PATHS, ...MONEY_PATHS];

export const ISSUE_SECTIONS = [
  ...new Set([
    ...LAYERS.flatMap((l) => Object.values(l.fields).map((r) => r.section)),
    "Payments",
  ]),
];

const rulesCache = new Map();

export function rulesFor(status) {
  const key = ALL_STATUSES.includes(status) ? status : "NEW";
  if (!rulesCache.has(key)) {
    const merged = {};
    for (const layer of LAYERS) {
      if (layer.statuses.includes(key)) Object.assign(merged, layer.fields);
    }
    rulesCache.set(key, merged);
  }
  return rulesCache.get(key);
}

/* -- Helpers -------------------------------------------------------------- */

const get = (obj, path) =>
  path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

function filled(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v) && v !== 0;
  if (typeof v === "boolean") return v;
  return true;
}

/** Mirrors the pipeline's $convert: anything unparseable counts as 0. */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Per-section file tallies. The entries-report aggregation computes these in
 * Mongo (p.docCounts) so the URL arrays never cross the wire; a raw patient
 * document falls back to counting here.
 */
export function docCountsOf(p) {
  if (p?.docCounts) return p.docCounts;
  const out = {};
  for (const [key, cfg] of Object.entries(DOC_SECTIONS)) {
    const files = Array.isArray(p?.documents?.[key]) ? p.documents[key] : [];
    const kinds = files.map(fileKind);
    out[key] = {
      n: files.length,
      wrong: kinds.filter((k) => k !== cfg.expects && k !== "unknown").length,
      unknown: kinds.filter((k) => k === "unknown").length,
    };
  }
  return out;
}

/* -- The audit ------------------------------------------------------------ */

/**
 * Audits one patient (raw lean doc, or a projected doc carrying docCounts).
 * @returns {{priority: "high"|"medium"|"low"|null, score: number,
 *            counts: {high:number, medium:number, low:number},
 *            issues: Array<{field:string,label:string,severity:string,type:string,section:string,detail?:string}>}}
 */
export function auditPatient(p) {
  const status = p?.ops?.status || "NEW";
  const dc = docCountsOf(p);
  const issues = [];

  // 1. Tracked fields that are empty for this status.
  for (const [field, rule] of Object.entries(rulesFor(status))) {
    const docKey = field.startsWith("documents.") ? field.slice(10) : null;
    const present = docKey ? (dc[docKey]?.n || 0) > 0 : filled(get(p, field));
    if (!present) {
      issues.push({
        field,
        label: rule.label,
        severity: rule.severity,
        section: rule.section,
        type: "missing",
      });
    }
  }

  // 2. Uploaded documents sitting in the wrong section format (red alert).
  for (const [key, cfg] of Object.entries(DOC_SECTIONS)) {
    const c = dc[key];
    if (!c?.n) continue;
    const expectLabel = cfg.expects === "pdf" ? "PDF" : "image";
    if (c.wrong) {
      issues.push({
        field: `documents.${key}`,
        label: `${cfg.label} - wrong file format`,
        severity: "high",
        section: "Documents",
        type: "format",
        detail: `${c.wrong} of ${c.n} file(s) are not ${expectLabel}; this section only accepts ${expectLabel} files`,
      });
    }
    if (c.unknown) {
      issues.push({
        field: `documents.${key}`,
        label: `${cfg.label} - unreadable file type`,
        severity: "medium",
        section: "Documents",
        type: "format",
        detail: `${c.unknown} file(s) carry no recognisable ${expectLabel} extension`,
      });
    }
  }

  // 3. Phone present but not a usable number.
  const phone = typeof p?.personal?.phone === "string" ? p.personal.phone : "";
  if (phone !== "" && !PHONE_RE.test(phone)) {
    issues.push({
      field: "personal.phone", label: "Phone is not a valid 10-digit number",
      severity: "high", section: "Personal", type: "invalid",
      detail: `Stored value: ${p.personal.phone}`,
    });
  }

  // 4. Money that contradicts itself.
  const total = num(p?.payments?.totalAmount);
  const received = num(p?.payments?.amountReceived);
  const discount = num(p?.payments?.discount);
  const pending = num(p?.payments?.pendingAmount);

  if (total > 0 && Math.abs(total - (received + discount + pending)) > 1) {
    issues.push({
      field: "payments.totalAmount", label: "Payment figures do not reconcile",
      severity: "high", section: "Payments", type: "invalid",
      detail: `Total ${total} != Received ${received} + Discount ${discount} + Pending ${pending}`,
    });
  }
  if (total > 0 && received > total) {
    issues.push({
      field: "payments.amountReceived", label: "Received amount exceeds total",
      severity: "high", section: "Payments", type: "invalid",
      detail: `Received ${received} > Total ${total}`,
    });
  }
  if (pending < 0) {
    issues.push({
      field: "payments.pendingAmount", label: "Negative pending amount",
      severity: "medium", section: "Payments", type: "invalid",
      detail: `Stored value: ${pending}`,
    });
  }
  if (status === "CLOSED" && pending > 0) {
    issues.push({
      field: "payments.pendingAmount", label: "Surgery closed with pending balance",
      severity: "medium", section: "Payments", type: "invalid",
      detail: `Pending ${pending}`,
    });
  }

  const counts = { high: 0, medium: 0, low: 0 };
  for (const i of issues) counts[i.severity] += 1;

  const priority = counts.high ? "high" : counts.medium ? "medium" : counts.low ? "low" : null;
  const score =
    counts.high * SEVERITY_WEIGHT.high +
    counts.medium * SEVERITY_WEIGHT.medium +
    counts.low * SEVERITY_WEIGHT.low;

  return { priority, score, counts, issues };
}
