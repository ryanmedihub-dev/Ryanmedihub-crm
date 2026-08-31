"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, AlertTriangle, Check } from "lucide-react";
import AccountingTable from "./AccountingTable";
import TransactionDetailModal from "./TransactionDetailModal";
import DocumentDetailModal from "./DocumentDetailModal";
import { formatCurrency, formatDate } from "@/lib/financeUI";

const PAGE_SIZE = 50;

const COLUMNS = {
  transactions: [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "narration", label: "Narration" },
    { key: "party", label: "Party" },
    { key: "category", label: "Category" },
    { key: "account", label: "Account" },
    { key: "method", label: "Method" },
    { key: "amount", label: "Amount", numeric: true },
  ],
  documents: [
    { key: "party", label: "Party" },
    { key: "narration", label: "Purpose" },
    { key: "category", label: "Category" },
    {
      key: "dueDate",
      label: "Due",
      render: (r) => (
        <div>
          <p className="text-xs text-gray-600">{formatDate(r.dueDate)}</p>
          {r.daysOverdue > 0 && (
            <p className="text-[10px] text-red-600 font-semibold">{r.daysOverdue}d overdue</p>
          )}
        </div>
      ),
    },
    { key: "totalAmount", label: "Total", numeric: true },
    { key: "settled", label: "Settled", numeric: true },
    { key: "amount", label: "Pending", numeric: true },
  ],
  obligations: [
    { key: "date", label: "Raised", render: (r) => formatDate(r.date) },
    { key: "party", label: "Party" },
    { key: "narration", label: "Purpose" },
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", numeric: true },
  ],
  accounts: [
    { key: "account", label: "Account" },
    { key: "opening", label: "Opening", numeric: true },
    { key: "totalIn", label: "In", numeric: true },
    { key: "totalOut", label: "Out", numeric: true },
    { key: "amount", label: "Closing", numeric: true },
    { key: "count", label: "Entries", numeric: true, render: (r) => r.count ?? "—" },
  ],
};

export default function MetricDrillPanel({ metric, label, cardValue, head, bucket, filters, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sectionPage, setSectionPage] = useState({});
  const [viewTxId, setViewTxId] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);

  const panelRef = useRef(null);
  const lastFocused = useRef(null);

  const { branch = "", from = "", to = "", accounts = "" } = filters || {};

  const load = useCallback(async () => {
    if (!metric) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ metric, limit: String(PAGE_SIZE) });
      if (branch) p.set("branch", branch);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (accounts) p.set("accounts", accounts);
      if (head) p.set("head", head);
      if (bucket) p.set("bucket", bucket);
      const paged = Object.entries(sectionPage).find(([, v]) => v > 1);
      if (paged) {
        p.set("section", paged[0]);
        p.set("page", String(paged[1]));
      }
      const res = await fetch(`/api/admin/dashboard/drilldown?${p.toString()}`);
      const json = await res.json();
      if (json.success) setData(json);
      else setError(json.error || "Failed to load the rows behind this figure");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [metric, branch, from, to, accounts, head, bucket, sectionPage]);

  useEffect(() => { load(); }, [load]);

  // Reset paging whenever the metric or the dashboard filters change. Guarded on "is there
  // anything to reset" so opening the panel doesn't fire a second identical fetch.
  useEffect(() => {
    setSectionPage((prev) => (Object.keys(prev).length ? {} : prev));
  }, [metric, branch, from, to, accounts, head, bucket]);

  useEffect(() => {
    if (!metric) return;
    lastFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
    };
  }, [metric, onClose]);

  const chips = useMemo(
    () =>
      [
        branch || "All branches",
        from && to ? `${formatDate(from)} – ${formatDate(to)}` : null,
        accounts ? `${accounts.split(",").length} accounts` : null,
        head || null,
        bucket ? `Ageing ${bucket}` : null,
      ].filter(Boolean),
    [branch, from, to, accounts, head, bucket],
  );

  if (!metric) return null;

  const grandTotal = data?.grandTotal;
  const hasCardValue = typeof cardValue === "number" && Number.isFinite(cardValue);
  const reconciles = hasCardValue && grandTotal != null && Math.abs(grandTotal - cardValue) < 1;

  const openRow = (row) => {
    if (row.kind === "TX") setViewTxId(row.id);
    else if (row.kind === "PAYABLE" || row.kind === "RECEIVABLE") setViewDoc(row);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${label || metric} — underlying records`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl bg-white shadow-2xl flex flex-col outline-none"
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">
              {label || data?.label || metric}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {error ? (
            <div className="text-center py-16">
              <p className="text-sm text-rose-600 font-medium">{error}</p>
              <button onClick={load} className="mt-2 text-xs font-semibold text-indigo-600 hover:underline">
                Try again
              </button>
            </div>
          ) : loading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            (data?.sections || []).map((section) => (
              <section key={section.key}>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {section.label}
                    {section.sign === -1 && (
                      <span className="ml-1.5 text-[11px] font-medium text-rose-600">(subtracted)</span>
                    )}
                  </h3>
                  <p className="text-sm font-bold text-gray-900 tabular-nums">
                    {formatCurrency(section.total)}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {section.count} {section.count === 1 ? "record" : "records"}
                    </span>
                  </p>
                </div>
                <AccountingTable
                  columns={COLUMNS[section.shape] || COLUMNS.transactions}
                  rows={section.rows}
                  loading={loading}
                  filterConfig={{ showSearch: false, showBranch: false, showDateRange: false }}
                  urlSync={false}
                  getRowKey={(r) => r.id}
                  onRowClick={section.shape === "accounts" ? undefined : openRow}
                  emptyMessage="Nothing contributes to this figure for these filters"
                  pagination={
                    section.count > PAGE_SIZE
                      ? { total: section.count, page: sectionPage[section.key] || 1, limit: PAGE_SIZE }
                      : undefined
                  }
                  onPageChange={(p) => setSectionPage({ [section.key]: p })}
                />
              </section>
            ))
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3 bg-gray-50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Rows total</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  {grandTotal == null ? "—" : formatCurrency(grandTotal)}
                </p>
              </div>
              {hasCardValue && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Card shows</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(cardValue)}</p>
                </div>
              )}
            </div>
            {hasCardValue && grandTotal != null && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  reconciles
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {reconciles ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {reconciles
                  ? "Reconciles with the card"
                  : `Off by ${formatCurrency(Math.abs(grandTotal - cardValue))}`}
              </span>
            )}
          </div>
        </footer>
      </aside>

      {viewTxId && <TransactionDetailModal transactionId={viewTxId} onClose={() => setViewTxId(null)} />}
      {viewDoc && (
        <DocumentDetailModal
          documentId={viewDoc.id}
          kind={viewDoc.kind === "PAYABLE" ? "payable" : "receivable"}
          onClose={() => setViewDoc(null)}
        />
      )}
    </>
  );
}
