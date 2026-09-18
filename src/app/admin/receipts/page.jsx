"use client";

import { Suspense, useState } from "react";
import { HandCoins, Download, Loader2 } from "lucide-react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import CashReconciliation from "@/components/finance/CashReconciliation";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";
import { ALL_BRANCHES } from "@/lib/branches";
import { exportWorkbook, filterProvenanceRows } from "@/lib/exportToExcel";
import { receiptPaymentHeadSheets } from "@/lib/finance/headedExport";
import FinancingTransactions from "@/components/finance/FinancingTransactions";

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ReceiptsPage() {
  return (
    <Suspense fallback={null}>
      <ReceiptsPageInner />
    </Suspense>
  );
}

function ReceiptsPageInner() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [branch, setBranch] = useState("");
  const [groupBy, setGroupBy] = useState("account");
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
      const p = new URLSearchParams({ level: "1", from, to, groupBy });
      if (branch) p.set("branch", branch);
      const json = await fetch(`/api/receipts/grouped?${p}`).then((r) => r.json());
      const heads = json.rows || [];

      const overviewRows = heads.map((r) => ({
        [groupBy === "mode" ? "Receipt Mode" : "Account"]: r.label,
        "Before Period": r.opening,
        "This Period": r.movement,
        "Total To Date": r.closing,
        Count: r.count,
      }));

      const headSheets = await receiptPaymentHeadSheets({
        apiBase: "/api/receipts",
        heads: heads.map((r) => r.label),
        groupBy,
        scope: { dateFrom: from, dateTo: to, branch },
      });

      await exportWorkbook({
        filename: `receipts_${from}_to_${to}.xlsx`,
        sheets: [
          {
            name: "Info",
            rows: filterProvenanceRows({ dateFrom: from, dateTo: to, branch }),
            colWidths: [22, 24],
          },
          {
            name: "Overview",
            rows: overviewRows,
            colWidths: [24, 16, 16, 16, 10],
            currencyCols: ["Before Period", "This Period", "Total To Date"],
          },
          ...headSheets,
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
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <HandCoins className="h-5 w-5" />
                </span>
                <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Every rupee that actually entered a cash or bank account — pure cash basis, the
                mirror of Payments.
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Receipts</h2>
              </div>
              <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                {[
                  { v: "account", l: "By Account" },
                  { v: "mode", l: "By Receipt Mode" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setGroupBy(o.v)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                      groupBy === o.v ? "bg-white shadow-sm text-emerald-700" : "text-gray-500"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <DrillDownTable
              levels={3}
              sectionConfig={{
                key: "receipts",
                mode: "grouped",
                apiBase: "/api/receipts",
                title: "Receipts",
                columnLabels: {
                  opening: "Before this period",
                  movement: "This period",
                  settled: "—",
                  closing: "Total to date",
                },
              }}
              extraParams={{ groupBy }}
              scope={scope}
              onScopeChange={handleScopeChange}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Borrowing Transactions
            </h2>
            <FinancingTransactions kind="borrowing" from={from} to={to} branch={branch} />
          </section>
        </div>
      </main>
    </div>
  );
}
