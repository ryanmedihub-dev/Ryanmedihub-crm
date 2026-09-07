// Pure, dependency-free row logic for the admin bulk-Payable upload. Imported by BOTH the
// browser preview and the server routes, so it has ZERO imports — no mongoose, no DB, no
// NextAuth, no next/*, not even xlsx (Excel date serials are converted with the plain
// epoch formula below so importing this map into NewPayableModal doesn't pull in SheetJS).
//
// The single source of truth for what a Payable *is* stays src/lib/entryCore/createPayable.js.
// This file only shapes/validates a spreadsheet row into the payload that function expects.

/* ------------------------------------------------------------------ */
/* Maps lifted verbatim from src/components/finance/NewPayableModal.jsx */
/* (that file now imports these from here — one copy).                 */
/* ------------------------------------------------------------------ */

export const PURPOSE_TO_CATEGORY = {
  SALARY: "Salary",
  INCENTIVE: "Incentive",
  RENT: "Rent",
  ELECTRICITY: "Electricity Bill",
  COLLAB_CLINIC: "Collab Clinic Payment",
  PATIENT_COMMISSION: "Commision", // sic — existing spelling in the tree, do not "fix" it
  TAX: "Taxes",
  MEDICAL_CONSUMABLES: "Medical Consumables",
  MEDICINE_PROCUREMENT: "Medicine Procurement",
  PROFESSIONAL_EXPENSES: "Professional Expenses",
  LAB_EXPENSES: "Lab Expenses",
  INTEREST_EXPENSES: "Interest Expenses",
  SOFTWARE_RENTAL: "Software Rental Expenses",
  HARDWARE_RENTAL: "Hardware Rental Expenses",
};

export const GENERIC_SUBTYPE_PURPOSES = [
  "MEDICAL_CONSUMABLES",
  "MEDICINE_PROCUREMENT",
  "PROFESSIONAL_EXPENSES",
  "LAB_EXPENSES",
  "INTEREST_EXPENSES",
  "SOFTWARE_RENTAL",
  "HARDWARE_RENTAL",
];

export const PURPOSE_LABELS = {
  SALARY: "Salary",
  INCENTIVE: "Incentive",
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  COLLAB_CLINIC: "Collab Clinic",
  PATIENT_COMMISSION: "Patient Commission",
  TAX: "Taxes",
  MEDICAL_CONSUMABLES: "Medical Consumables",
  MEDICINE_PROCUREMENT: "Medicine Procurement",
  PROFESSIONAL_EXPENSES: "Professional Expenses",
  LAB_EXPENSES: "Lab Expenses",
  INTEREST_EXPENSES: "Interest Expenses",
  SOFTWARE_RENTAL: "Software Rental",
  HARDWARE_RENTAL: "Hardware Rental",
};

// Literal mirror of models/Payable.js's MONTHLY_PAYABLE_PURPOSES. Duplicated (not imported)
// only because that export lives on a mongoose model and this module must stay DB-free. The
// server pipeline imports the real one and asserts the two are identical at module load.
export const MONTHLY_PAYABLE_PURPOSES = ["SALARY", "RENT", "ELECTRICITY", "COLLAB_CLINIC", "TAX"];

// Same order as the spec's column table. The template sheet uses exactly these header keys.
export const HEADERS = [
  "purpose",
  "payeeKind",
  "payeeLabel",
  "payeeRefId",
  "payeeLookup",
  "expenseCategory",
  "expenseSubType",
  "periodMonth",
  "periodYear",
  "relatedPatientPhone",
  "relatedPatientId",
  "amount",
  "dueDate",
  "branch",
  "remarks",
  "costAlreadyRecognised",
  "excludeFromPnl",
  "includeGST",
  "gstRate",
  "gstAmount",
  "includeTDS",
  "tdsCategory",
  "tdsRate",
  "tdsAmount",
];

const PATIENT_PURPOSES = ["INCENTIVE", "PATIENT_COMMISSION"];
const REFID_KINDS = ["EMPLOYEE", "PATIENT", "VENDOR"];

/* ------------------------------------------------------------------ */
/* §2.1 derivations                                                    */
/* ------------------------------------------------------------------ */

