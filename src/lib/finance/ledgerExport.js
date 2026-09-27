"use client";

import { exportWorkbook, fetchAllPages, filterProvenanceRows } from "@/lib/exportToExcel";
import { ledgerHeadSheets } from "@/lib/finance/headedExport";
import { RENT_PURPOSES, EMPLOYEE_PURPOSES, OTHER_PURPOSES } from "@/constants/payableGroups";

const today = () => new Date().toISOString().slice(0, 10);
const d = (v) => (v ? new Date(v) : null);
const scopeQS = (scope) => {
  const p = new URLSearchParams();
  if (scope.branch) p.set("branch", scope.branch);
  if (scope.dateFrom) p.set("from", scope.dateFrom);
  p.set("to", scope.dateTo || today());
  return p.toString();
};

const PAGE_PURPOSES = {
  "payables-rent": RENT_PURPOSES,
  "payables-employees": EMPLOYEE_PURPOSES,
  "payables-other": OTHER_PURPOSES,
};

const PAGE_META = {
  "cash-book": { label: "Cash Book" },
  "loan-accounts": { label: "Loan Accounts" },
  receivables: { label: "Receivables" },
  advances: { label: "Advances" },
  "payables-rent": { label: "Rent Payables" },
  "payables-employees": { label: "Employee Payables" },
  "payables-other": { label: "Other Payables" },
  suspense: { label: "Suspense" },
  borrowings: { label: "Borrowings" },
};

const infoSheet = (label, scope, headline, truncated) => ({
  name: "Info",
  rows: [
    { Field: "Page", Value: label },
    ...filterProvenanceRows({ branch: scope.branch, dateFrom: scope.dateFrom, dateTo: scope.dateTo }),
    { Field: "TRUNCATED", Value: truncated ? "yes" : "no" },
    ...Object.entries(headline || {}).map(([Field, Value]) => ({ Field, Value })),
  ],
  colWidths: [22, 26],
});

