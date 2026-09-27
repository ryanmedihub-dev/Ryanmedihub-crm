"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, AlertTriangle, Check, Download, Search, Loader2 } from "lucide-react";
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

const EXPORT_FIELDS = {
  transactions: [
    ["Date", (r) => fmtDay(r.date)],
    ["Narration", (r) => r.narration],
    ["Party", (r) => r.party],
    ["Category", (r) => r.category],
    ["Account", (r) => r.account],
    ["Method", (r) => r.method],
    ["Branch", (r) => r.branch],
    ["Amount", (r) => r.amount],
  ],
  documents: [
    ["Party", (r) => r.party],
    ["Purpose", (r) => r.narration],
    ["Category", (r) => r.category],
    ["Branch", (r) => r.branch],
    ["Due Date", (r) => fmtDay(r.dueDate)],
    ["Days Overdue", (r) => (r.daysOverdue > 0 ? r.daysOverdue : "")],
    ["Status", (r) => r.status],
    ["Total", (r) => r.totalAmount],
    ["Settled", (r) => r.settled],
    ["Pending", (r) => r.amount],
  ],
  obligations: [
    ["Raised", (r) => fmtDay(r.date)],
    ["Party", (r) => r.party],
    ["Purpose", (r) => r.narration],
    ["Category", (r) => r.category],
    ["Branch", (r) => r.branch],
    ["Amount", (r) => r.amount],
  ],
  accounts: [
    ["Account", (r) => r.account],
    ["Opening", (r) => r.opening],
    ["In", (r) => r.totalIn],
    ["Out", (r) => r.totalOut],
    ["Closing", (r) => r.amount],
    ["Entries", (r) => r.count],
  ],
};

const fmtDay = (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "");
const INR_FORMAT = "₹#,##,##0";
const MONEY_HEADER = /(amount|opening|in|out|closing|total|settled|pending)/i;
const EXPORT_PAGE = 200;
const EXPORT_MAX_PAGES = 25;

