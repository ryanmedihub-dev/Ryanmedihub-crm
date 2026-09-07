// The one validation pipeline for the bulk-Payable upload. /validate calls it and returns
// the results; /commit calls it again from scratch (never trusting the client's payloads)
// before creating anything. SERVER ONLY.

import crypto from "node:crypto";
import { warmup, expenseTypesSync } from "@/lib/masterData";
import { ALL_BRANCHES, COLLAB_BRANCHES } from "@/lib/branches";
import { TDS_TAX_TYPES } from "@/constants/expenseCategories";
import { computeTaxBreakdown, round2 } from "@/lib/taxMath";
import { checkPeriodLock } from "@/lib/periodLock";
import {
  PAYABLE_KIND_VALUES,
  PAYABLE_PURPOSE_VALUES,
  MONTHLY_PAYABLE_PURPOSES as MODEL_MONTHLY_PURPOSES,
} from "@/models/Payable";
import {
  PURPOSE_TO_CATEGORY,
  PURPOSE_LABELS,
  MONTHLY_PAYABLE_PURPOSES,
  parsePayableRowFormat,
  deriveRequirements,
  defaultKindForPurpose,
  monthlyDupKey,
} from "@/lib/uploads/payableRowMapper";
import {
  resolveRefs,
  resolvePayeeForRow,
  resolveRelatedPatient,
} from "@/lib/uploads/resolveRefs";

// Guard the one place the pure module duplicates a model constant (see payableRowMapper.js).
if (
  MONTHLY_PAYABLE_PURPOSES.length !== MODEL_MONTHLY_PURPOSES.length ||
  MONTHLY_PAYABLE_PURPOSES.some((p) => !MODEL_MONTHLY_PURPOSES.includes(p))
) {
  throw new Error(
    "payableRowMapper.MONTHLY_PAYABLE_PURPOSES has drifted from models/Payable.js — update the literal.",
  );
}

export const MAX_ROWS = 500;

const ALL_CATEGORIES = [...new Set(Object.values(PURPOSE_TO_CATEGORY))];

function buildCtx() {
  return {
    purposeValues: PAYABLE_PURPOSE_VALUES,
    kindValues: PAYABLE_KIND_VALUES,
    branches: ALL_BRANCHES,
    collabBranches: COLLAB_BRANCHES,
    tdsTypes: TDS_TAX_TYPES,
    allCategories: ALL_CATEGORIES,
    subTypesFor: (category) => expenseTypesSync(category),
  };
}

function canonicalHash(payload) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sortDeep(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return crypto.createHash("sha256").update(JSON.stringify(sortDeep(payload))).digest("hex");
}

/**
 * @param rows   array of raw sheet-row objects (header key -> cell value)
 * @returns { summary, results }
 */
