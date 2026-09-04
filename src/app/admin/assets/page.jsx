"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Landmark, Banknote, HandCoins, AlertTriangle, CheckCircle2, Clock, Download, Loader2 } from "lucide-react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import LoanSettlementModal from "@/components/finance/LoanSettlementModal";
import CancelLoanModal from "@/components/finance/CancelLoanModal";
import LoanRowActions from "@/components/finance/LoanRowActions";
import RecordAdvanceModal from "@/components/finance/RecordAdvanceModal";
import MetricCard from "@/components/MetricCard";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { AGEING_BUCKETS } from "@/lib/ageing";
import { ALL_BRANCHES } from "@/lib/branches";
import { exportWorkbook, filterProvenanceRows } from "@/lib/exportToExcel";
import {
  fetchInterleavedRows,
  groupInterleavedByHead,
  summariseInterleaved,
  ledgerHeadSheets,
} from "@/lib/finance/headedExport";
import { useToast } from "@/components/Toast";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";

export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsPageInner />
    </Suspense>
  );
}

function AssetsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [scope, setScope] = useState(() => ({
    branch: searchParams.get("branch") || "",
    dateFrom: searchParams.get("from") || "",
    dateTo: searchParams.get("to") || "",
  }));

  const [cashTotal, setCashTotal] = useState(null);
  const [loansTotal, setLoansTotal] = useState(null);
  const [receivablesTotal, setReceivablesTotal] = useState(null);
  const [unattributed, setUnattributed] = useState(null);
  const [refetching, setRefetching] = useState(false);
  const [settleTx, setSettleTx] = useState(null);
  const [cancelTx, setCancelTx] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [summary, setSummary] = useState(null);
  const [ageingBuckets, setAgeingBuckets] = useState([]);
  const [ageingFilter, setAgeingFilter] = useState("");

  const [receivablesInitialDrill, setReceivablesInitialDrill] = useState(undefined);
  const [receivablesDrill, setReceivablesDrill] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [advanceModal, setAdvanceModal] = useState(null);

  const handleAdvanceSuccess = () => {
    setAdvanceModal(null);
    fetchHeaderTotals();
  };

  const closingQS = useCallback(
    (extra = {}) => {
      const p = new URLSearchParams();
      if (scope.branch) p.set("branch", scope.branch);
      p.set("to", scope.dateTo || new Date().toISOString().slice(0, 10));
      Object.entries(extra).forEach(([k, v]) => { if (v) p.set(k, v); });
      return p.toString();
    },
    [scope],
  );

  const fetchHeaderTotals = useCallback(() => {
    setRefetching(true);
    Promise.all([
      fetch(`/api/close-book/accounts?filter=cash&${closingQS()}`).then((r) => r.json()),
      fetch(`/api/close-book/accounts?filter=loans&${closingQS()}`).then((r) => r.json()),
      fetch(`/api/receivables/grouped?level=1&${closingQS()}`).then((r) => r.json()),
      fetch(`/api/receivables/summary${scope.branch ? `?branch=${scope.branch}` : ""}`).then((r) => r.json()),
      fetch(`/api/receivables/summary?ageing=1${scope.branch ? `&branch=${scope.branch}` : ""}`).then((r) => r.json()),
      fetch(`/api/close-book/balance-sheet?${closingQS({ from: "1970-01-01" })}`).then((r) => r.json()),
    ])
      .then(([cashJson, loansJson, recJson, summaryJson, ageingJson, unattrJson]) => {
        setCashTotal((cashJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0));
        setLoansTotal((loansJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0));
        setReceivablesTotal((recJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0));
        setSummary(summaryJson.overall || null);
        setAgeingBuckets(ageingJson.byBucket || []);
        setUnattributed(unattrJson.unattributed || { count: 0, amount: 0 });
      })
      .catch(() => {
        setCashTotal(0);
        setLoansTotal(0);
        setReceivablesTotal(0);
      })
      .finally(() => setRefetching(false));
  }, [closingQS, scope.branch]);

  useEffect(() => {
    fetchHeaderTotals();
  }, [fetchHeaderTotals]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section !== "receivables") {
      setReceivablesInitialDrill(null);
      return;
    }
    const head = searchParams.get("head") || "";
    const doc = searchParams.get("doc") || "";

    // Receivables are grouped by party — a deep link's `head` is a payer label and drops
    // straight to that party's documents (level 3); there is no category/sub level.
    if (doc) {
      fetch(`/api/receivables/${doc}`)
        .then((r) => r.json())
        .then((json) => {
          const rec = json.receivable;
          if (!rec) {
            setReceivablesInitialDrill(null);
            return;
          }
          setReceivablesInitialDrill({
            level: 3,
            headKey: rec.payer?.label || "",
            headLabel: rec.payer?.label || "",
            subKey: "",
            subLabel: "",
          });
        })
        .catch(() => setReceivablesInitialDrill(null));
    } else if (head) {
      setReceivablesInitialDrill({ level: 3, headKey: head, headLabel: head, subKey: "", subLabel: "" });
    } else {
      setReceivablesInitialDrill(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (scope.branch) params.set("branch", scope.branch);
    if (scope.dateFrom) params.set("from", scope.dateFrom);
    if (scope.dateTo) params.set("to", scope.dateTo);
    if (receivablesDrill && receivablesDrill.level > 1) {
      params.set("section", "receivables");
      if (receivablesDrill.headKey) params.set("head", receivablesDrill.headKey);
      if (receivablesDrill.subKey) params.set("sub", receivablesDrill.subKey);
      if (receivablesDrill.documentId) params.set("doc", receivablesDrill.documentId);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [scope, receivablesDrill]);

  const ageingChipData = (bucket) => {
    const found = ageingBuckets.find((b) => b._id === bucket.value);
    return { count: found?.count || 0, totalPending: found?.totalPending || 0 };
  };

  const handleSettlementSuccess = () => {
    fetchHeaderTotals();
    setRefreshKey((k) => k + 1);
    setTimeout(() => setSettleTx(null), 1200);
  };

  const handleCancelDone = () => {
    fetchHeaderTotals();
    setRefreshKey((k) => k + 1);
  };

  const total = (cashTotal ?? 0) + (loansTotal ?? 0) + (receivablesTotal ?? 0);
  const loaded = cashTotal !== null && loansTotal !== null && receivablesTotal !== null;
  const asOfLabel = `As of ${formatDate(scope.dateTo || new Date())}${scope.branch ? ` · ${scope.branch}` : ""}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      const [cashJson, loansJson, interleaved] = await Promise.all([
        fetch(`/api/close-book/accounts?filter=cash&${closingQS()}`).then((r) => r.json()),
        fetch(`/api/close-book/accounts?filter=loans&${closingQS()}`).then((r) => r.json()),
        fetchInterleavedRows({ kind: "receivables", scope }),
      ]);
      if (interleaved.truncated) {
        toast.error(
          `Export capped at the ${interleaved.docLimit || 5000} newest receivables — narrow the date range for a complete file.`,
        );
      }

      const overviewRows = [
        ...(cashJson.rows || []).map((r) => ({
          Section: "Cash & Bank", Head: r.label,
          Opening: r.opening, "Money In": r.movement, "Money Out": r.settled, "Balance / Pending": r.closing,
        })),
        ...(loansJson.rows || []).map((r) => ({
          Section: "Loan Accounts", Head: r.label,
          Opening: r.opening, "Money In": r.movement, "Money Out": r.settled, "Balance / Pending": r.closing,
        })),
      ];

      // Receivables overview: one line per revenue category, from the obligation lines.
      const recHeadGroups = groupInterleavedByHead(interleaved.rows, "Revenue Category");
      recHeadGroups.forEach((g) => {
        const s = summariseInterleaved(g.rows, { obligationRow: "Receivable", paidKey: "Received" });
        overviewRows.push({
          Section: "Receivables", Head: g.name,
          Opening: "", "Money In": s.total, "Money Out": s.paid, "Balance / Pending": s.total - s.paid,
        });
      });

      const infoRows = [
        ...filterProvenanceRows({ branch: scope.branch, dateFrom: scope.dateFrom, dateTo: scope.dateTo }),
        { Field: "Cash & Bank", Value: cashTotal },
        { Field: "Loan Accounts", Value: loansTotal },
        { Field: "Receivables", Value: receivablesTotal },
        { Field: "Total Assets", Value: total },
      ];

      const cashAccountNames = (cashJson.rows || []).map((r) => r.label);
      const loanAccountNames = (loansJson.rows || []).map((r) => r.label);
      const accountSheets = await ledgerHeadSheets({
        accounts: [...cashAccountNames, ...loanAccountNames],
        scope,
      });

      const REC_COLS = [8, 22, 14, 12, 12, 10, 12, 12, 12, 10, 14, 12, 14, 14, 16, 18, 24];
      const REC_CUR = ["Total Amount", "Received", "Pending", "Receipt Amount"];
      const recSheets = recHeadGroups.map((g) => ({
        name: (g.name || "Uncategorised").slice(0, 31),
        rows: g.rows,
        colWidths: REC_COLS,
        currencyCols: REC_CUR,
      }));

      await exportWorkbook({
        filename: `Assets_${scope.branch || "All"}_${scope.dateFrom || "start"}_to_${scope.dateTo || "today"}.xlsx`,
        sheets: [
          { name: "Info", rows: infoRows, colWidths: [22, 20] },
          {
            name: "Overview",
            rows: overviewRows,
            colWidths: [16, 24, 14, 14, 14, 16],
            currencyCols: ["Opening", "Money In", "Money Out", "Balance / Pending"],
          },
          ...accountSheets,
          ...recSheets,
        ],
      });
      toast.success("Assets exported");
    } catch (error) {
      console.error("Error exporting assets:", error);
      toast.error("Failed to export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Assets</h1>
            <p className="text-sm text-gray-500 mt-1">
              Everything the business owns or is owed — cash &amp; bank balances plus outstanding
              receivables.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scope.branch}
              onChange={(e) => setScope((s) => ({ ...s, branch: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            >
              <option value="">All branches</option>
              {ALL_BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <DebouncedDateInput
              value={scope.dateFrom}
              onCommit={(v) => setScope((s) => ({ ...s, dateFrom: v }))}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            />
            <span className="text-xs text-gray-400">to</span>
            <DebouncedDateInput
              value={scope.dateTo}
              onCommit={(v) => setScope((s) => ({ ...s, dateTo: v }))}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            />
            {(scope.branch || scope.dateFrom || scope.dateTo) && (
              <button
                onClick={() => setScope({ branch: "", dateFrom: "", dateTo: "" })}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-800"
              >
                Clear filters
              </button>
            )}
            <button
              onClick={() => setAdvanceModal({ mode: "OUT", receivable: null })}
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-teal-700"
            >
              <HandCoins className="w-3.5 h-3.5" />
              Record Advance
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download Excel
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Assets</p>
            {refetching || !loaded ? (
              <div className="h-9 w-48 bg-gray-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(total)}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{asOfLabel}</p>
            <div className="flex flex-wrap gap-6 mt-3 text-sm text-gray-500">
              <span>Cash &amp; Bank: <strong className="text-gray-800">{loaded ? formatCurrency(cashTotal) : "…"}</strong></span>
              <span>Loan Accounts: <strong className="text-gray-800">{loaded ? formatCurrency(loansTotal) : "…"}</strong></span>
              <span>Receivables: <strong className="text-gray-800">{loaded ? formatCurrency(receivablesTotal) : "…"}</strong></span>
            </div>
          </div>

          {unattributed && unattributed.count > 0 && (
            <Link
              href="/admin/transactions?furtherMode=__UNTRACKED__"
              className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <strong>{formatCurrency(unattributed.amount)}</strong> across{" "}
                <strong>{unattributed.count}</strong> transactions is missing account attribution
                and is excluded from this total.
              </p>
            </Link>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cash &amp; Bank</h2>
            </div>
            <DrillDownTable
              key={refreshKey}
              levels={2}
              sectionConfig={{
                key: "cash-bank",
                apiBase: "/api/close-book/accounts",
                title: "Cash & Bank",
                columnLabels: {
                  opening: "Opening balance",
                  movement: "Money in",
                  settled: "Money out",
                  closing: "Balance",
                },
              }}
              scope={scope}
              onScopeChange={setScope}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-orange-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Loan Accounts</h2>
            </div>
            <DrillDownTable
              key={refreshKey}
              levels={2}
              sectionConfig={{
                key: "loans",
                apiBase: "/api/close-book/accounts",
                title: "Loan Accounts",
                columnLabels: {
                  opening: "Opening balance",
                  movement: "Money in",
                  settled: "Money out",
                  closing: "Balance",
                },
              }}
              scope={scope}
              onScopeChange={setScope}
              renderLeafRowActions={(row) => (
                <LoanRowActions
                  row={row}
                  onSettle={() =>
                    setSettleTx({
                      transactionId: row._id,
                      account: row.account,
                      amount: row.amount,
                      narration: row.narration,
                      date: row.date,
                      branch: row.branch,
                    })
                  }
                  onCancel={() => setCancelTx(row)}
                />
              )}
            />
          </section>

          {settleTx && (
            <LoanSettlementModal
              fromAccount={settleTx.account}
              defaultAmount={settleTx.amount}
              contextLabel={settleTx.narration}
              sourceTransactionId={settleTx.transactionId}
              branch={settleTx.branch}
              onClose={() => setSettleTx(null)}
              onSuccess={handleSettlementSuccess}
            />
          )}

          {cancelTx && (
            <CancelLoanModal
              transaction={{
                _id: cancelTx._id,
                amount: cancelTx.amount,
                date: cancelTx.date,
                furtherMode: cancelTx.account,
                patientName: cancelTx.patientName,
                patient: cancelTx.patient,
              }}
              onClose={() => setCancelTx(null)}
              onDone={handleCancelDone}
            />
          )}

          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Total Receivable" value={formatCurrency(summary.totalReceivable)} icon={HandCoins} color="from-emerald-500 to-emerald-600" />
              <MetricCard title="Received To Date" value={formatCurrency(summary.totalReceived)} icon={CheckCircle2} color="from-indigo-500 to-indigo-600" />
              <MetricCard title="Open (Pending)" value={formatCurrency(summary.totalPending)} icon={Clock} color="from-amber-500 to-amber-600" />
              <MetricCard title="Active Receivables" value={summary.count ?? 0} icon={AlertTriangle} color="from-rose-500 to-rose-600" />
            </div>
          )}

          {ageingBuckets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {AGEING_BUCKETS.map((b) => {
                const chip = ageingChipData(b);
                const active = ageingFilter === b.value;
                return (
                  <button
                    key={b.value}
                    onClick={() => setAgeingFilter((cur) => (cur === b.value ? "" : b.value))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {b.label} · {chip.count} · {formatCurrency(chip.totalPending)}
                  </button>
                );
              })}
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Receivables</h2>
            </div>
            {receivablesInitialDrill !== undefined && (
              <DrillDownTable
                levels={3}
                sectionConfig={{
                  key: "receivables",
                  mode: "documents",
                  groupBy: "party",
                  apiBase: "/api/receivables",
                  title: "Receivables",
                  columnLabels: {
                    opening: "Opening due",
                    movement: "Raised",
                    settled: "Received",
                    closing: "Still due",
                  },
                }}
                initialDrill={receivablesInitialDrill || undefined}
                onDrillChange={setReceivablesDrill}
                scope={scope}
                onScopeChange={setScope}
                extraParams={ageingFilter ? { ageing: ageingFilter } : undefined}
              />
            )}
          </section>
        </div>
      </main>

      {advanceModal && (
        <RecordAdvanceModal
          open
          mode={advanceModal.mode}
          receivable={advanceModal.receivable}
          toast={toast}
          onClose={() => setAdvanceModal(null)}
          onSuccess={handleAdvanceSuccess}
        />
      )}
    </div>
  );
}