export default function MetricDrillPanel({ metric, label, cardValue, head, bucket, filters, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sectionPage, setSectionPage] = useState({});
  const [viewTxId, setViewTxId] = useState(null);
  const [viewDoc, setViewDoc] = useState(null);

  const [q, setQ] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [exporting, setExporting] = useState(false);

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

  
  
  const matchRow = useCallback(
    (row) => {
      const needle = q.trim().toLowerCase();
      if (needle) {
        const hay = [row.narration, row.party, row.category, row.account, row.method, row.branch, row.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const amt = Math.abs(Number(row.amount) || 0);
      if (minAmt !== "" && amt < Number(minAmt)) return false;
      if (maxAmt !== "" && amt > Number(maxAmt)) return false;
      return true;
    },
    [q, minAmt, maxAmt],
  );

  const filterActive = q.trim() !== "" || minAmt !== "" || maxAmt !== "";

  const visibleSections = useMemo(() => {
    const sections = data?.sections || [];
    if (!filterActive) return sections;
    return sections.map((s) => {
      const rows = s.rows.filter(matchRow);
      return {
        ...s,
        rows,
        filteredTotal: rows.reduce((t, r) => t + (Number(r.amount) || 0), 0),
        filteredCount: rows.length,
      };
    });
  }, [data, filterActive, matchRow]);

  
  
  const exportExcel = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const base = new URLSearchParams({ metric, limit: String(EXPORT_PAGE) });
      if (branch) base.set("branch", branch);
      if (from) base.set("from", from);
      if (to) base.set("to", to);
      if (accounts) base.set("accounts", accounts);
      if (head) base.set("head", head);
      if (bucket) base.set("bucket", bucket);

      const sheets = [];
      for (const section of data.sections) {
        let rows = [];
        for (let page = 1; page <= EXPORT_MAX_PAGES; page++) {
          const p = new URLSearchParams(base);
          p.set("section", section.key);
          p.set("page", String(page));
          const json = await fetch(`/api/admin/dashboard/drilldown?${p}`).then((r) => r.json());
          const found = (json.sections || []).find((s) => s.key === section.key);
          const batch = found?.rows || [];
          rows.push(...batch);
          if (batch.length < EXPORT_PAGE || rows.length >= (found?.count ?? 0)) break;
        }
        if (filterActive) rows = rows.filter(matchRow);

        const fields = EXPORT_FIELDS[section.shape] || EXPORT_FIELDS.transactions;
        sheets.push({
          name: section.label,
          rows: rows.map((r) => Object.fromEntries(fields.map(([h, get]) => [h, get(r) ?? ""]))),
          total: rows.reduce((t, r) => t + (Number(r.amount) || 0), 0),
          sign: section.sign ?? 1,
        });
      }

      const { utils, writeFile } = await import("xlsx");
      const wb = utils.book_new();

      for (const sheet of sheets) {
        const ws = utils.json_to_sheet(sheet.rows);
        const cols = Object.keys(sheet.rows[0] || {});
        ws["!cols"] = cols.map((k) => {
          const widest = sheet.rows
            .slice(0, 200)
            .reduce((max, row) => Math.max(max, String(row[k] ?? "").length), k.length);
          return { wch: Math.min(Math.max(widest + 2, 12), 45) };
        });
        if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
        cols.forEach((k, idx) => {
          if (!MONEY_HEADER.test(k)) return;
          const letter = utils.encode_col(idx);
          for (let r = 0; r < sheet.rows.length; r++) {
            const cell = ws[`${letter}${r + 2}`];
            if (cell && cell.t === "n") cell.z = INR_FORMAT;
          }
        });
        utils.book_append_sheet(
          wb,
          ws,
          String(sheet.name).slice(0, 31).replace(/[[\]:*?/\\]/g, " "),
        );
      }

      const meta = [
        { Field: "Metric", Value: label || data.label || metric },
        { Field: "Branch", Value: branch || "All branches" },
        { Field: "From", Value: from || "—" },
        { Field: "To", Value: to || "—" },
        { Field: "Accounts", Value: accounts ? accounts.split(",").join(", ") : "All accounts" },
        ...(head ? [{ Field: "Expense Head", Value: head }] : []),
        ...(bucket ? [{ Field: "Ageing Bucket", Value: bucket }] : []),
        ...(filterActive
          ? [{ Field: "Panel filter", Value: [q && `text "${q}"`, minAmt !== "" && `min ₹${minAmt}`, maxAmt !== "" && `max ₹${maxAmt}`].filter(Boolean).join(", ") }]
          : []),
        ...sheets.map((s) => ({
          Field: `${s.name}${s.sign === -1 ? " (subtracted)" : ""}`,
          Value: s.total,
        })),
        { Field: "Rows total", Value: sheets.reduce((t, s) => t + s.sign * s.total, 0) },
        ...(typeof cardValue === "number" ? [{ Field: "Card shows", Value: cardValue }] : []),
        { Field: "Exported At", Value: new Date().toLocaleString("en-IN") },
      ];
      const metaWs = utils.json_to_sheet(meta);
      metaWs["!cols"] = [{ wch: 26 }, { wch: 44 }];
      meta.forEach((m, i) => {
        const cell = metaWs[`B${i + 2}`];
        if (cell && cell.t === "n") cell.z = INR_FORMAT;
      });
      utils.book_append_sheet(wb, metaWs, "Info");

      const safe = String(label || metric).replace(/[^a-z0-9]+/gi, "_");
      writeFile(wb, `${safe}_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) {
      console.error("Drill-down export failed:", e);
      setError("Couldn't build the Excel file — try again");
    } finally {
      setExporting(false);
    }
  }, [data, metric, branch, from, to, accounts, head, bucket, label, cardValue, filterActive, matchRow, q, minAmt, maxAmt]);

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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={exportExcel}
              disabled={exporting || loading || !data}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Download every row behind this figure, not just this page"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? "Building…" : "Excel"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <div className="relative flex-1 min-w-45">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by party, narration, account, method…"
              className="w-full pl-8 pr-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
            />
          </div>
          <input
            type="number"
            value={minAmt}
            onChange={(e) => setMinAmt(e.target.value)}
            placeholder="Min ₹"
            className="w-24 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
          />
          <input
            type="number"
            value={maxAmt}
            onChange={(e) => setMaxAmt(e.target.value)}
            placeholder="Max ₹"
            className="w-24 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
          />
          {filterActive && (
            <button
              onClick={() => { setQ(""); setMinAmt(""); setMaxAmt(""); }}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>

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
            visibleSections.map((section) => (
              <section key={section.key}>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {section.label}
                    {section.sign === -1 && (
                      <span className="ml-1.5 text-[11px] font-medium text-rose-600">(subtracted)</span>
                    )}
                  </h3>
                  <p className="text-sm font-bold text-gray-900 tabular-nums">
                    {formatCurrency(filterActive ? section.filteredTotal : section.total)}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {filterActive
                        ? `${section.filteredCount} matched`
                        : `${section.count} ${section.count === 1 ? "record" : "records"}`}
                    </span>
                  </p>
                </div>
                {filterActive && section.count > PAGE_SIZE && (
                  <p className="mb-1.5 text-[11px] text-amber-700">
                    Filtering the {PAGE_SIZE} rows loaded here — the Excel export applies the same
                    filter across all {section.count}.
                  </p>
                )}
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
            {filterActive ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                Filtered view — totals won&apos;t match the card
              </span>
            ) : (
              hasCardValue && grandTotal != null && (
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
              )
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
