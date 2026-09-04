"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  HandCoins,
  Landmark,
  Pencil,
  History,
  RefreshCw,
  Plus,
  AlertTriangle,
  X,
  Link2,
  Download,
} from "lucide-react";
import AccountingTable from "@/components/finance/AccountingTable";
import RecordBorrowingModal from "@/components/finance/RecordBorrowingModal";
import RevisePayableModal from "@/components/finance/RevisePayableModal";
import EditBorrowingModal from "@/components/finance/EditBorrowingModal";
import RecordAdvanceModal from "@/components/finance/RecordAdvanceModal";
import ReviseReceivableModal from "@/components/finance/ReviseReceivableModal";
import EditAdvanceModal from "@/components/finance/EditAdvanceModal";
import SettleAgainstModal from "@/components/finance/SettleAgainstModal";
import DocumentHistory from "@/components/finance/DocumentHistory";
import { formatCurrency, formatDate, StatusBadge } from "@/lib/financeUI";
import { ALL_BRANCHES } from "@/lib/branches";
import { useToast } from "@/components/Toast";

function FinancingPageInner() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "advances" ? "advances" : "borrowings");

  const setTabAndUrl = (next) => {
    setTab(next);
    router.replace(`/admin/financing?tab=${next}`, { scroll: false });
  };

  const [branch, setBranch] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const [totals, setTotals] = useState({ totalPrincipal: 0, totalOutstanding: 0, label: "" });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Financing</h1>
              <p className="text-sm text-gray-500 mt-1">
                Money borrowed that must be repaid, and money advanced that must come back — never
                a sale or an expense. See the summarised views under Liabilities/Assets for the
                rollups.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white shadow-sm">
            <button
              onClick={() => setTabAndUrl("borrowings")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "borrowings" ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <HandCoins className="w-4 h-4" /> Borrowings
            </button>
            <button
              onClick={() => setTabAndUrl("advances")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "advances" ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Landmark className="w-4 h-4" /> Advances
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {tab === "borrowings" ? "Total Borrowed" : "Total Advanced"}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totals.totalPrincipal)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(totals.totalOutstanding)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
            >
              <option value="">All branches</option>
              {ALL_BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <input
                type="checkbox"
                checked={includeCancelled}
                onChange={(e) => setIncludeCancelled(e.target.checked)}
              />
              Include cancelled
            </label>
          </div>

          {tab === "borrowings" ? (
            <BorrowingsTab
              branch={branch}
              includeCancelled={includeCancelled}
              toast={toast}
              onTotalsChange={(t) => setTotals({ ...t, label: "Borrowed" })}
            />
          ) : (
            <AdvancesTab
              branch={branch}
              includeCancelled={includeCancelled}
              toast={toast}
              onTotalsChange={(t) => setTotals({ ...t, label: "Advanced" })}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default function FinancingPage() {
  return (
    <Suspense fallback={null}>
      <FinancingPageInner />
    </Suspense>
  );
}

function exportCsv(filename, columns, rows) {
  const headers = columns.map((c) => c.label);
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells = columns.map((c) => {
      const raw = c.csv ? c.csv(r) : r[c.key];
      const s = raw == null ? "" : String(raw);
      return `"${s.replace(/"/g, '""')}"`;
    });
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function BorrowingsTab({ branch, includeCancelled, toast, onTotalsChange }) {
  const [loans, setLoans] = useState([]);
  const [loansMeta, setLoansMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [loansLoading, setLoansLoading] = useState(false);
  const [loansError, setLoansError] = useState("");
  const [loansSearch, setLoansSearch] = useState("");

  const loadLoans = useCallback(
    async (page = 1) => {
      setLoansLoading(true);
      setLoansError("");
      try {
        const p = new URLSearchParams({
          expenseCategory: "Borrowings",
          page: String(page),
          limit: "20",
          includeCancelled: String(includeCancelled),
        });
        if (branch) p.set("branch", branch);
        if (loansSearch) p.set("search", loansSearch);
        const res = await fetch(`/api/payables/list?${p}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load loans");
        setLoans(data.payables || []);
        setLoansMeta({ total: data.total || 0, page: data.page || 1, limit: data.limit || 20 });
        onTotalsChange({
          totalPrincipal: (data.payables || []).reduce((s, r) => s + (r.totalAmount || 0), 0),
          totalOutstanding: (data.payables || []).reduce((s, r) => s + (r.pending || 0), 0),
        });
      } catch (err) {
        setLoansError(err.message || "Failed to load loans");
      } finally {
        setLoansLoading(false);
      }
    },
    [branch, includeCancelled, loansSearch],
  );

  useEffect(() => {
    loadLoans(1);
  }, [loadLoans]);

  const [rows, setRows] = useState([]);
  const [rowsMeta, setRowsMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const [rowsSearch, setRowsSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [view, setView] = useState("ledger");

  const loadRows = useCallback(
    async (page = 1) => {
      setRowsLoading(true);
      setRowsError("");
      try {
        const p = new URLSearchParams({
          page: String(page),
          limit: "20",
          includeCancelled: String(includeCancelled),
        });
        if (branch) p.set("branch", branch);
        if (rowsSearch) p.set("party", rowsSearch);
        if (directionFilter) p.set("direction", directionFilter);
        const res = await fetch(`/api/borrowings/list?${p}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load borrowing transactions");
        setRows(data.borrowings || []);
        setRowsMeta({ total: data.total || 0, page: data.page || 1, limit: data.limit || 20 });
      } catch (err) {
        setRowsError(err.message || "Failed to load borrowing transactions");
      } finally {
        setRowsLoading(false);
      }
    },
    [branch, includeCancelled, rowsSearch, directionFilter],
  );

  useEffect(() => {
    loadRows(1);
  }, [loadRows]);

  const refreshAll = () => {
    loadLoans(loansMeta.page);
    loadRows(rowsMeta.page);
  };

  const [borrowModal, setBorrowModal] = useState(null);
  const [reviseLoan, setReviseLoan] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [settleRow, setSettleRow] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async (loan) => {
    setHistoryDoc(loan);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/borrowings/list?payableId=${loan._id}&includeCancelled=true&limit=200`);
      const data = await res.json();
      setHistoryRows(
        (data.borrowings || []).map((r) => ({
          _id: r._id,
          amount: r.amount,
          date: r.date,
          method: `${r.direction === "OUT" ? "Repayment" : "Received"} · ${r.account}${r.isCancelled ? " (cancelled)" : ""}`,
          paymentId: r.reference,
          createdBy: r.createdBy,
        })),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleBorrowSuccess = () => {
    setBorrowModal(null);
    refreshAll();
  };

  const exportRows = async () => {
    const p = new URLSearchParams({ page: "1", limit: "5000", includeCancelled: String(includeCancelled) });
    if (branch) p.set("branch", branch);
    if (directionFilter) p.set("direction", directionFilter);
    const data = await fetch(`/api/borrowings/list?${p}`).then((r) => r.json());
    exportCsv("borrowing-transactions.csv", rowColumnsForExport, data.borrowings || []);
  };

  const loanColumns = [
    { key: "payee", label: "Party", render: (r) => r.payee?.label || "—" },
    { key: "expenseSubType", label: "Type" },
    { key: "totalAmount", label: "Total Received", numeric: true, render: (r) => formatCurrency(r.totalAmount) },
    { key: "paid", label: "Repaid", numeric: true, render: (r) => formatCurrency(r.paid) },
    { key: "pending", label: "Outstanding", numeric: true, render: (r) => formatCurrency(r.pending) },
    { key: "branch", label: "Branch", render: (r) => r.branch || "—" },
    { key: "createdAt", label: "Date", render: (r) => formatDate(r.createdAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.isCancelled ? "Cancelled" : r.status} /> },
  ];

  const rowColumnsForExport = [
    { key: "date", label: "Date", csv: (r) => formatDate(r.date) },
    { key: "direction", label: "Direction", csv: (r) => (r.direction === "OUT" ? "Repayment" : "Received") },
    { key: "party", label: "Party", csv: (r) => r.party?.label || "" },
    { key: "amount", label: "Amount", csv: (r) => r.amount },
    { key: "account", label: "Account" },
    { key: "branch", label: "Branch" },
    { key: "reference", label: "Reference" },
    { key: "settlesReceivableId", label: "Settles Receivable", csv: (r) => r.settlesReceivableId || "" },
    { key: "status", label: "Status", csv: (r) => (r.isCancelled ? "Cancelled" : "Active") },
  ];

  const rowColumns = [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    {
      key: "direction",
      label: "Direction",
      render: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
            r.direction === "OUT" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {r.direction === "OUT" ? "Repayment" : "Received"}
        </span>
      ),
    },
    { key: "party", label: "Party", render: (r) => r.party?.label || "—" },
    { key: "amount", label: "Amount", numeric: true, render: (r) => formatCurrency(r.amount) },
    { key: "account", label: "Account" },
    { key: "branch", label: "Branch", render: (r) => r.branch || "—" },
    { key: "reference", label: "Reference", render: (r) => r.reference || "—" },
    {
      key: "settlement",
      label: "Settlement",
      render: (r) =>
        r.settlesReceivableId ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700">
            <Link2 className="w-3 h-3" /> Settling a receivable
          </span>
        ) : (
          "—"
        ),
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.isCancelled ? "Cancelled" : "Active"} /> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={exportRows}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <button
          onClick={() => setBorrowModal({ mode: "IN", payable: null })}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-violet-700"
        >
          <HandCoins className="w-3.5 h-3.5" /> Record Borrowing
        </button>
      </div>

      <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white shadow-sm mt-4">
        <button
          onClick={() => setView("ledger")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === "ledger" ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Loans
        </button>
        <button
          onClick={() => setView("transactions")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === "transactions" ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Transactions
        </button>
      </div>

      {view === "ledger" && (
      <section className="space-y-3 mt-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Loans</h2>
        {loansError ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {loansError}</span>
            <button onClick={() => loadLoans(loansMeta.page)} className="font-semibold underline shrink-0">Retry</button>
          </div>
        ) : (
          <AccountingTable
            columns={loanColumns}
            rows={loans}
            loading={loansLoading}
            urlSync={false}
            filterConfig={{ showSearch: true, searchPlaceholder: "Search party…", showBranch: false, showDateRange: false }}
            filters={{ search: loansSearch }}
            onFilterChange={(f) => setLoansSearch(f.search)}
            pagination={loansMeta}
            onPageChange={(p) => loadLoans(p)}
            getRowKey={(r) => r._id}
            emptyMessage="No loans recorded"
            renderRowActions={(row) => (
              <div className="flex items-center justify-end gap-1.5">
                {!row.isCancelled && row.pending > 0 && (
                  <button onClick={() => setBorrowModal({ mode: "OUT", payable: row })} title="Record Repayment" className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                    <HandCoins className="w-3.5 h-3.5" />
                  </button>
                )}
                {!row.isCancelled && (
                  <button onClick={() => setBorrowModal({ mode: "IN", payable: row })} title="Add Tranche" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setReviseLoan(row)} title="Revise / Cancel loan" className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openHistory(row)} title="View History" className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
                  <History className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        )}
      </section>
      )}

      {view === "transactions" && (
      <section className="space-y-3 mt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Borrowing Transactions</h2>
          <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
            <option value="">All directions</option>
            <option value="IN">Received</option>
            <option value="OUT">Repayment</option>
          </select>
        </div>
        {rowsError ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {rowsError}</span>
            <button onClick={() => loadRows(rowsMeta.page)} className="font-semibold underline shrink-0">Retry</button>
          </div>
        ) : (
          <AccountingTable
            columns={rowColumns}
            rows={rows}
            loading={rowsLoading}
            urlSync={false}
            filterConfig={{ showSearch: true, searchPlaceholder: "Search party…", showBranch: false, showDateRange: false }}
            filters={{ search: rowsSearch }}
            onFilterChange={(f) => setRowsSearch(f.search)}
            pagination={rowsMeta}
            onPageChange={(p) => loadRows(p)}
            getRowKey={(r) => r._id}
            emptyMessage="No borrowing transactions recorded"
            renderRowActions={(row) => (
              <div className="flex items-center justify-end gap-1.5">
                {!row.isCancelled && row.direction === "IN" && (
                  <button onClick={() => setSettleRow(row)} title="Settle Against…" className="p-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100">
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setEditRow(row)} title="Edit" className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        )}
      </section>
      )}

      {borrowModal && (
        <RecordBorrowingModal open mode={borrowModal.mode} payable={borrowModal.payable} toast={toast} onClose={() => setBorrowModal(null)} onSuccess={handleBorrowSuccess} />
      )}
      {reviseLoan && (
        <RevisePayableModal payable={reviseLoan} toast={toast} onClose={() => setReviseLoan(null)} onSuccess={() => { setReviseLoan(null); refreshAll(); }} />
      )}
      {editRow && (
        <EditBorrowingModal borrowing={editRow} toast={toast} onClose={() => setEditRow(null)} onSuccess={() => { setEditRow(null); refreshAll(); }} />
      )}
      {settleRow && (
        <SettleAgainstModal kind="borrowing" row={settleRow} toast={toast} onClose={() => setSettleRow(null)} onSuccess={() => { setSettleRow(null); refreshAll(); }} />
      )}
      {historyDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-gray-900">History — {historyDoc.payee?.label || "Loan"}</h3>
              <button onClick={() => setHistoryDoc(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5">
              <DocumentHistory doc={historyDoc} kind="payable" transactions={historyRows} loading={historyLoading} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AdvancesTab({ branch, includeCancelled, toast, onTotalsChange }) {
  const [advances, setAdvances] = useState([]);
  const [advancesMeta, setAdvancesMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesError, setAdvancesError] = useState("");
  const [advancesSearch, setAdvancesSearch] = useState("");

  const loadAdvances = useCallback(
    async (page = 1) => {
      setAdvancesLoading(true);
      setAdvancesError("");
      try {
        const p = new URLSearchParams({
          revenueCategory: "Advances",
          page: String(page),
          limit: "20",
          includeCancelled: String(includeCancelled),
        });
        if (branch) p.set("branch", branch);
        if (advancesSearch) p.set("search", advancesSearch);
        const res = await fetch(`/api/receivables/list?${p}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load advances");
        setAdvances(data.receivables || []);
        setAdvancesMeta({ total: data.total || 0, page: data.page || 1, limit: data.limit || 20 });
        onTotalsChange({
          totalPrincipal: (data.receivables || []).reduce((s, r) => s + (r.totalAmount || 0), 0),
          totalOutstanding: (data.receivables || []).reduce((s, r) => s + (r.pending || 0), 0),
        });
      } catch (err) {
        setAdvancesError(err.message || "Failed to load advances");
      } finally {
        setAdvancesLoading(false);
      }
    },
    [branch, includeCancelled, advancesSearch],
  );

  useEffect(() => {
    loadAdvances(1);
  }, [loadAdvances]);

  const [rows, setRows] = useState([]);
  const [rowsMeta, setRowsMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const [rowsSearch, setRowsSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [view, setView] = useState("ledger");

  const loadRows = useCallback(
    async (page = 1) => {
      setRowsLoading(true);
      setRowsError("");
      try {
        const p = new URLSearchParams({
          page: String(page),
          limit: "20",
          includeCancelled: String(includeCancelled),
        });
        if (branch) p.set("branch", branch);
        if (rowsSearch) p.set("party", rowsSearch);
        if (directionFilter) p.set("direction", directionFilter);
        const res = await fetch(`/api/advances/list?${p}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load advance transactions");
        setRows(data.advances || []);
        setRowsMeta({ total: data.total || 0, page: data.page || 1, limit: data.limit || 20 });
      } catch (err) {
        setRowsError(err.message || "Failed to load advance transactions");
      } finally {
        setRowsLoading(false);
      }
    },
    [branch, includeCancelled, rowsSearch, directionFilter],
  );

  useEffect(() => {
    loadRows(1);
  }, [loadRows]);

  const refreshAll = () => {
    loadAdvances(advancesMeta.page);
    loadRows(rowsMeta.page);
  };

  const [advanceModal, setAdvanceModal] = useState(null);
  const [reviseAdvance, setReviseAdvance] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [settleRow, setSettleRow] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async (adv) => {
    setHistoryDoc(adv);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/advances/list?receivableId=${adv._id}&includeCancelled=true&limit=200`);
      const data = await res.json();
      setHistoryRows(
        (data.advances || []).map((r) => ({
          _id: r._id,
          amount: r.amount,
          date: r.date,
          method: `${r.direction === "IN" ? "Recovered" : "Paid out"} · ${r.account}${r.isCancelled ? " (cancelled)" : ""}`,
          paymentId: r.reference,
          createdBy: r.createdBy,
        })),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAdvanceSuccess = () => {
    setAdvanceModal(null);
    refreshAll();
  };

  const exportRows = async () => {
    const p = new URLSearchParams({ page: "1", limit: "5000", includeCancelled: String(includeCancelled) });
    if (branch) p.set("branch", branch);
    if (directionFilter) p.set("direction", directionFilter);
    const data = await fetch(`/api/advances/list?${p}`).then((r) => r.json());
    exportCsv("advance-transactions.csv", rowColumnsForExport, data.advances || []);
  };

  const advanceColumns = [
    { key: "payer", label: "Party", render: (r) => r.payer?.label || "—" },
    { key: "revenueSubType", label: "Type" },
    { key: "totalAmount", label: "Total Advanced", numeric: true, render: (r) => formatCurrency(r.totalAmount) },
    { key: "received", label: "Recovered", numeric: true, render: (r) => formatCurrency(r.received) },
    { key: "pending", label: "Outstanding", numeric: true, render: (r) => formatCurrency(r.pending) },
    { key: "branch", label: "Branch", render: (r) => r.branch || "—" },
    { key: "createdAt", label: "Date", render: (r) => formatDate(r.createdAt) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.isCancelled ? "Cancelled" : r.status} /> },
  ];

  const rowColumnsForExport = [
    { key: "date", label: "Date", csv: (r) => formatDate(r.date) },
    { key: "direction", label: "Direction", csv: (r) => (r.direction === "OUT" ? "Advanced" : "Recovered") },
    { key: "party", label: "Party", csv: (r) => r.party?.label || "" },
    { key: "amount", label: "Amount", csv: (r) => r.amount },
    { key: "account", label: "Account" },
    { key: "branch", label: "Branch" },
    { key: "reference", label: "Reference" },
    { key: "settlesPayableId", label: "Settles Payable", csv: (r) => r.settlesPayableId || "" },
    {
      key: "settlesPayableAmount",
      label: "Settled Amount",
      csv: (r) => (r.settlesPayableId ? (r.settlesPayableAmount ?? r.amount) : ""),
    },
    { key: "status", label: "Status", csv: (r) => (r.isCancelled ? "Cancelled" : "Active") },
  ];

  const rowColumns = [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    {
      key: "direction",
      label: "Direction",
      render: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
            r.direction === "OUT" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {r.direction === "OUT" ? "Advanced" : "Recovered"}
        </span>
      ),
    },
    { key: "party", label: "Party", render: (r) => r.party?.label || "—" },
    { key: "amount", label: "Amount", numeric: true, render: (r) => formatCurrency(r.amount) },
    { key: "account", label: "Account" },
    { key: "branch", label: "Branch", render: (r) => r.branch || "—" },
    { key: "reference", label: "Reference", render: (r) => r.reference || "—" },
    {
      key: "settlement",
      label: "Settlement",
      render: (r) =>
        r.settlesPayableId ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700">
            <Link2 className="w-3 h-3" /> Settling {formatCurrency(r.settlesPayableAmount ?? r.amount)}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.isCancelled ? "Cancelled" : "Active"} /> },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={exportRows}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <button
          onClick={() => setAdvanceModal({ mode: "OUT", receivable: null })}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-teal-700"
        >
          <Landmark className="w-3.5 h-3.5" /> Record Advance
        </button>
      </div>

      <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white shadow-sm mt-4">
        <button
          onClick={() => setView("ledger")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === "ledger" ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Advances
        </button>
        <button
          onClick={() => setView("transactions")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            view === "transactions" ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Transactions
        </button>
      </div>

      {view === "ledger" && (
      <section className="space-y-3 mt-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Advances</h2>
        {advancesError ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {advancesError}</span>
            <button onClick={() => loadAdvances(advancesMeta.page)} className="font-semibold underline shrink-0">Retry</button>
          </div>
        ) : (
          <AccountingTable
            columns={advanceColumns}
            rows={advances}
            loading={advancesLoading}
            urlSync={false}
            filterConfig={{ showSearch: true, searchPlaceholder: "Search party…", showBranch: false, showDateRange: false }}
            filters={{ search: advancesSearch }}
            onFilterChange={(f) => setAdvancesSearch(f.search)}
            pagination={advancesMeta}
            onPageChange={(p) => loadAdvances(p)}
            getRowKey={(r) => r._id}
            emptyMessage="No advances recorded"
            renderRowActions={(row) => (
              <div className="flex items-center justify-end gap-1.5">
                {!row.isCancelled && row.pending > 0 && (
                  <button onClick={() => setAdvanceModal({ mode: "IN", receivable: row })} title="Record Recovery" className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                    <HandCoins className="w-3.5 h-3.5" />
                  </button>
                )}
                {!row.isCancelled && (
                  <button onClick={() => setAdvanceModal({ mode: "OUT", receivable: row })} title="Further Advance" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setReviseAdvance(row)} title="Revise / Cancel advance" className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => openHistory(row)} title="View History" className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
                  <History className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        )}
      </section>
      )}

      {view === "transactions" && (
      <section className="space-y-3 mt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Advance Transactions</h2>
          <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
            <option value="">All directions</option>
            <option value="OUT">Advanced</option>
            <option value="IN">Recovered</option>
          </select>
        </div>
        {rowsError ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {rowsError}</span>
            <button onClick={() => loadRows(rowsMeta.page)} className="font-semibold underline shrink-0">Retry</button>
          </div>
        ) : (
          <AccountingTable
            columns={rowColumns}
            rows={rows}
            loading={rowsLoading}
            urlSync={false}
            filterConfig={{ showSearch: true, searchPlaceholder: "Search party…", showBranch: false, showDateRange: false }}
            filters={{ search: rowsSearch }}
            onFilterChange={(f) => setRowsSearch(f.search)}
            pagination={rowsMeta}
            onPageChange={(p) => loadRows(p)}
            getRowKey={(r) => r._id}
            emptyMessage="No advance transactions recorded"
            renderRowActions={(row) => (
              <div className="flex items-center justify-end gap-1.5">
                {!row.isCancelled && row.direction === "OUT" && (
                  <button onClick={() => setSettleRow(row)} title="Settle Against…" className="p-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100">
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setEditRow(row)} title="Edit" className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          />
        )}
      </section>
      )}

      {advanceModal && (
        <RecordAdvanceModal open mode={advanceModal.mode} receivable={advanceModal.receivable} toast={toast} onClose={() => setAdvanceModal(null)} onSuccess={handleAdvanceSuccess} />
      )}
      {reviseAdvance && (
        <ReviseReceivableModal receivable={reviseAdvance} toast={toast} onClose={() => setReviseAdvance(null)} onSuccess={() => { setReviseAdvance(null); refreshAll(); }} />
      )}
      {editRow && (
        <EditAdvanceModal advance={editRow} toast={toast} onClose={() => setEditRow(null)} onSuccess={() => { setEditRow(null); refreshAll(); }} />
      )}
      {settleRow && (
        <SettleAgainstModal kind="advance" row={settleRow} toast={toast} onClose={() => setSettleRow(null)} onSuccess={() => { setSettleRow(null); refreshAll(); }} />
      )}
      {historyDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-gray-900">History — {historyDoc.payer?.label || "Advance"}</h3>
              <button onClick={() => setHistoryDoc(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5">
              <DocumentHistory doc={historyDoc} kind="receivable" transactions={historyRows} loading={historyLoading} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
