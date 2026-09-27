"use client";

import { exportWorkbook, fetchAllPages, filterProvenanceRows } from "@/lib/exportToExcel";

export { exportWorkbook, filterProvenanceRows };

const d = (v) => (v ? new Date(v) : null);

export async function fetchInterleavedRows({ kind, scope, extraParam }) {
  
  const p = new URLSearchParams({ type: `${kind}-all` });
  if (scope.branch) p.set("branch", scope.branch);
  if (scope.dateFrom) p.set("from", scope.dateFrom);
  if (scope.dateTo) p.set("to", scope.dateTo);
  if (extraParam) Object.entries(extraParam).forEach(([k, v]) => v && p.set(k, v));

  const json = await fetch(`/api/admin/reports?${p.toString()}`).then((r) => r.json());
  if (!json.success) throw new Error(json.message || "Failed to load export data");
  return { rows: json.data || [], truncated: !!json.truncated, docLimit: json.docLimit };
}

export function groupInterleavedByHead(rows, headKey) {
  const groups = new Map();
  for (const row of rows) {
    const head = (row[headKey] || "Uncategorised").toString().trim() || "Uncategorised";
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(row);
  }
  return [...groups.entries()].map(([name, r]) => ({ name, rows: r }));
}

export function summariseInterleaved(rows, { obligationRow, amountKey = "Total Amount", paidKey }) {
  return rows
    .filter((r) => r.Row === obligationRow)
    .reduce(
      (acc, r) => {
        acc.count += 1;
        acc.total += Number(r[amountKey]) || 0;
        if (paidKey) acc.paid += Number(r[paidKey]) || 0;
        return acc;
      },
      { count: 0, total: 0, paid: 0 },
    );
}

export async function ledgerHeadSheets({ accounts, scope }) {
  const from = scope.dateFrom || "1970-01-01";
  const to = scope.dateTo || new Date().toISOString().slice(0, 10);
  const branchQS = scope.branch ? `&branch=${encodeURIComponent(scope.branch)}` : "";

  const sheets = [];
  for (const account of accounts) {
    const { rows } = await fetchAllPages(
      (page, limit) =>
        `/api/close-book/ledger?account=${encodeURIComponent(account)}&from=${from}&to=${to}&page=${page}&limit=${limit}${branchQS}`,
      "rows",
      { limit: 200, maxPages: 60 },
    );
    sheets.push({
      name: account,
      rows: rows.map((r) => ({
        Date: d(r.date),
        Narration: r.isContra
          ? `Transfer: ${r.fromAccount} → ${r.toAccount}`
          : r.remarks || r.procedure || r.expenseType || r.expense || r.reference || "—",
        Type: r.isContra
          ? "Contra"
          : r.isSuspense
            ? "Suspense"
            : r.isBorrowing
              ? "Borrowing"
              : r.isAdvance
                ? "Advance"
                : r.costType || "—",
        Party: r.patientName || "—",
        Method: (r.method || "").replace(/_/g, " ") || "—",
        Branch: r.branch || "—",
        "In": r.signedAmount > 0 ? r.signedAmount : "",
        "Out": r.signedAmount < 0 ? Math.abs(r.signedAmount) : "",
        "Running Balance": r.runningBalance ?? "",
      })),
      colWidths: [12, 34, 12, 20, 14, 12, 14, 14, 16],
      currencyCols: ["In", "Out", "Running Balance"],
    });
  }
  return sheets;
}

export async function receiptPaymentHeadSheets({ apiBase, heads, groupBy, scope }) {
  const from = scope.dateFrom || "";
  const to = scope.dateTo || "";
  const branchQS = scope.branch ? `&branch=${encodeURIComponent(scope.branch)}` : "";

  const sheets = [];
  for (const head of heads) {
    const { rows } = await fetchAllPages(
      (page, limit) =>
        `${apiBase}/grouped?level=3&category=${encodeURIComponent(head)}&groupBy=${groupBy}` +
        `&from=${from}&to=${to}&page=${page}&limit=${limit}${branchQS}`,
      "rows",
      { limit: 200, maxPages: 60 },
    );
    sheets.push({
      name: (head || "Unspecified").toString().slice(0, 31),
      rows: rows.map((r) => ({
        Date: d(r.date),
        Narration: r.narration || "—",
        Method: (r.method || "").replace(/_/g, " ") || "—",
        Account: r.account || "—",
        "Receipt Mode": r.receiptMode || "—",
        Branch: r.branch || "—",
        Amount: r.amount || 0,
        "Running Total": r.runningBalance ?? "",
      })),
      colWidths: [12, 32, 14, 18, 16, 12, 14, 16],
      currencyCols: ["Amount", "Running Total"],
    });
  }
  return sheets;
}