export async function exportLedgerPage({ pageKey, scope, extraParams = {}, toast }) {
  const meta = PAGE_META[pageKey];
  if (!meta) throw new Error(`Unknown export page "${pageKey}"`);
  const qs = scopeQS(scope);
  const fname = (name) =>
    `${name}_${scope.branch || "All"}_${scope.dateFrom || "start"}_to_${scope.dateTo || "today"}.xlsx`;
  let truncated = false;

  
  if (pageKey === "cash-book" || pageKey === "loan-accounts") {
    const filter = pageKey === "cash-book" ? "cash" : "loans";
    const extraQS = extraParams.accounts ? `&accounts=${encodeURIComponent(extraParams.accounts)}` : "";
    const grp = await fetch(`/api/close-book/accounts?filter=${filter}&${qs}${extraQS}`).then((r) => r.json());
    const rows = grp.rows || [];
    const total = rows.reduce((s, r) => s + (r.closing || 0), 0);
    const ledgers = await ledgerHeadSheets({ accounts: rows.map((r) => r.label), scope });
    await exportWorkbook({
      filename: fname(meta.label.replace(/\s+/g, "_")),
      sheets: [
        infoSheet(meta.label, scope, { "Closing balance": total }, truncated),
        {
          name: "Summary",
          rows: rows.map((r) => ({
            Account: r.label,
            "Opening balance": r.opening,
            "Money in": r.movement,
            "Money out": r.settled,
            Balance: r.closing,
            Count: r.count,
          })),
          colWidths: [22, 16, 16, 16, 16, 10],
          currencyCols: ["Opening balance", "Money in", "Money out", "Balance"],
        },
        ...ledgers,
      ],
    });
    toast?.success(`${meta.label} exported`);
    return;
  }

  
  if (pageKey === "receivables") {
    const grp = await fetch(`/api/receivables/grouped?level=1&${qs}`).then((r) => r.json());
    const listParams = new URLSearchParams({ ...extraParams });
    if (scope.branch) listParams.set("branch", scope.branch);
    if (scope.dateFrom) listParams.set("dateFrom", scope.dateFrom);
    if (scope.dateTo) listParams.set("dateTo", scope.dateTo);
    const detail = await fetchAllPages(
      (page, limit) => `/api/receivables/list?${listParams}&page=${page}&limit=${limit}`,
      "receivables",
      { limit: 200, maxPages: 50 },
    );
    truncated = detail.truncated;
    if (truncated) toast?.error("Export capped at the 10000 newest receivables — narrow the date range for a complete file.");
    const rows = grp.rows || [];
    await exportWorkbook({
      filename: fname("Receivables"),
      sheets: [
        infoSheet(meta.label, scope, { "Still due": rows.reduce((s, r) => s + (r.closing || 0), 0) }, truncated),
        {
          name: "Summary",
          rows: rows.map((r) => ({ Category: r.label, Opening: r.opening, Raised: r.movement, Received: r.settled, "Still due": r.closing, Count: r.count })),
          colWidths: [22, 14, 14, 14, 14, 10],
          currencyCols: ["Opening", "Raised", "Received", "Still due"],
        },
        {
          name: "Receivables",
          rows: (detail.rows || []).map((r) => ({
            Payer: r.payer?.label || "—",
            Category: r.revenueCategory || "—",
            "Raised On": d(r.createdAt),
            "Due Date": d(r.dueDate),
            Total: r.totalAmount || 0,
            Received: r.received || 0,
            Pending: r.pending || 0,
            Status: r.status || "",
          })),
          colWidths: [22, 18, 12, 12, 14, 14, 14, 14],
          currencyCols: ["Total", "Received", "Pending"],
        },
      ],
    });
    toast?.success("Receivables exported");
    return;
  }

  
  if (pageKey === "advances") {
    const p = new URLSearchParams({ direction: "OUT", ...extraParams });
    if (scope.branch) p.set("branch", scope.branch);
    if (scope.dateFrom) p.set("from", scope.dateFrom);
    if (scope.dateTo) p.set("to", scope.dateTo);
    const detail = await fetchAllPages(
      (page, limit) => `/api/advances/list?${p}&page=${page}&limit=${limit}`,
      "advances",
      { limit: 200, maxPages: 50 },
    );
    truncated = detail.truncated;
    if (truncated) toast?.error("Export capped at the 10000 newest advances — narrow the date range for a complete file.");
    const rows = detail.rows || [];
    const remaining = rows.reduce((s, r) => s + (r.remaining ?? 0), 0);
    await exportWorkbook({
      filename: fname("Advances"),
      sheets: [
        infoSheet(meta.label, scope, { "Total remaining": remaining, Advances: rows.length }, truncated),
        {
          name: "Advances",
          rows: rows.map((r) => ({
            Date: d(r.date),
            Party: r.party?.label || "—",
            Account: r.account || "—",
            Amount: r.amount || 0,
            Settled: r.settledTotal ?? 0,
            "Cash recovered": r.cashRecovered ?? 0,
            Remaining: r.remaining ?? 0,
            Branch: r.branch || "—",
            Reference: r.reference || "—",
          })),
          colWidths: [12, 22, 16, 14, 14, 16, 14, 14, 18],
          currencyCols: ["Amount", "Settled", "Cash recovered", "Remaining"],
        },
      ],
    });
    toast?.success("Advances exported");
    return;
  }

  
  if (pageKey === "suspense") {
    const suspenseExtraQS = new URLSearchParams(extraParams).toString();
    const grp = await fetch(`/api/suspense?groupBy=account&${qs}${suspenseExtraQS ? `&${suspenseExtraQS}` : ""}`).then((r) => r.json());
    const flowQS = new URLSearchParams();
    if (scope.branch) flowQS.set("branch", scope.branch);
    if (scope.dateFrom) flowQS.set("from", scope.dateFrom);
    if (scope.dateTo) flowQS.set("to", scope.dateTo);
    if (!extraParams.status) flowQS.set("status", "all");
    const detail = await fetchAllPages(
      (page, limit) => `/api/suspense?${flowQS}${suspenseExtraQS ? `&${suspenseExtraQS}` : ""}&page=${page}&limit=${limit}`,
      "entries",
      { limit: 200, maxPages: 50 },
    );
    truncated = detail.truncated;
    if (truncated) toast?.error("Export capped at the 10000 newest suspense entries — narrow the date range for a complete file.");
    const rows = grp.rows || [];
    await exportWorkbook({
      filename: fname("Suspense"),
      sheets: [
        infoSheet(meta.label, scope, { Unresolved: rows.reduce((s, r) => s + (r.closing || 0), 0) }, truncated),
        {
          name: "Summary",
          rows: rows.map((r) => ({ Account: r.label, Received: r.movement, Reclassified: r.settled, Unresolved: r.closing, Count: r.count })),
          colWidths: [22, 16, 16, 16, 10],
          currencyCols: ["Received", "Reclassified", "Unresolved"],
        },
        {
          name: "Entries",
          rows: (detail.rows || []).map((s) => ({
            Date: d(s.date),
            Account: s.account,
            Direction: s.direction,
            Amount: s.amount || 0,
            Remarks: s.remarks || s.reference || "—",
            Status: s.isResolved ? "Resolved" : s.isCancelled ? "Cancelled" : "Open",
          })),
          colWidths: [12, 20, 10, 14, 30, 12],
          currencyCols: ["Amount"],
        },
      ],
    });
    toast?.success("Suspense exported");
    return;
  }

  
  if (pageKey === "borrowings") {
    const grp = await fetch(`/api/borrowings/grouped?level=1&${qs}`).then((r) => r.json());
    const rows = grp.rows || [];
    await exportWorkbook({
      filename: fname("Borrowings"),
      sheets: [
        infoSheet(meta.label, scope, { "Still owed": rows.reduce((s, r) => s + (r.closing || 0), 0) }, truncated),
        {
          name: "Summary",
          rows: rows.map((r) => ({ Head: r.label, Opening: r.opening, Raised: r.movement, Repaid: r.settled, "Still owed": r.closing, Count: r.count })),
          colWidths: [24, 14, 14, 14, 14, 10],
          currencyCols: ["Opening", "Raised", "Repaid", "Still owed"],
        },
      ],
    });
    toast?.success("Borrowings exported");
    return;
  }

  
  const purposes = PAGE_PURPOSES[pageKey];
  if (purposes) {
    const purposeCSV = purposes.join(",");
    const grpExtraQS = extraParams.party ? `&party=${encodeURIComponent(extraParams.party)}` : "";
    const grp = await fetch(`/api/payables/grouped?level=1&purpose=${purposeCSV}&${qs}${grpExtraQS}`).then((r) => r.json());
    const listParams = new URLSearchParams({ purpose: purposeCSV, ...extraParams });
    if (scope.branch) listParams.set("branch", scope.branch);
    if (scope.dateFrom) listParams.set("dateFrom", scope.dateFrom);
    if (scope.dateTo) listParams.set("dateTo", scope.dateTo);
    const detail = await fetchAllPages(
      (page, limit) => `/api/payables/list?${listParams}&page=${page}&limit=${limit}`,
      "payables",
      { limit: 200, maxPages: 50 },
    );
    truncated = detail.truncated;
    if (truncated) toast?.error("Export capped at the 10000 newest payables — narrow the date range for a complete file.");
    const rows = grp.rows || [];
    await exportWorkbook({
      filename: fname(meta.label.replace(/\s+/g, "_")),
      sheets: [
        infoSheet(meta.label, scope, { "Still owed": rows.reduce((s, r) => s + (r.closing || 0), 0) }, truncated),
        {
          name: "Summary",
          rows: rows.map((r) => ({ Head: r.label, Opening: r.opening, Raised: r.movement, Paid: r.settled, "Still owed": r.closing, Count: r.count })),
          colWidths: [24, 14, 14, 14, 14, 10],
          currencyCols: ["Opening", "Raised", "Paid", "Still owed"],
        },
        {
          name: "Payables",
          rows: (detail.rows || []).map((r) => ({
            Payee: r.payee?.label || "—",
            Purpose: (r.purpose || "").replace(/_/g, " "),
            "Sub-type": r.expenseSubType || r.expenseCategory || "—",
            Period: r.period?.month && r.period?.year ? `${r.period.month}/${r.period.year}` : "—",
            "Raised On": d(r.createdAt),
            "Due Date": d(r.dueDate),
            Total: r.totalAmount || 0,
            Paid: r.paid || 0,
            Pending: r.pending || 0,
            Status: r.status || "",
          })),
          colWidths: [22, 16, 18, 10, 12, 12, 14, 14, 14, 14],
          currencyCols: ["Total", "Paid", "Pending"],
        },
      ],
    });
    toast?.success(`${meta.label} exported`);
    return;
  }

  throw new Error(`No export handler for "${pageKey}"`);
}
