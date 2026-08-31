"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Wallet, HelpCircle, HandCoins, CheckCircle2, Clock, AlertTriangle, Download, Loader2, X, ArrowUpRight } from "lucide-react";
import DrillDownTable from "@/components/finance/DrillDownTable";
import RecordBorrowingModal from "@/components/finance/RecordBorrowingModal";
import BorrowingDocumentActions from "@/components/finance/BorrowingDocumentActions";
import DocumentHistory from "@/components/finance/DocumentHistory";
import MetricCard from "@/components/MetricCard";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { AGEING_BUCKETS } from "@/lib/ageing";
import { ALL_BRANCHES } from "@/lib/branches";
import { ENTRY_TYPES } from "@/constants/entryTypes";
import { exportWorkbook, fetchAllPages, filterProvenanceRows } from "@/lib/exportToExcel";
import { useToast } from "@/components/Toast";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";

export default function LiabilitiesPage() {
  return (
    <Suspense fallback={null}>
      <LiabilitiesPageInner />
    </Suspense>
  );
}

function LiabilitiesPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [scope, setScope] = useState(() => ({
    branch: searchParams.get("branch") || "",
    dateFrom: searchParams.get("from") || "",
    dateTo: searchParams.get("to") || "",
  }));

  const [payablesTotal, setPayablesTotal] = useState(null);
  const [suspenseTotal, setSuspenseTotal] = useState(null);
  const [refetching, setRefetching] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [summary, setSummary] = useState(null);
  const [ageingBuckets, setAgeingBuckets] = useState([]);
  const [ageingFilter, setAgeingFilter] = useState("");

  const [payablesInitialDrill, setPayablesInitialDrill] = useState(undefined);
  const [payablesDrill, setPayablesDrill] = useState(null);

  const [borrowModal, setBorrowModal] = useState(null);
  const [borrowingsRefreshKey, setBorrowingsRefreshKey] = useState(0);
  const [borrowHistoryDoc, setBorrowHistoryDoc] = useState(null);
  const [borrowHistoryRows, setBorrowHistoryRows] = useState([]);
  const [borrowHistoryLoading, setBorrowHistoryLoading] = useState(false);

  const openBorrowHistory = async (row) => {
    setBorrowHistoryDoc(row);
    setBorrowHistoryLoading(true);
    try {
      const res = await fetch(`/api/borrowings/grouped?level=4&documentId=${row._id}&limit=200`);
      const data = await res.json();
      setBorrowHistoryRows(
        (data.rows || []).map((r) => ({
          _id: r._id,
          amount: r.amount,
          date: r.date,
          method: `${r.direction === "OUT" ? "Repayment" : "Received"} · ${r.account}`,
          paymentId: r.reference,
          createdBy: r.createdBy,
        })),
      );
    } finally {
      setBorrowHistoryLoading(false);
    }
  };

  const handleBorrowSuccess = () => {
    setBorrowModal(null);
    setBorrowingsRefreshKey((k) => k + 1);
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
      fetch(`/api/payables/grouped?level=1&${closingQS()}`).then((r) => r.json()),
      fetch(`/api/suspense?groupBy=account&${closingQS()}`).then((r) => r.json()),
      fetch(`/api/payables/summary${scope.branch ? `?branch=${scope.branch}` : ""}`).then((r) => r.json()),
      fetch(`/api/payables/summary?ageing=1${scope.branch ? `&branch=${scope.branch}` : ""}`).then((r) => r.json()),
    ])
      .then(([payablesJson, suspenseJson, summaryJson, ageingJson]) => {
        setPayablesTotal((payablesJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0));
        setSuspenseTotal((suspenseJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0));
        setSummary(summaryJson.overall || null);
        setAgeingBuckets(ageingJson.byBucket || []);
      })
      .catch(() => {
        setPayablesTotal(0);
        setSuspenseTotal(0);
      })
      .finally(() => setRefetching(false));
  }, [closingQS, scope.branch]);

  useEffect(() => {
    fetchHeaderTotals();
  }, [fetchHeaderTotals]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section !== "payables") {
      setPayablesInitialDrill(null);
      return;
    }
    const head = searchParams.get("head") || "";
    const sub = searchParams.get("sub") || "";
    const doc = searchParams.get("doc") || "";

    if (doc) {
      fetch(`/api/payables/${doc}`)
        .then((r) => r.json())
        .then((json) => {
          const p = json.payable;
          if (!p) {
            setPayablesInitialDrill(null);
            return;
          }
          setPayablesInitialDrill({
            level: 3,
            headKey: p.expenseCategory,
            headLabel: p.expenseCategory,
            subKey: p.expenseSubType || "",
            subLabel: p.expenseSubType || "",
          });
        })
        .catch(() => setPayablesInitialDrill(null));
    } else if (sub) {
      setPayablesInitialDrill({ level: 3, headKey: head, headLabel: head, subKey: sub, subLabel: sub });
    } else if (head) {
      setPayablesInitialDrill({ level: 2, headKey: head, headLabel: head });
    } else {
      setPayablesInitialDrill(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (scope.branch) params.set("branch", scope.branch);
    if (scope.dateFrom) params.set("from", scope.dateFrom);
    if (scope.dateTo) params.set("to", scope.dateTo);
    if (payablesDrill && payablesDrill.level > 1) {
      params.set("section", "payables");
      if (payablesDrill.headKey) params.set("head", payablesDrill.headKey);
      if (payablesDrill.subKey) params.set("sub", payablesDrill.subKey);
      if (payablesDrill.documentId) params.set("doc", payablesDrill.documentId);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [scope, payablesDrill]);

  const ageingChipData = (bucket) => {
    const found = ageingBuckets.find((b) => b._id === bucket.value);
    return { count: found?.count || 0, totalPending: found?.totalPending || 0 };
  };

  const loaded = payablesTotal !== null && suspenseTotal !== null;
  const total = (payablesTotal ?? 0) + (suspenseTotal ?? 0);
  const asOfLabel = `As of ${formatDate(scope.dateTo || new Date())}${scope.branch ? ` · ${scope.branch}` : ""}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      const listFlowQS = (() => {
        const p = new URLSearchParams();
        if (scope.branch) p.set("branch", scope.branch);
        if (scope.dateFrom) p.set("dateFrom", scope.dateFrom);
        if (scope.dateTo) p.set("dateTo", scope.dateTo);
        return p.toString();
      })();
      const suspenseFlowQS = (() => {
        const p = new URLSearchParams();
        if (scope.branch) p.set("branch", scope.branch);
        if (scope.dateFrom) p.set("from", scope.dateFrom);
        if (scope.dateTo) p.set("to", scope.dateTo);
        return p.toString();
      })();

      const [payablesPaged, suspenseGroupJson, suspensePaged, txJson] = await Promise.all([
        fetchAllPages((page, limit) => `/api/payables/list?page=${page}&limit=${limit}&${listFlowQS}`, "payables"),
        fetch(`/api/suspense?groupBy=account&${closingQS()}`).then((r) => r.json()),
        fetchAllPages((page, limit) => `/api/suspense?status=all&page=${page}&limit=${limit}&${suspenseFlowQS}`, "entries"),
        fetch(`/api/transactions/get-all?limit=10000&${listFlowQS}`).then((r) => r.json()),
      ]);
      const payablesJson = { payables: payablesPaged.rows };
      const suspenseListJson = { entries: suspensePaged.rows };
      if (payablesPaged.truncated || suspensePaged.truncated) {
        toast.error("Export is incomplete — too many rows in range. Narrow the date filter.");
      }

      const payableRows = (payablesJson.payables || []).map((p) => ({
        Head: p.expenseCategory || "—",
        "Sub-type": p.expenseSubType || "—",
        Party: p.payee?.label || "—",
        Total: p.totalAmount,
        Paid: p.paid,
        Pending: p.pending,
        "Due Date": p.dueDate ? new Date(p.dueDate) : null,
        Ageing: p.ageingBucket || "—",
        Status: p.isCancelled ? "Cancelled" : p.status,
      }));
      const suspenseRows = (suspenseListJson.entries || []).map((s) => ({
        Date: new Date(s.date),
        Account: s.account,
        Direction: s.direction,
        Amount: s.amount,
        Remarks: s.remarks || s.reference || "—",
        Status: s.isResolved ? "Resolved" : s.isCancelled ? "Cancelled" : "Open",
      }));
      const txRows = (txJson.transactions || []).map((t) => ({
        Date: new Date(t.date),
        "Account/Head": t.furtherMode || t.expense || "—",
        Party: t.patient?.personal?.name || t.patientName || t.expenseGiver?.name || "—",
        Narration: t.remarks || t.procedure || t.expenseType || "—",
        "Entry Type": ENTRY_TYPES[t.entryType]?.label || "Regular",
        Method: t.method || "—",
        Amount: t.amount,
      }));

      const summaryRows = [
        ...filterProvenanceRows({ branch: scope.branch, dateFrom: scope.dateFrom, dateTo: scope.dateTo }),
        { Field: "Payables", Value: payablesTotal },
        { Field: "Suspense", Value: (suspenseGroupJson.rows || []).reduce((s, r) => s + (r.closing || 0), 0) },
        { Field: "Total Liabilities", Value: total },
      ];

      await exportWorkbook({
        filename: `Liabilities_${scope.branch || "All"}_${scope.dateFrom || "start"}_to_${scope.dateTo || "today"}.xlsx`,
        sheets: [
          { name: "Summary", rows: summaryRows, colWidths: [22, 20] },
          { name: "Payables", rows: payableRows, colWidths: [18, 18, 22, 14, 14, 14, 14, 10, 16], currencyCols: ["Total", "Paid", "Pending"] },
          { name: "Suspense", rows: suspenseRows, colWidths: [12, 20, 10, 14, 30, 12], currencyCols: ["Amount"] },
          { name: "Transactions", rows: txRows, colWidths: [12, 20, 22, 30, 18, 12, 14], currencyCols: ["Amount"] },
        ],
      });
      toast.success("Liabilities exported");
    } catch (error) {
      console.error("Error exporting liabilities:", error);
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
            <h1 className="text-xl font-bold text-gray-900">Liabilities</h1>
            <p className="text-sm text-gray-500 mt-1">
              Everything the business owes — payables and unresolved suspense entries.
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
              onClick={() => setBorrowModal({ mode: "IN", payable: null })}
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-violet-700"
            >
              <HandCoins className="w-3.5 h-3.5" />
              Record Borrowing
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Liabilities</p>
            {refetching || !loaded ? (
              <div className="h-9 w-48 bg-gray-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(total)}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{asOfLabel}</p>
            <div className="flex flex-wrap gap-6 mt-3 text-sm text-gray-500">
              <span>Payables: <strong className="text-gray-800">{loaded ? formatCurrency(payablesTotal) : "…"}</strong></span>
              <span>Suspense: <strong className="text-gray-800">{loaded ? formatCurrency(suspenseTotal) : "…"}</strong></span>
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Total Owed" value={formatCurrency(summary.totalOwed)} icon={Wallet} color="from-indigo-500 to-indigo-600" />
              <MetricCard title="Total Paid" value={formatCurrency(summary.totalPaid)} icon={CheckCircle2} color="from-emerald-500 to-emerald-600" />
              <MetricCard title="Total Pending" value={formatCurrency(summary.totalPending)} icon={Clock} color="from-amber-500 to-amber-600" />
              <MetricCard title="Active Payables" value={summary.count ?? 0} icon={AlertTriangle} color="from-rose-500 to-rose-600" />
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
                        ? "bg-indigo-600 text-white border-indigo-600"
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
              <Wallet className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Payables</h2>
            </div>
            {payablesInitialDrill !== undefined && (
              <DrillDownTable
                levels={3}
                sectionConfig={{
                  key: "payables",
                  mode: "documents",
                  apiBase: "/api/payables",
                  title: "Payables",
                  columnLabels: {
                    opening: "Opening due",
                    movement: "Raised",
                    settled: "Paid",
                    closing: "Still owed",
                  },
                }}
                initialDrill={payablesInitialDrill || undefined}
                onDrillChange={setPayablesDrill}
                scope={scope}
                onScopeChange={setScope}
                extraParams={ageingFilter ? { ageing: ageingFilter } : undefined}
              />
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Suspense</h2>
            </div>
            <DrillDownTable
              levels={2}
              sectionConfig={{
                key: "suspense",
                apiBase: "/api/suspense",
                title: "Suspense",
                columnLabels: {
                  opening: "Opening",
                  movement: "Received",
                  settled: "Reclassified",
                  closing: "Unresolved",
                },
              }}
              scope={scope}
              onScopeChange={setScope}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-violet-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Borrowings</h2>
              </div>
              <Link
                href="/admin/financing?tab=borrowings"
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-800"
              >
                Manage all loans <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <DrillDownTable
              key={borrowingsRefreshKey}
              levels={3}
              sectionConfig={{
                key: "borrowings",
                mode: "documents",
                documentShape: "payable",
                hideCreateButtons: true,
                apiBase: "/api/borrowings",
                title: "Borrowings",
                columnLabels: {
                  opening: "Opening owed",
                  movement: "Raised",
                  settled: "Repaid",
                  closing: "Still owed",
                },
              }}
              renderDocumentActions={(row) => (
                <BorrowingDocumentActions
                  row={row}
                  onRepay={(r) => setBorrowModal({ mode: "OUT", payable: r })}
                  onTranche={(r) => setBorrowModal({ mode: "IN", payable: r })}
                  onHistory={openBorrowHistory}
                />
              )}
              scope={scope}
              onScopeChange={setScope}
            />
          </section>
        </div>
      </main>

      {borrowModal && (
        <RecordBorrowingModal
          open
          mode={borrowModal.mode}
          payable={borrowModal.payable}
          toast={toast}
          onClose={() => setBorrowModal(null)}
          onSuccess={handleBorrowSuccess}
        />
      )}

      {borrowHistoryDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-gray-900">
                History — {borrowHistoryDoc.payee?.label || "Borrowing"}
              </h3>
              <button onClick={() => setBorrowHistoryDoc(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <DocumentHistory
                doc={borrowHistoryDoc}
                kind="payable"
                transactions={borrowHistoryRows}
                loading={borrowHistoryLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