export async function runValidatePipeline(rows) {
  await warmup();
  const ctx = buildCtx();

  // 1. format parse (pure)
  const parsed = rows.map((raw, i) => parsePayableRowFormat(raw || {}, i + 2, ctx));

  // 2. batched ref resolution
  const refs = await resolveRefs(parsed);

  // pre-fetched monthly payables -> key set for the DB duplicate check
  const existingByKey = new Map();
  for (const p of refs.existingPayables) {
    existingByKey.set(
      monthlyDupKey({
        kind: p.payee?.kind,
        refId: p.payee?.refId ? String(p.payee.refId) : "",
        label: p.payee?.label,
        purpose: p.purpose,
        expenseSubType: p.expenseSubType,
        period: p.period,
      }),
      p,
    );
  }

  const periodLockCache = new Map();
  const lockReasonFor = async (date) => {
    const key = (date ? new Date(date) : new Date()).toISOString().slice(0, 10);
    if (!periodLockCache.has(key)) {
      periodLockCache.set(key, await checkPeriodLock({ furtherMode: null, date: date || new Date() }));
    }
    return periodLockCache.get(key);
  };

  const seenInFile = new Map(); // dup key -> first rowNumber
  const results = [];

  for (const row of parsed) {
    const result = {
      rowNumber: row.rowNumber,
      status: "ok",
      errors: [...row.errors],
      warnings: [...row.warnings],
      payload: null,
      preview: null,
      rowHash: null,
      periodLocked: false,
    };

    if (!row.purpose || result.errors.length > 0) {
      // still try to attach whatever preview we can, but this row cannot commit
      result.status = "error";
      results.push(finalisePreview(result, row, null, null));
      continue;
    }

    // 3a. payee
    const payee = resolvePayeeForRow(row, refs, { defaultKindForPurpose, deriveRequirements });
    result.errors.push(...payee.errors);
    result.warnings.push(...payee.warnings);

    // 3b. related patient (also the payee ref for PATIENT_COMMISSION)
    let relatedPatientId;
    let relatedPatientLabel = null;
    if (row.flags.needsPatient) {
      const rp = resolveRelatedPatient(row, refs);
      result.errors.push(...rp.errors);
      relatedPatientId = rp.id || undefined;
      relatedPatientLabel = rp.label;
      if (row.purpose === "PATIENT_COMMISSION" && rp.id) {
        payee.kind = "PATIENT";
        payee.refId = rp.id;
        payee.label = rp.label || payee.label;
      }
    }

    // 3c. refId requirement (post-resolution). Skip the generic message when a more specific
    // "not found / ambiguous" error is already on the row, or when patient resolution (which
    // reports its own errors) owns the ref.
    const reqs = deriveRequirements(row.purpose, payee.kind);
    const patientOwnsRef = row.flags.needsPatient && payee.kind === "PATIENT";
    if (reqs.needsRefId && !payee.refId && !patientOwnsRef) {
      if (!result.errors.some((e) => /not found|no .* with that id|patients? (match|with that|share)/i.test(e))) {
        result.errors.push(`payee: ${payee.kind} requires a resolved reference — none matched "${row.payeeLabel}".`);
      }
    }

    // 3d. tax breakdown
    const tax = computeTaxBreakdown({
      baseAmount: row.baseAmount || 0,
      includeGST: row.includeGST,
      gstRate: row.gstRate ?? "",
      gstAmount: row.gstAmount ?? "",
      includeTDS: row.includeTDS,
      tdsRate: row.tdsRate ?? "",
      tdsAmount: row.tdsAmount ?? "",
      tdsCategory: row.tdsCategory,
    });
    if (row.includeGST && !(tax.gstAmount > 0)) result.errors.push("GST amount resolves to 0 — check gstRate / gstAmount");
    if (row.includeTDS) {
      if (!(tax.tdsAmount > 0)) result.errors.push("TDS amount resolves to 0 — check tdsRate / tdsAmount");
      else if (tax.tdsAmount >= tax.invoiceTotal) {
        result.errors.push(`TDS (₹${tax.tdsAmount}) must be less than the invoice total (₹${tax.invoiceTotal})`);
      }
    }

    // 3e. build the exact createPayable payload
    const payload = {
      payee: { kind: payee.kind, label: payee.label, refId: payee.refId || undefined },
      purpose: row.purpose,
      expenseCategory: row.expenseCategory,
      expenseSubType: row.expenseSubType || "",
      period: row.period || undefined,
      relatedPatient: relatedPatientId,
      totalAmount: row.baseAmount, // base — createPayable derives vendorPayable itself
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : undefined,
      branch: row.branch || undefined,
      remarks: row.remarks || "",
      costAlreadyRecognised: row.costAlreadyRecognised === true,
      excludeFromPnl: row.excludeFromPnl === true,
      includeGST: row.includeGST,
      gstRate: row.gstRate ?? undefined,
      gstAmount: row.gstAmount ?? undefined,
      includeTDS: row.includeTDS,
      tdsCategory: row.includeTDS ? row.tdsCategory : undefined,
      tdsRate: row.tdsRate ?? undefined,
      tdsAmount: row.tdsAmount ?? undefined,
    };
    result.payload = payload;
    result.rowHash = canonicalHash(payload);

    // 3f. duplicate checks (monthly purposes only — mirrors the partial unique index).
    // The key now includes the sub-type/head, so different heads for the same vendor/month
    // are NOT duplicates. An identical row twice in one file is still an error (a paste
    // mistake); a match against an ALREADY-EXISTING payable is only a warning — it imports
    // anyway (the user asked for this: old payables must not block new uploads).
    if (MONTHLY_PAYABLE_PURPOSES.includes(row.purpose) && row.period) {
      const key = monthlyDupKey({
        kind: payee.kind,
        refId: payee.refId,
        label: payee.label,
        purpose: row.purpose,
        expenseSubType: row.expenseSubType,
        period: row.period,
      });
      const firstRow = seenInFile.get(key);
      if (firstRow) {
        result.errors.push(
          `Duplicate of row ${firstRow} — same payee, purpose, head and month.`,
        );
      } else {
        seenInFile.set(key, row.rowNumber);
      }
      const existing = existingByKey.get(key);
      if (existing) {
        const when = existing.createdAt
          ? new Date(existing.createdAt).toLocaleDateString("en-GB")
          : "earlier";
        const head = row.expenseSubType ? ` — ${row.expenseSubType}` : "";
        result.warnings.push(
          `A matching ${row.purpose}${head} payable for ${payee.label} (${row.period.month}/${row.period.year}) already exists (₹${(
            existing.totalAmount || 0
          ).toLocaleString("en-IN")}, created ${when}). Importing anyway.`,
        );
      }
    }

    // 3g. period lock (memoised per date)
    const lockReason = await lockReasonFor(row.dueDate);
    if (lockReason) {
      result.errors.push(lockReason);
      result.periodLocked = true;
    }

    result.status = result.errors.length > 0 ? "error" : result.warnings.length > 0 ? "warning" : "ok";
    results.push(finalisePreview(result, row, payee, tax));
  }

  const willCreateDocs = results.reduce((n, r) => {
    if (r.status === "error") return n;
    return n + 1 + (r.preview?.createsTdsPayable ? 1 : 0);
  }, 0);

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    warning: results.filter((r) => r.status === "warning").length,
    error: results.filter((r) => r.status === "error").length,
    willCreateDocs,
    totalBase: round2(results.reduce((s, r) => s + (r.status !== "error" ? r.preview?.baseAmount || 0 : 0), 0)),
    totalVendorPayable: round2(
      results.reduce((s, r) => s + (r.status !== "error" ? r.preview?.vendorPayable || 0 : 0), 0),
    ),
    periodLocked: results.some((r) => r.periodLocked),
  };

  return { summary, results };
}

function finalisePreview(result, row, payee, tax) {
  const base = tax ? tax.baseAmount : row.baseAmount || 0;
  result.preview = {
    payeeLabel: payee?.label || row.payeeLabel || "",
    payeeKind: payee?.kind || row.declaredKind || "",
    purposeLabel: PURPOSE_LABELS[row.purpose] || row.purpose || "",
    expenseCategory: row.expenseCategory || "",
    expenseSubType: row.expenseSubType || "",
    period: row.period || null,
    baseAmount: base,
    gstAmount: tax ? tax.gstAmount : 0,
    invoiceTotal: tax ? tax.invoiceTotal : base,
    tdsAmount: tax ? tax.tdsAmount : 0,
    vendorPayable: tax ? tax.vendorPayable : base,
    createsTdsPayable: !!(tax && row.includeTDS && tax.tdsAmount > 0),
    dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : "",
    branch: row.branch || "",
  };
  return result;
}