// mirrors buildPayee() in NewPayableModal.jsx
export function defaultKindForPurpose(purpose, { vendorResolved = false } = {}) {
  if (purpose === "SALARY" || purpose === "INCENTIVE") return "EMPLOYEE";
  if (purpose === "RENT") return "RENT_UNIT";
  if (purpose === "ELECTRICITY") return "UTILITY_UNIT";
  if (purpose === "COLLAB_CLINIC") return "COLLAB_CLINIC";
  if (purpose === "PATIENT_COMMISSION") return "PATIENT";
  if (purpose === "TAX") return "OTHER";
  if (GENERIC_SUBTYPE_PURPOSES.includes(purpose)) return vendorResolved ? "VENDOR" : "OTHER";
  return "OTHER"; // purpose === "OTHER"
}

export function deriveRequirements(purpose, resolvedKind) {
  return {
    needsPeriod: MONTHLY_PAYABLE_PURPOSES.includes(purpose),
    needsPatient: PATIENT_PURPOSES.includes(purpose),
    needsRefId: REFID_KINDS.includes(resolvedKind),
    needsSubType: GENERIC_SUBTYPE_PURPOSES.includes(purpose),
  };
}

/* ------------------------------------------------------------------ */
/* §2.3 coercion helpers (pure). Each throws Error(msg) on bad input;  */
/* callers wrap per-field so one bad cell doesn't abort the row.       */
/* ------------------------------------------------------------------ */

const BOOL_TRUE = new Set(["yes", "y", "true", "1", "✓"]);
const BOOL_FALSE = new Set(["no", "n", "false", "0", ""]);

