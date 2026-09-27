"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ACCOUNTS } from "@/constants/bankRouting";
import { METHOD_LABELS } from "@/constants/paymentMethods";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { exportWorkbook, filterProvenanceRows } from "@/lib/exportToExcel";
import { ledgerHeadSheets } from "@/lib/finance/headedExport";
import {
  BookOpen,
  Loader2,
  Scale,
  Settings2,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Lock,
  Unlock,
  FileDown,
  X,
} from "lucide-react";


async function writeSheet({ filename, sheets }) {
  const { utils, writeFile } = await import("xlsx");
  const wb = utils.book_new();
  for (const { name, rows, colWidths } of sheets) {
    const ws = utils.json_to_sheet(rows);
    if (colWidths) ws["!cols"] = colWidths.map((w) => ({ wch: w }));
    utils.book_append_sheet(wb, ws, name);
  }
  writeFile(wb, filename);
}

const stamp = () => new Date().toISOString().slice(0, 10);

function describeRow(r, account) {
  if (r.isSuspense) {
    const dir = r.direction === "OUT" ? "Unexplained debit" : "Unexplained credit";
    return [dir, r.reference, r.remarks].filter(Boolean).join(" · ");
  }
  if (r.isContra) {
    const dir = r.toAccount === account ? `Transfer in from ${r.fromAccount}` : `Transfer out to ${r.toAccount}`;
    return [dir, r.reference, r.remarks].filter(Boolean).join(" · ");
  }
  const head =
    r.costType === "Revenue"
      ? [r.transactionCategory || "Revenue", r.procedure, r.patientName].filter(Boolean).join(" · ")
      : [r.expense || "Expense", r.expenseType].filter(Boolean).join(" · ");
  return [head, r.remarks].filter(Boolean).join(" · ");
}

const LEDGER_COLUMNS = {
  Date: "",
  "Transaction ID": "",
  Type: "",
  Category: "",
  Patient: "",
  "Patient Phone": "",
  "Patient ID": "",
  Procedure: "",
  "Expense Head": "",
  "Expense Type": "",
  Description: "",
  Method: "",
  Branch: "",
  Reference: "",
  Remarks: "",
  "Money In": null,
  "Money Out": null,
  Balance: null,
  "Record ID": "",
};
const ledgerRow = (values) => ({ ...LEDGER_COLUMNS, ...values });
const LEDGER_COL_WIDTHS = [13, 18, 10, 14, 22, 15, 26, 18, 18, 18, 46, 16, 12, 20, 30, 14, 14, 15, 26];

const CATEGORIES = ["TRANSPLANT", "SERVICE", "MEDICINE", "EXPENSE"];
const METHODS = Object.keys(METHOD_LABELS);

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
};
const today = () => new Date().toLocaleDateString("en-CA");

const Delta = ({ value }) => (
  <span className={value >= 0 ? "text-emerald-700" : "text-rose-600"}>
    {value >= 0 ? "+" : "−"}
    {formatCurrency(Math.abs(value))}
  </span>
);

