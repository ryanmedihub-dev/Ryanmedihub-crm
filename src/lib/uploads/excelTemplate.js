// Client-side Excel handling for /admin/uploads. xlsx is dynamic-imported so it stays out of
// the initial bundle — same pattern as src/lib/exportToExcel.js.

import {
  HEADERS,
  EXAMPLE_ROWS,
  PURPOSE_TO_CATEGORY,
  GENERIC_SUBTYPE_PURPOSES,
  MONTHLY_PAYABLE_PURPOSES,
} from "@/lib/uploads/payableRowMapper";

const SHEET = "Payables";

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * @returns {{ rows, missingHeaders: string[], extraHeaders: string[] }}
 *   rows          — array of {header: string} objects, strings trimmed, all-blank rows dropped
 *   missingHeaders— template columns not found in the file's header row
 *   extraHeaders  — columns in the file that the template doesn't know (kept, just flagged)
 */
export async function readUploadedWorkbook(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets[SHEET] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], missingHeaders: [...HEADERS], extraHeaders: [] };

  // header row as-is
  const headerMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const fileHeaders = (headerMatrix[0] || []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const fileHeaderSet = new Set(fileHeaders.map((h) => h.toLowerCase()));
  const missingHeaders = HEADERS.filter((h) => !fileHeaderSet.has(h.toLowerCase()));
  const extraHeaders = fileHeaders.filter((h) => !HEADERS.some((k) => k.toLowerCase() === h.toLowerCase()));

  const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, blankrows: false });
  const rows = raw
    .map((r) => {
      const trimmed = {};
      for (const [k, v] of Object.entries(r)) {
        trimmed[k] = typeof v === "string" ? v.trim() : v;
      }
      return trimmed;
    })
    .filter((r) => HEADERS.some((h) => String(r[h] ?? "").trim() !== ""));

  return { rows, missingHeaders, extraHeaders };
}

/* ------------------------------------------------------------------ */
/* Writing — three sheets                                              */
/* ------------------------------------------------------------------ */

const MATH_BLOCK = [
  ["HOW THE MONEY COLUMNS WORK", ""],
  ["amount", "The BASE (taxable) figure you agreed with the payee. Enter it here."],
  ["invoiceTotal", "= amount + gstAmount   (computed for you)"],
  ["vendorPayable", "= invoiceTotal − tdsAmount   (this is what the saved Payable carries as its amount)"],
  ["", ""],
  [
    "TDS makes a 2nd Payable",
    'When includeTDS = YES a second, linked Payable is created automatically: purpose TAX, category Taxes, payee = the tdsCategory text, amount = the TDS amount. So ONE row here can create TWO Payable documents. The preview screen shows this per row.',
  ],
  ["", ""],
  ["Before you upload", "Delete the three example rows on the Payables sheet."],
  [
    "Dropdowns",
    "This file has no built-in dropdowns (the writer can't add them). The valid values are on the Lists sheet — if you want dropdowns, select a column and use Data → Validation → List pointing at the matching Lists column. The server validates every value regardless.",
  ],
  ["", ""],
];