export function parseBool(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  if (BOOL_TRUE.has(s)) return true;
  if (BOOL_FALSE.has(s)) return false;
  throw new Error(`"${v}" is not yes/no`);
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function parseAmount(v) {
  if (v === undefined || v === null || String(v).trim() === "") throw new Error("required");
  const cleaned = String(v).replace(/[₹,\s ]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${v}" is not a positive number`);
  return round2(n);
}

// Optional numeric (rate / tax amount). Returns null for blank, throws for garbage.
export function parseOptionalNumber(v, { min, max, gtZero = false } = {}) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = parseFloat(String(v).replace(/[₹,\s %]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number`);
  if (gtZero && !(n > 0)) throw new Error(`must be greater than 0`);
  if (min !== undefined && n < min) throw new Error(`must be ≥ ${min}`);
  if (max !== undefined && n > max) throw new Error(`must be ≤ ${max}`);
  return round2(n);
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function parseMonth(v) {
  if (v === undefined || v === null || String(v).trim() === "") throw new Error("required");
  const s = String(v).trim().toLowerCase();
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 12) return n;
    throw new Error(`month ${n} out of range 1–12`);
  }
  const idx = MONTH_NAMES.findIndex((m) => m === s || m.slice(0, 3) === s.slice(0, 3));
  if (idx >= 0) return idx + 1;
  throw new Error(`"${v}" is not a month`);
}

export function parseYear(v) {
  if (v === undefined || v === null || String(v).trim() === "") throw new Error("required");
  const n = parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) throw new Error(`"${v}" is not a year 2000–2100`);
  return n;
}

// JS Date | Excel serial number | "DD-MM-YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD" | ISO string.
// Day-first for the DD?MM?YYYY shapes. Returns a Date at UTC midnight. Throws on ambiguity.
export function parseExcelDate(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error("invalid date");
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }

  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial: whole days since 1899-12-30 (that epoch already absorbs Excel's
    // 1900-leap-year bug for every date we care about, i.e. anything from 2000 on).
    if (v < 1 || v > 80000) throw new Error(`"${v}" is not an Excel date`);
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  const s = String(v).trim();

  // ISO / YYYY-MM-DD (year-first — unambiguous)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    return mkUtc(y, mo, d, s);
  }

  // DD-MM-YYYY or DD/MM/YYYY (day-first)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m.map(Number);
    return mkUtc(y, mo, d, s);
  }

  throw new Error(`"${v}" is not a recognised date (use DD-MM-YYYY)`);
}

function mkUtc(y, mo, d, original) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error(`"${original}" is not a valid date`);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`"${original}" is not a real calendar date`);
  }
  return dt;
}

// trim + collapse internal whitespace, case-insensitive match against `allowed`,
// return the canonical cased value or null.
export function normalizeEnum(v, allowed) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  if (!s) return null;
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit || null;
}

// purpose accepts the canonical value, the label, or a spaced/hyphenated variant.
export function normalizePurpose(v, purposeValues) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const raw = String(v).trim();
  const direct = normalizeEnum(raw, purposeValues);
  if (direct) return direct;
  const underscored = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (purposeValues.includes(underscored)) return underscored;
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const byLabel = Object.entries(PURPOSE_LABELS).find(
    ([, label]) => label.toLowerCase().replace(/[\s_-]+/g, "") === compact,
  );
  return byLabel ? byLabel[0] : null;
}

export function normalizeKind(v, kindValues) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const raw = String(v).trim();
  return (
    normalizeEnum(raw, kindValues) ||
    (kindValues.includes(raw.toUpperCase().replace(/[\s-]+/g, "_"))
      ? raw.toUpperCase().replace(/[\s-]+/g, "_")
      : null)
  );
}

const HEX24 = /^[a-f0-9]{24}$/i;
export const isObjectIdish = (v) => typeof v === "string" && HEX24.test(v.trim());

// Levenshtein edit distance (iterative, two-row). Used only for "did you mean" hints.
export function levenshtein(a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Closest allowed value within `max` edits (case-insensitive), or null.
export function didYouMean(value, allowed, max = 2) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  let best = null;
  let bestD = Infinity;
  for (const a of allowed) {
    const d = levenshtein(v, String(a).toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return bestD <= max ? best : null;
}

// Standard "X is not a valid ..." message with a typo hint appended when there's a near match.
function enumErr(field, value, allowed, extra = "") {
  const hint = didYouMean(value, allowed);
  return `${field}: "${value || "(blank)"}" is not valid${extra ? ` ${extra}` : ""}.${
    hint ? ` Did you mean "${hint}"?` : ""
  }`;
}

// The monthly unique key — mirrors payableSchema's partial unique index
// (payee.kind + payee.refId + payee.label + purpose + expenseSubType + period.month + period.year).
// expenseSubType is part of the key so one vendor can hold several monthly payables that
// differ only by head (e.g. two RENT units, or Rent vs a different sub-type) without
// colliding.
export function monthlyDupKey({ kind, refId, label, purpose, expenseSubType, period }) {
  return [kind, refId || "", label, purpose, expenseSubType || "", period?.month, period?.year].join("|");
}

/* ------------------------------------------------------------------ */
/* Format-only parse — everything that does NOT need the database.     */
/* The server pipeline (validatePipeline.js) runs this, then layers    */
/* ref resolution / duplicate / period-lock on top.                    */
/* ------------------------------------------------------------------ */

/**
 * @param {object} raw       one sheet row, header key -> cell value
 * @param {number} rowNumber sheet row number (data index + 2)
 * @param {object} ctx       { purposeValues, kindValues, branches, tdsTypes,
 *                             collabBranches, allCategories, subTypesFor(category) }
 */
export function parsePayableRowFormat(raw, rowNumber, ctx) {
  const errors = [];
  const warnings = [];
  const get = (k) => {
    const val = raw[k];
    return val === undefined || val === null ? "" : String(val).trim();
  };
  const field = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
      return undefined;
    }
  };

  const out = { rowNumber, errors, warnings };

  // --- purpose (drives everything) ---
  const purpose = normalizePurpose(get("purpose"), ctx.purposeValues);
  if (!purpose) {
    errors.push(enumErr("purpose", get("purpose"), ctx.purposeValues, "— see the Lists sheet"));
    out.purpose = null;
    return out; // nothing else is meaningful without a purpose
  }
  out.purpose = purpose;
  out.purposeLabel = PURPOSE_LABELS[purpose] || purpose;

  const flags = deriveRequirements(purpose, null);

  // --- payee basics ---
  out.declaredKind = normalizeKind(get("payeeKind"), ctx.kindValues);
  if (get("payeeKind") && !out.declaredKind) {
    errors.push(enumErr("payeeKind", get("payeeKind"), ctx.kindValues));
  }
  out.payeeLabel = get("payeeLabel");
  if (!out.payeeLabel) errors.push("payeeLabel: required");
  out.payeeRefId = get("payeeRefId");
  if (out.payeeRefId && !isObjectIdish(out.payeeRefId)) {
    errors.push(`payeeRefId: "${out.payeeRefId}" is not a 24-character ObjectId`);
    out.payeeRefId = "";
  }
  out.payeeLookup = get("payeeLookup");

  // fixed-label purposes: the label itself is an enum
  if (purpose === "COLLAB_CLINIC" && out.payeeLabel) {
    const c = normalizeEnum(out.payeeLabel, ctx.collabBranches);
    if (!c) errors.push(enumErr("payeeLabel", out.payeeLabel, ctx.collabBranches, "as a collab clinic"));
    else out.payeeLabel = c;
  }
  if (purpose === "TAX" && out.payeeLabel) {
    const t = normalizeEnum(out.payeeLabel, ctx.tdsTypes);
    if (!t) errors.push(enumErr("payeeLabel", out.payeeLabel, ctx.tdsTypes, "as a tax type"));
    else out.payeeLabel = t;
  }

  // --- expense category / sub-type ---
  const expectedCategory = PURPOSE_TO_CATEGORY[purpose];
  const givenCategory = get("expenseCategory");
  if (!givenCategory) {
    out.expenseCategory = expectedCategory;
  } else {
    const norm = normalizeEnum(givenCategory, ctx.allCategories) || givenCategory;
    if (norm !== expectedCategory) {
      errors.push(`expenseCategory: "${givenCategory}" doesn't match purpose ${purpose} (expected "${expectedCategory}")`);
    }
    out.expenseCategory = expectedCategory;
  }

  const subTypes = ctx.subTypesFor(out.expenseCategory) || [];
  const givenSub = get("expenseSubType");
  if (givenSub) {
    if (subTypes.length > 0 && !subTypes.some((s) => s.toLowerCase() === givenSub.toLowerCase())) {
      errors.push(enumErr("expenseSubType", givenSub, subTypes, `for ${out.expenseCategory}`));
      out.expenseSubType = givenSub;
    } else {
      out.expenseSubType = subTypes.find((s) => s.toLowerCase() === givenSub.toLowerCase()) || givenSub;
    }
  } else if (flags.needsSubType) {
    errors.push(`expenseSubType: required for ${purpose}`);
    out.expenseSubType = "";
  } else if (subTypes.length === 1) {
    out.expenseSubType = subTypes[0]; // e.g. SALARY -> "Salary"
  } else {
    out.expenseSubType = "";
  }

  // --- period ---
  if (flags.needsPeriod) {
    const month = field("periodMonth", () => parseMonth(get("periodMonth")));
    const year = field("periodYear", () => parseYear(get("periodYear")));
    out.period = month && year ? { month, year } : null;
    if (!out.period && !errors.some((e) => e.startsWith("periodMonth") || e.startsWith("periodYear"))) {
      errors.push("period: month and year are required for this purpose");
    }
  } else {
    out.period = null;
    if (get("periodMonth") || get("periodYear")) {
      warnings.push("periodMonth/periodYear ignored — this purpose is not billed by month");
    }
  }

  // --- related patient (format only; resolution is server side) ---
  out.relatedPatientPhone = get("relatedPatientPhone");
  out.relatedPatientId = get("relatedPatientId");
  if (out.relatedPatientId && !isObjectIdish(out.relatedPatientId)) {
    errors.push(`relatedPatientId: "${out.relatedPatientId}" is not a 24-character ObjectId`);
    out.relatedPatientId = "";
  }
  if (flags.needsPatient && !out.relatedPatientPhone && !out.relatedPatientId) {
    errors.push("relatedPatientPhone: required for INCENTIVE / PATIENT_COMMISSION");
  }

  // --- amount / due date / branch ---
  out.baseAmount = field("amount", () => parseAmount(raw.amount));
  out.dueDate = field("dueDate", () => parseExcelDate(raw.dueDate)) ?? null;

  const branch = get("branch");
  if (branch) {
    const b = normalizeEnum(branch, ctx.branches);
    if (!b) errors.push(enumErr("branch", branch, ctx.branches));
    out.branch = b || "";
  } else {
    out.branch = "";
  }

  out.remarks = get("remarks");
  out.costAlreadyRecognised = field("costAlreadyRecognised", () => parseBool(raw.costAlreadyRecognised)) ?? false;
  out.excludeFromPnl = field("excludeFromPnl", () => parseBool(raw.excludeFromPnl)) ?? false;

  // --- GST ---
  out.includeGST = field("includeGST", () => parseBool(raw.includeGST)) ?? false;
  out.gstRate = field("gstRate", () => parseOptionalNumber(raw.gstRate, { min: 0, max: 28 }));
  out.gstAmount = field("gstAmount", () => parseOptionalNumber(raw.gstAmount, { gtZero: true }));
  if (out.includeGST && out.gstRate == null && out.gstAmount == null) {
    errors.push("includeGST is TRUE but neither gstRate nor gstAmount is set");
  }
  if (!out.includeGST && (out.gstRate != null || out.gstAmount != null)) {
    warnings.push("gstRate/gstAmount ignored because includeGST is not TRUE");
  }

  // --- TDS ---
  out.includeTDS = field("includeTDS", () => parseBool(raw.includeTDS)) ?? false;
  out.tdsCategory = "";
  const tdsCat = get("tdsCategory");
  if (tdsCat) {
    const t = normalizeEnum(tdsCat, ctx.tdsTypes);
    if (!t) errors.push(enumErr("tdsCategory", tdsCat, ctx.tdsTypes, "— see the Lists sheet"));
    out.tdsCategory = t || tdsCat;
  }
  out.tdsRate = field("tdsRate", () => parseOptionalNumber(raw.tdsRate, { min: 0 }));
  out.tdsAmount = field("tdsAmount", () => parseOptionalNumber(raw.tdsAmount, { gtZero: true }));
  if (out.includeTDS) {
    if (!out.tdsCategory) errors.push("includeTDS is TRUE but tdsCategory is blank");
    if (out.tdsRate == null && out.tdsAmount == null) {
      errors.push("includeTDS is TRUE but neither tdsRate nor tdsAmount is set");
    }
  } else if (out.tdsCategory || out.tdsRate != null || out.tdsAmount != null) {
    warnings.push("tdsCategory/tdsRate/tdsAmount ignored because includeTDS is not TRUE");
  }

  out.flags = flags;
  return out;
}

/* ------------------------------------------------------------------ */
/* Template content                                                    */
/* ------------------------------------------------------------------ */

// 3 example rows for the blank template — the Instructions sheet tells the user to delete them.
export const EXAMPLE_ROWS = [
  {
    purpose: "PROFESSIONAL_EXPENSES",
    payeeKind: "VENDOR",
    payeeLabel: "Apex Surgicals",
    payeeRefId: "",
    payeeLookup: "apex@vendor.com",
    expenseCategory: "Professional Expenses",
    expenseSubType: "Legal Consultant Fee",
    periodMonth: "",
    periodYear: "",
    relatedPatientPhone: "",
    relatedPatientId: "",
    amount: "50000",
    dueDate: "15-09-2026",
    branch: "Delhi",
    remarks: "Retainer — Sept",
    costAlreadyRecognised: "NO",
    excludeFromPnl: "NO",
    includeGST: "YES",
    gstRate: "18",
    gstAmount: "",
    includeTDS: "YES",
    tdsCategory: "TDS on Professional Service Ryan Skin",
    tdsRate: "10",
    tdsAmount: "",
  },
  {
    purpose: "SALARY",
    payeeKind: "EMPLOYEE",
    payeeLabel: "Ramesh Kumar",
    payeeRefId: "",
    payeeLookup: "9876543210",
    expenseCategory: "Salary",
    expenseSubType: "Salary",
    periodMonth: "9",
    periodYear: "2026",
    relatedPatientPhone: "",
    relatedPatientId: "",
    amount: "45000",
    dueDate: "30-09-2026",
    branch: "Delhi",
    remarks: "",
    costAlreadyRecognised: "NO",
    excludeFromPnl: "NO",
    includeGST: "NO",
    gstRate: "",
    gstAmount: "",
    includeTDS: "NO",
    tdsCategory: "",
    tdsRate: "",
    tdsAmount: "",
  },
  {
    purpose: "RENT",
    payeeKind: "RENT_UNIT",
    payeeLabel: "Rent-CD Clinic",
    payeeRefId: "",
    payeeLookup: "",
    expenseCategory: "Rent",
    expenseSubType: "Rent-CD Clinic",
    periodMonth: "9",
    periodYear: "2026",
    relatedPatientPhone: "",
    relatedPatientId: "",
    amount: "80000",
    dueDate: "05-09-2026",
    branch: "Delhi",
    remarks: "",
    costAlreadyRecognised: "NO",
    excludeFromPnl: "NO",
    includeGST: "NO",
    gstRate: "",
    gstAmount: "",
    includeTDS: "NO",
    tdsCategory: "",
    tdsRate: "",
    tdsAmount: "",
  },
];