export default function CloseBookPage() {
  const toast = useToast();
  const [tab, setTab] = useState("ledger");
  const [showOpeningModal, setShowOpeningModal] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Close Book</h1>
              <p className="text-gray-600 mt-1 text-sm">
                Every rupee attributed to one of the {ACCOUNTS.length} accounts. Closing a period
                freezes its figures and locks edits to transactions dated inside it.
              </p>
            </div>
            <button
              onClick={() => setShowOpeningModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold text-sm text-gray-700 hover:bg-gray-50"
            >
              <Settings2 className="w-4 h-4" />
              Opening Balances
            </button>
          </div>

          <div className="mb-6 border-b border-gray-200">
            <div className="flex gap-4">
              {[
                { id: "ledger", label: "Account Ledger", icon: BookOpen },
                { id: "sheet", label: "Balance Sheet", icon: Scale },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`px-5 py-3 font-medium border-b-2 transition-colors ${
                    tab === id
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {tab === "ledger" ? <AccountLedger toast={toast} /> : <BalanceSheet toast={toast} />}
        </div>
      </main>

      {showOpeningModal && (
        <OpeningBalancesModal toast={toast} onClose={() => setShowOpeningModal(false)} />
      )}
    </div>
  );
}

function AccountLedger({ toast }) {
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("");
  const [branch, setBranch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ account, from, to, page: String(page), limit: "50" });
      if (category) params.set("transactionCategory", category);
      if (method) params.set("method", method);
      if (branch) params.set("branch", branch);
      const res = await fetch(`/api/close-book/ledger?${params}`);
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "Failed to load ledger");
    } catch {
      toast.error("Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [account, from, to, category, method, branch, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const onFilter = (setter) => (v) => {
    setter(v);
    setPage(1);
  };

  const [exporting, setExporting] = useState(false);

  const exportLedger = async () => {
    setExporting(true);
    try {
      const base = { account, from, to, limit: "200" };
      if (category) base.transactionCategory = category;
      if (method) base.method = method;
      if (branch) base.branch = branch;

      const all = [];
      let p = 1;
      let pages = 1;
      let head = null;
      do {
        const res = await fetch(`/api/close-book/ledger?${new URLSearchParams({ ...base, page: String(p) })}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Failed to load ledger for export");
        head = head || d;
        pages = d.pagination?.totalPages || 1;
        all.push(...(d.rows || []));
        p += 1;
      } while (p <= pages);

      const opening = head.openingBalance || 0;

      const rows = [
        ledgerRow({
          Date: formatDate(from),
          Description: "Opening balance",
          Balance: opening,
        }),
        ...all.map((r) => {
          const signed = r.signedAmount || 0;
          const isSpecial = r.isContra || r.isSuspense;
          return ledgerRow({
            Date: formatDate(r.date),
            "Transaction ID": isSpecial ? "" : r.paymentId || "",
            Type: r.isSuspense
              ? "Suspense"
              : r.isContra
                ? "Contra"
                : r.costType === "Revenue"
                  ? "Revenue"
                  : "Expense",
            Category: isSpecial ? "" : r.transactionCategory || "",
            Patient: r.patientName || "",
            "Patient Phone": r.patientPhone ? String(r.patientPhone) : "",
            "Patient ID": r.patient ? String(r.patient) : "",
            Procedure: r.procedure || "",
            "Expense Head": r.expense || "",
            "Expense Type": r.expenseType || "",
            Description: describeRow(r, account),
            Method: isSpecial ? "" : (r.method || "").replace(/_/g, " "),
            Branch: r.isContra ? "" : r.branch || "",
            Reference: r.reference || "",
            Remarks: r.remarks || "",
            "Money In": signed > 0 ? signed : null,
            "Money Out": signed < 0 ? Math.abs(signed) : null,
            Balance: r.runningBalance ?? null,
            "Record ID": String(r._id || ""),
          });
        }),
        ledgerRow({
          Date: formatDate(to),
          Description: "Closing balance",
          "Money In": head.totalIn || 0,
          "Money Out": head.totalOut || 0,
          Balance: head.closingBalance || 0,
        }),
      ];

      const scope = [
        `Account: ${account}`,
        `Period: ${formatDate(from)} to ${formatDate(to)}`,
        branch ? `Branch: ${branch}` : "Branch: All",
        category ? `Category: ${category}` : null,
        method ? `Method: ${method}` : null,
      ].filter(Boolean);

      await writeSheet({
        filename: `close-book-ledger_${account.replace(/[^a-z0-9]+/gi, "-")}_${from}_to_${to}.xlsx`,
        sheets: [
          {
            name: "Ledger",
            rows,
            colWidths: LEDGER_COL_WIDTHS,
          },
          {
            name: "Report Info",
            rows: scope.map((s) => {
              const [k, ...v] = s.split(": ");
              return { Field: k, Value: v.join(": ") };
            }).concat([
              { Field: "Opening Balance", Value: opening },
              { Field: "Total In", Value: head.totalIn || 0 },
              { Field: "Total Out", Value: head.totalOut || 0 },
              { Field: "Closing Balance", Value: head.closingBalance || 0 },
              { Field: "Movements", Value: all.length },
              { Field: "Generated", Value: new Date().toLocaleString("en-IN") },
            ]),
            colWidths: [22, 40],
          },
        ],
      });
      toast.success(`Exported ${all.length} movement${all.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Field label="Account">
            <select value={account} onChange={(e) => onFilter(setAccount)(e.target.value)} className={inputCls}>
              {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => onFilter(setFrom)(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => onFilter(setTo)(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Category">
            <select value={category} onChange={(e) => onFilter(setCategory)(e.target.value)} className={inputCls}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => onFilter(setMethod)(e.target.value)} className={inputCls}>
              <option value="">All</option>
              {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m] || m}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select value={branch} onChange={(e) => onFilter(setBranch)(e.target.value)} className={inputCls}>
              <option value="">All</option>
              {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end mt-3">
          <ExportButton
            onClick={exportLedger}
            busy={exporting}
            label="Download Excel"
            hint={data ? `${data.pagination?.total ?? 0} movements` : ""}
          />
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Opening Balance"
            value={data.openingBalance}
            hint={
              data.openingCarriedForward
                ? `incl. ${formatCurrency(data.openingCarriedForward)} carried forward`
                : data.openingBalanceSeeded
                  ? undefined
                  : "not set"
            }
          />
          <Stat label="Money In" value={data.totalIn} tone="emerald" icon={TrendingUp} />
          <Stat label="Money Out" value={data.totalOut} tone="rose" icon={TrendingDown} />
          <Stat label="Closing Balance" value={data.closingBalance} strong />
        </div>
      )}

      {data?.contraExcludedByFilter && (
        <Notice>
          This category/method filter excludes internal transfers between accounts — a transfer
          has neither, so it could only ever be a false match. The figures below will not
          reconcile with an unfiltered view.
        </Notice>
      )}
      {branch && !data?.contraExcludedByFilter && (
        <Notice>
          Showing transfers tagged to <b>{branch}</b>. Any transfer left company-level appears
          only in the unfiltered view, so these figures may not reconcile with it.
        </Notice>
      )}

      {data && !data.openingBalanceSeeded && !data.openingCarriedForward && (
        <Notice>
          No opening balance is set for <b>{account}</b> and nothing has moved through it before
          {" "}{formatDate(from)}. Figures below start from zero. Set an anchor via{" "}
          <b>Opening Balances</b> if this account held money the CRM never saw.
        </Notice>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Trans ID</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Movement</th>
                <th className="px-4 py-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td></tr>
              ) : !data?.rows?.length ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  No movements for {account} in this period
                  {data?.contraExcludedByFilter ? " under these filters" : ""}.
                </td></tr>
              ) : (
                <>
                  <tr className="bg-gray-50/60">
                    <td className="px-4 py-2 text-gray-500">{formatDate(from)}</td>
                    <td className="px-4 py-2 font-medium text-gray-700" colSpan={6}>Opening balance</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">
                      {formatCurrency(data.openingBalance)}
                    </td>
                  </tr>
                  {data.rows.map((r) => (
                    <tr key={r._id} className={`hover:bg-gray-50/60 ${r.isContra ? "bg-violet-50/40" : r.isSuspense ? "bg-amber-50/50" : ""}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDate(r.date)}</td>
                      <td className="px-4 py-2 text-gray-800">
                        {r.isSuspense ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                              Suspense
                            </span>
                            <span>
                              {r.direction === "OUT" ? "Unexplained debit" : "Unexplained credit"}
                            </span>
                            {r.reference && <span className="text-gray-400">· {r.reference}</span>}
                            {r.remarks && <span className="text-gray-400">· {r.remarks}</span>}
                          </span>
                        ) : r.isContra ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                              Contra
                            </span>
                            <span>
                              {r.toAccount === account
                                ? `Transfer in from ${r.fromAccount}`
                                : `Transfer out to ${r.toAccount}`}
                            </span>
                            {r.reference && <span className="text-gray-400">· {r.reference}</span>}
                            {r.remarks && <span className="text-gray-400">· {r.remarks}</span>}
                          </span>
                        ) : (
                          <>
                            {r.costType === "Revenue"
                              ? `${r.transactionCategory || "Revenue"}${r.procedure ? ` · ${r.procedure}` : ""}${r.patientName ? ` · ${r.patientName}` : ""}`
                              : `${r.expense || "Expense"}${r.expenseType ? ` · ${r.expenseType}` : ""}`}
                            {r.remarks && <span className="text-gray-400"> · {r.remarks}</span>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {r.patientName ? (
                          <div className="leading-tight">
                            <div className="truncate max-w-45">{r.patientName}</div>
                            {r.patientPhone && (
                              <div className="text-[11px] text-gray-400 font-mono">{r.patientPhone}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {r.isContra || r.isSuspense ? (
                          <span className="text-gray-300">—</span>
                        ) : r.paymentId ? (
                          <span className="font-mono text-xs text-gray-600">{r.paymentId}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {r.isContra || r.isSuspense ? "—" : (r.method || "").replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{r.isContra ? "—" : r.branch || "—"}</td>
                      <td className="px-4 py-2 text-right font-medium"><Delta value={r.signedAmount} /></td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900">
                        {formatCurrency(r.runningBalance)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="px-4 py-2.5 text-gray-500">{formatDate(to)}</td>
                    <td className="px-4 py-2.5 font-bold text-gray-900" colSpan={6}>Closing balance</td>
                    <td className="px-4 py-2.5 text-right font-bold text-indigo-700">
                      {formatCurrency(data.closingBalance)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {data?.pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <span className="text-gray-500">
              Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} movements
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {data && (
        <p className="text-[11px] text-gray-400">
          Running balance is cumulative from the period start, so it stays correct on every
          page. Non-cash methods (offset settlement, package-included, externally handled) are
          excluded — no cash moves through an account for those.
          {data.contraCount > 0 && (
            <>
              {" "}
              Includes {data.contraCount} internal transfer
              {data.contraCount === 1 ? "" : "s"}, shown from this account&apos;s side — the
              matching entry appears in the other account&apos;s ledger.
            </>
          )}{" "}
          Query took {data.elapsedMs}ms.
        </p>
      )}
    </div>
  );
}

function BalanceSheet({ toast }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [branch, setBranch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closedPeriods, setClosedPeriods] = useState([]);
  const [reopenTarget, setReopenTarget] = useState(null);

  const loadClosed = useCallback(async () => {
    try {
      const res = await fetch("/api/close-book/reopen?limit=100");
      const d = await res.json();
      if (res.ok) setClosedPeriods(d.periods || []);
    } catch {  }
  }, []);

  useEffect(() => { loadClosed(); }, [loadClosed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (branch) params.set("branch", branch);
      const res = await fetch(`/api/close-book/balance-sheet?${params}`);
      const d = await res.json();
      if (res.ok) setData(d);
      else toast.error(d.error || "Failed to load balance sheet");
    } catch {
      toast.error("Failed to load balance sheet");
    } finally {
      setLoading(false);
    }
  }, [from, to, branch, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const [exporting, setExporting] = useState(false);

  const exportBalanceSheet = async () => {
    if (!data?.accounts?.length) return toast.error("Nothing to export yet");
    setExporting(true);
    try {
      const rows = data.accounts.map((a) => ({
        Account: a.account,
        "Opening Balance": a.openingBalance,
        "Money In": a.totalIn,
        "Money Out": a.totalOut,
        "Net Movement": Math.round((a.totalIn - a.totalOut) * 100) / 100,
        "Closing Balance": a.closingBalance,
        Transactions: a.transactionCount,
        Transfers: a.contraCount,
        "Opening Set": a.openingBalanceSeeded ? "Yes" : "No",
      }));

      rows.push({
        Account: "TOTAL",
        "Opening Balance": data.grandTotal.openingBalance,
        "Money In": data.grandTotal.totalIn,
        "Money Out": data.grandTotal.totalOut,
        "Net Movement": Math.round((data.grandTotal.totalIn - data.grandTotal.totalOut) * 100) / 100,
        "Closing Balance": data.grandTotal.closingBalance,
        Transactions: data.grandTotal.transactionCount,
        Transfers: "",
        "Opening Set": "",
      });

      const info = [
        ...filterProvenanceRows({ branch, dateFrom: from, dateTo: to }),
        { Field: "Total In", Value: data.grandTotal.totalIn },
        { Field: "Total Out", Value: data.grandTotal.totalOut },
        { Field: "Closing Balance", Value: data.grandTotal.closingBalance },
      ];
      if (data.unattributed?.count) {
        info.push({
          Field: "Unattributed (excluded)",
          Value: `${data.unattributed.count} rows, ${data.unattributed.amount}`,
        });
      }

      
      const accountSheets = await ledgerHeadSheets({
        accounts: data.accounts.map((a) => a.account),
        scope: { branch, dateFrom: from, dateTo: to },
      });

      await exportWorkbook({
        filename: `close-book-balance-sheet_${from}_to_${to}${branch ? `_${branch}` : ""}.xlsx`,
        sheets: [
          { name: "Info", rows: info, colWidths: [26, 42] },
          {
            name: "Overview",
            rows,
            colWidths: [22, 17, 15, 15, 15, 17, 13, 11, 12],
            currencyCols: ["Opening Balance", "Money In", "Money Out", "Net Movement", "Closing Balance"],
          },
          ...accountSheets,
        ],
      });
      toast.success("Balance sheet exported");
    } catch (e) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To (as-of date)">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Branch">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              <option value="">All branches</option>
              {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3 mt-2">
          <p className="text-[11px] text-gray-400">
            Set “To” to any date to see what each account held as of that day.
          </p>
          <ExportButton
            onClick={exportBalanceSheet}
            busy={exporting}
            label="Download Excel"
            hint={data ? `${data.accounts?.length ?? 0} accounts` : ""}
          />
        </div>
      </div>

      {branch && (
        <Notice>
          Branch view excludes internal transfers between accounts. Contra entries move money
          between company-level accounts and belong to no single branch, so these totals will not
          match the “All branches” view.
        </Notice>
      )}

      {data?.unattributed?.count > 0 && (
        <Notice>
          <b>{data.unattributed.count.toLocaleString("en-IN")}</b> cash-moving transactions in
          this period ({formatCurrency(data.unattributed.amount)}) carry no account and are
          excluded from every column below. Historical rows predate account tracking.
        </Notice>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">In</th>
                <th className="px-4 py-3 text-right">Out</th>
                <th className="px-4 py-3 text-right">Closing</th>
                <th className="px-4 py-3 text-right">Movements</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" />
                </td></tr>
              ) : (
                <>
                  {data?.accounts?.map((a) => (
                    <tr key={a.account} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {a.account}
                        {!a.openingBalanceSeeded && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                            no opening set
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(a.openingBalance)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(a.totalIn)}</td>
                      <td className="px-4 py-3 text-right text-rose-600">{formatCurrency(a.totalOut)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(a.closingBalance)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{a.transactionCount}</td>
                      <td className="px-4 py-3 text-right">
                        {closedFor(closedPeriods, a.account, from, to) ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
                            <Lock className="w-3 h-3" /> Closed
                          </span>
                        ) : (
                          <button
                            onClick={() => setCloseTarget(a.account)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                          >
                            Close Period
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data?.grandTotal && (
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                      <td className="px-4 py-3 text-gray-900">Grand Total</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(data.grandTotal.openingBalance)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(data.grandTotal.totalIn)}</td>
                      <td className="px-4 py-3 text-right text-rose-600">{formatCurrency(data.grandTotal.totalOut)}</td>
                      <td className="px-4 py-3 text-right text-indigo-700">{formatCurrency(data.grandTotal.closingBalance)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{data.grandTotal.transactionCount}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setCloseTarget("ALL")}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          Close All
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <p className="text-[11px] text-gray-400">
          Closing = opening + in − out, per account. Non-cash methods excluded. Query took{" "}
          {data.elapsedMs}ms.
        </p>
      )}

      {closedPeriods.length > 0 && (
        <ClosedPeriodsPanel
          periods={closedPeriods}
          onReopen={(p) => setReopenTarget(p)}
        />
      )}

      {closeTarget && (
        <ClosePeriodModal
          toast={toast}
          from={from}
          to={to}
          accounts={closeTarget === "ALL" ? ACCOUNTS : [closeTarget]}
          onClose={() => setCloseTarget(null)}
          onDone={() => { setCloseTarget(null); load(); loadClosed(); }}
        />
      )}

      {reopenTarget && (
        <ReopenModal
          toast={toast}
          period={reopenTarget}
          onClose={() => setReopenTarget(null)}
          onDone={() => { setReopenTarget(null); load(); loadClosed(); }}
        />
      )}
    </div>
  );
}

function closedFor(periods, account, from, to) {
  const s = new Date(from).getTime();
  const e = new Date(to).getTime();
  return periods.some(
    (p) =>
      p.account === account &&
      new Date(p.periodStart).getTime() === s &&
      new Date(p.periodEnd).getTime() === e,
  );
}

function ClosePeriodModal({ toast, from, to, accounts, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ from, to, accounts: accounts.join(",") });
        const res = await fetch(`/api/close-book/close?${params}`);
        const d = await res.json();
        if (res.ok) setPreview(d);
        else toast.error(d.error || "Failed to build preview");
      } finally {
        setLoading(false);
      }
    })();
  }, [from, to, accounts, toast]);

  const confirm = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/close-book/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, accounts, notes }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message || "Period closed");
        onDone();
      } else toast.error(d.error || "Failed to close period");
    } catch {
      toast.error("Failed to close period");
    } finally {
      setSaving(false);
    }
  };

  const blocked = preview?.accounts?.some((a) => a.alreadyClosed);

  return (
    <Modal title="Close Period" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">This freezes the figures below.</p>
          <p className="text-xs">
            Once closed, transactions dated inside this period can no longer be edited or
            deleted — by anyone, including super-admins. A super-admin must reopen the period
            with a logged reason to make changes.
          </p>
        </div>

        <div className="text-sm">
          <span className="text-gray-500">Period:</span>{" "}
          <b className="text-gray-900">{formatDate(from)} → {formatDate(to)}</b>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Opening</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                  <th className="px-3 py-2 text-right">Closing (frozen)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview?.accounts?.map((a) => (
                  <tr key={a.account} className={a.alreadyClosed ? "opacity-50" : ""}>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {a.account}
                      {a.alreadyClosed && <span className="ml-2 text-[10px] text-rose-600">already closed</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(a.openingBalance)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(a.totalIn)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{formatCurrency(a.totalOut)}</td>
                    <td className="px-3 py-2 text-right font-bold text-indigo-700">{formatCurrency(a.closingBalance)}</td>
                  </tr>
                ))}
                {preview?.grandTotal && preview.accounts.length > 1 && (
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-3 py-2 text-gray-900">Total</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(preview.grandTotal.openingBalance)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatCurrency(preview.grandTotal.totalIn)}</td>
                    <td className="px-3 py-2 text-right text-rose-600">{formatCurrency(preview.grandTotal.totalOut)}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{formatCurrency(preview.grandTotal.closingBalance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Field label="Notes (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. March close, reviewed by finance" />
        </Field>

        {blocked && (
          <p className="text-xs text-rose-600">
            One or more accounts are already closed for this exact period. Reopen before closing again.
          </p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving || loading || blocked}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Close &amp; Freeze
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ClosedPeriodsPanel({ periods, onReopen }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Closed Periods</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Reopening recomputes that period and every later one for the account.
        </p>
      </div>
      <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {periods.map((p) => (
          <div key={p._id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-gray-900">
                {p.account} · {formatDate(p.periodStart)} → {formatDate(p.periodEnd)}
              </p>
              <p className="text-xs text-gray-500">
                Closing {formatCurrency(p.closingBalance)}
                {p.closedBy?.name ? ` · closed by ${p.closedBy.name}` : ""}
              </p>
            </div>
            <button
              onClick={() => onReopen(p)}
              className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            >
              Reopen
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReopenModal({ toast, period, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return toast.error("A reason is required to reopen a period");
    setSaving(true);
    try {
      const res = await fetch("/api/close-book/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId: period._id, reason }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message || "Period reopened");
        onDone();
      } else toast.error(d.error || "Failed to reopen");
    } catch {
      toast.error("Failed to reopen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Reopen Period" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">
            {period.account} · {formatDate(period.periodStart)} → {formatDate(period.periodEnd)}
          </p>
          <p className="text-xs">
            This period and <b>every later period for {period.account}</b> will be recomputed
            immediately, so no later opening balance is left stale. Super-admin only. The
            reason below is recorded permanently.
          </p>
        </div>

        <Field label="Reason (required)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Why does this closed period need to change?"
          />
        </Field>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !reason.trim()}
            className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
            Reopen &amp; Recompute
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function OpeningBalancesModal({ toast, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [asOf, setAsOf] = useState(monthStart());
  const [drafts, setDrafts] = useState({});
  const [branch, setBranch] = useState("");
  const isAll = !branch;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = branch ? `?branch=${encodeURIComponent(branch)}` : "";
      const res = await fetch(`/api/close-book/opening-balance${qs}`);
      const d = await res.json();
      if (res.ok) setRows(d.openingBalances || []);
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setDrafts({}); }, [branch]);

  const save = async (account) => {
    const raw = drafts[account];
    if (raw === undefined || raw === "") return toast.error("Enter an opening balance first");
    setSaving(account);
    try {
      const res = await fetch("/api/close-book/opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account,
          openingBalance: Number(raw),
          asOf,
          ...(branch ? { branch } : {}),
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`Opening balance set for ${account}${branch ? ` — ${branch}` : ""}`);
        setDrafts((x) => ({ ...x, [account]: "" }));
        load();
      } else toast.error(d.error || "Failed to save");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Opening Balances</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Entered by hand — historical transactions carry no account, so per-account
              history before this feature can&apos;t be derived.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Scope">
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
                <option value="">All branches (total)</option>
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="As of date (balances count forward from here)">
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Notice>
            {branch ? (
              <>
                Setting <b>{branch}</b>&apos;s opening position. It counts toward the
                &ldquo;All branches&rdquo; total as well as {branch}&apos;s own ledger.
              </>
            ) : (
              <>
                <b>Read-only.</b> These are the totals of every branch figure below, and this is
                what the close book shows when no branch filter is applied. Pick a branch above
                to enter or change a figure.
              </>
            )}
          </Notice>

          {loading ? (
            <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.account} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{r.account}</p>
                      <p className="text-xs text-gray-500">
                        {r.set
                          ? `${formatCurrency(r.openingBalance)}${r.asOf ? ` as of ${formatDate(r.asOf)}` : ""}` +
                            (r.derivedFromBranches
                              ? ` · total of ${r.branches.length} branch${r.branches.length === 1 ? "" : "es"}`
                              : "")
                          : "Not set"}
                      </p>
                    </div>

                    {isAll ? (
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">
                        {r.set ? formatCurrency(r.openingBalance) : "—"}
                      </span>
                    ) : (
                      <>
                        <input
                          type="number"
                          value={drafts[r.account] ?? ""}
                          onChange={(e) => setDrafts((x) => ({ ...x, [r.account]: e.target.value }))}
                          placeholder="0.00"
                          className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
                        />
                        <button
                          onClick={() => save(r.account)}
                          disabled={saving === r.account}
                          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {saving === r.account ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set"}
                        </button>
                      </>
                    )}
                  </div>

                  {r.branches?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-2 gap-y-1">
                      {r.branches.map((b) => (
                        <span
                          key={b.branch}
                          className={`text-[11px] px-1.5 py-0.5 rounded border ${
                            b.branch === branch
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {b.branch}: {formatCurrency(b.openingBalance)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm";

function ExportButton({ onClick, busy, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50 transition-colors shrink-0"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {busy ? "Preparing…" : label}
      {hint && !busy && <span className="text-[11px] font-normal text-gray-400">· {hint}</span>}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, strong, icon: Icon, hint }) {
  const color =
    tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-600" : "text-gray-900";
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
        {hint && <span className="text-[10px] text-amber-600">({hint})</span>}
      </p>
      <p className={`mt-1 ${strong ? "text-2xl font-bold text-indigo-700" : `text-xl font-semibold ${color}`}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function Notice({ children }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
