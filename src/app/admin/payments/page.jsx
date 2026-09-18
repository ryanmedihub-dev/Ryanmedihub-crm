"use client";

import { Suspense, useState } from "react";
import { Wallet, Download, Loader2 } from "lucide-react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import CashReconciliation from "@/components/finance/CashReconciliation";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";
import { ALL_BRANCHES } from "@/lib/branches";
import { exportWorkbook, fetchAllPages, filterProvenanceRows } from "@/lib/exportToExcel";
import FinancingTransactions from "@/components/finance/FinancingTransactions";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsPageInner />
    </Suspense>
  );
}

function PaymentsPageInner() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [branch, setBranch] = useState("");
  const [exporting, setExporting] = useState(false);

  const scope = { branch, dateFrom: from, dateTo: to };
  const handleScopeChange = (next) => {
    setBranch(next.branch || "");
    setFrom(next.dateFrom || "");
    setTo(next.dateTo || "");
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const p = new URLSearchParams({ level: "1", from, to });
      if (branch) p.set("branch", branch);
      const json = await fetch(`/api/payments/grouped?${p}`).then((r) => r.json());
      const heads = json.rows || [];

      const overviewRows = heads.map((r) => ({
        "Expense Head": r.label,
        "Before Period": r.opening,
        "This Period": r.movement,
        "Total To Date": r.closing,
        Count: r.count,
      }));

      // Every payment for the period on one sheet, regardless of expense head.
      const branchQS = branch ? `&branch=${encodeURIComponent(branch)}` : "";
      const { rows: leafRows } = await fetchAllPages(
        (page, limit) =>
          `/api/payments/grouped?level=3&all=1&from=${from}&to=${to}&page=${page}&limit=${limit}${branchQS}`,
        "rows",
        { limit: 200, maxPages: 60 },
      );

      const allPaymentsRows = leafRows.map((r) => ({
        Date: r.date ? new Date(r.date) : null,
        Narration: r.narration || "—",
        "Expense Category": r.expense || "—",
        "Expense Sub-Category": r.expenseType || "—",
        Method: (r.method || "").replace(/_/g, " ") || "—",
        Account: r.account || "—",
        Branch: r.branch || "—",
        Amount: r.amount || 0,
        "Running Total": r.runningBalance ?? "",
      }));

      await exportWorkbook({
        filename: `payments_${from}_to_${to}.xlsx`,
        sheets: [
          { name: "Info", rows: filterProvenanceRows({ dateFrom: from, dateTo: to, branch }), colWidths: [22, 24] },
          {
            name: "Overview",
            rows: overviewRows,
            colWidths: [24, 16, 16, 16, 10],
            currencyCols: ["Before Period", "This Period", "Total To Date"],
          },
          {
            name: "All Payments",
            rows: allPaymentsRows,
            colWidths: [12, 30, 22, 24, 14, 18, 12, 14, 16],
            currencyCols: ["Amount", "Running Total"],
          },
        ],
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <Wallet className="h-5 w-5" />
                </span>
                <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Every rupee that actually left a cash or bank account — pure cash basis, the
                mirror of Receipts.
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download Excel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Period</span>
            <DebouncedDateInput
              value={from}
              onCommit={setFrom}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            />
            <span className="text-gray-400 text-xs">to</span>
            <DebouncedDateInput
              value={to}
              onCommit={setTo}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            >
              <option value="">All branches</option>
              {ALL_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <CashReconciliation from={from} to={to} branch={branch} />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Payments</h2>
            </div>
            <DrillDownTable
              levels={3}
              sectionConfig={{
                key: "payments",
                mode: "grouped",
                apiBase: "/api/payments",
                title: "Payments",
                columnLabels: {
                  opening: "Before this period",
                  movement: "This period",
                  settled: "—",
                  closing: "Total to date",
                },
              }}
              scope={scope}
              onScopeChange={handleScopeChange}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Advance Transactions
            </h2>
            <FinancingTransactions kind="advance" from={from} to={to} branch={branch} />
          </section>
        </div>
      </main>
    </div>
  );
}