const FIELD_GUIDE = [
  ["purpose", "REQUIRED. One of Lists→Purposes. Case-insensitive; 'Patient Commission' etc. also accepted."],
  ["payeeKind", "Optional. Leave blank — derived from purpose. If set it must agree with the derived kind."],
  ["payeeLabel", "REQUIRED. Payee's display name. Also the lookup key for EMPLOYEE / VENDOR / PATIENT when payeeRefId is blank."],
  ["payeeRefId", "24-char id. Required (after lookup) for EMPLOYEE / PATIENT / VENDOR. Fill it when a name is ambiguous."],
  ["payeeLookup", "Optional. Phone or email to disambiguate the lookup (for a patient, prefer phone)."],
  ["expenseCategory", "Optional. Auto-filled from purpose. If typed, must equal the purpose's category (Lists→Category→SubType)."],
  ["expenseSubType", `REQUIRED for ${GENERIC_SUBTYPE_PURPOSES.join(", ")}. Must be a sub-type from Lists→Category→SubType.`],
  ["periodMonth", `REQUIRED for ${MONTHLY_PAYABLE_PURPOSES.join(", ")}. 1-12 or 'Jan'/'January'.`],
  ["periodYear", "Same rows as periodMonth. 2000-2100."],
  ["relatedPatientPhone", "REQUIRED for INCENTIVE / PATIENT_COMMISSION. The patient's phone."],
  ["relatedPatientId", "Optional escape hatch — a patient id. Wins over relatedPatientPhone."],
  ["amount", "REQUIRED. Positive number. ₹ and commas are fine (₹1,20,000). This is the BASE amount — see the block above."],
  ["dueDate", "Optional. DD-MM-YYYY (DAY first). Also used for the period-lock check."],
  ["branch", "Optional. One of Lists→Branches. Blank uses your own branch."],
  ["remarks", "Optional free text."],
  ["costAlreadyRecognised", "Optional. YES / NO (blank = NO)."],
  ["excludeFromPnl", "Optional. YES / NO (blank = NO)."],
  ["includeGST", "Optional. YES / NO. If YES, fill gstRate OR gstAmount."],
  ["gstRate", "0-28. Percent of the base."],
  ["gstAmount", "Absolute ₹. Wins over gstRate."],
  ["includeTDS", "Optional. YES / NO. If YES, fill tdsCategory AND (tdsRate OR tdsAmount)."],
  ["tdsCategory", "One of Lists→TDS Categories (exact text). Only used when includeTDS = YES."],
  ["tdsRate", "Percent of the base."],
  ["tdsAmount", "Absolute ₹. Wins over tdsRate. Must be > 0 and less than the invoice total."],
];

function payablesSheet(XLSX, withExamples) {
  const rows = withExamples ? EXAMPLE_ROWS : [];
  const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
  ws["!cols"] = HEADERS.map(() => ({ wch: 18 }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 }; // freeze the header row
  return ws;
}

function instructionsSheet(XLSX) {
  const aoa = [["Column", "What to write"], ...MATH_BLOCK, ["FIELD-BY-FIELD", ""], ...FIELD_GUIDE];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 22 }, { wch: 130 }];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function listsSheet(XLSX, lists) {
  const enumCols = [
    ["Purposes", lists.purposes || Object.keys(PURPOSE_TO_CATEGORY)],
    ["Payee Kinds", lists.kinds || []],
    ["Branches", lists.branches || []],
    ["Collab Branches", lists.collabBranches || []],
    ["Expense Categories", lists.categories || []],
    ["TDS Categories", lists.tdsCategories || []],
  ];
  const height = Math.max(...enumCols.map(([, v]) => v.length), 0);
  const aoa = [enumCols.map(([h]) => h)];
  for (let i = 0; i < height; i++) aoa.push(enumCols.map(([, v]) => v[i] ?? ""));

  // gap, then the Category -> SubType map (two columns)
  aoa.push([], ["Category", "SubType"]);
  const tree = lists.categoryTree || {};
  for (const [cat, subs] of Object.entries(tree)) {
    if (!subs || subs.length === 0) {
      aoa.push([cat, ""]);
    } else {
      for (const s of subs) aoa.push([cat, s]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 26 },
    { wch: 34 },
  ];
  return ws;
}

/** @returns Uint8Array (xlsx bytes) */
export async function buildTemplateBytes(lists, { withExamples = true } = {}) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, payablesSheet(XLSX, withExamples), SHEET);
  XLSX.utils.book_append_sheet(wb, instructionsSheet(XLSX), "Instructions");
  XLSX.utils.book_append_sheet(wb, listsSheet(XLSX, lists), "Lists");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

/**
 * Only the failed rows — original 24 columns + _row + _errors, so the user fixes this file
 * and re-uploads it directly.
 * @param failedRows [{ raw, rowNumber, errors: [] }]
 */
export async function buildErrorReportBytes(failedRows) {
  const XLSX = await import("xlsx");
  const header = [...HEADERS, "_row", "_errors"];
  const data = failedRows.map((r) => ({
    ...HEADERS.reduce((acc, h) => ({ ...acc, [h]: r.raw?.[h] ?? "" }), {}),
    _row: r.rowNumber,
    _errors: (r.errors || []).join(" | "),
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header });
  ws["!cols"] = header.map((h) => ({ wch: h === "_errors" ? 90 : 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
