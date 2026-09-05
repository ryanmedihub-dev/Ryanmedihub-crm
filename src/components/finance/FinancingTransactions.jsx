"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import AccountingTable from "@/components/finance/AccountingTable";
import { formatCurrency, formatDate, StatusBadge } from "@/lib/financeUI";
import { settlementLinesFor } from "@/lib/advanceSettlements";

/**
 * Read-only listing of advance or borrowing transactions for a period — the same
 * "Advance Transactions" / "Borrowing Transactions" tables shown on /admin/financing,
 * surfaced on the Payments and Receipts pages so those pages tell the whole cash story.
 */
const CONFIG = {
  advance: {
    endpoint: "/api/advances/list",
    listKey: "advances",
    settlesField: "settlesPayableId",
    settlesLabel: "Settling a payable",
    directions: [
      { value: "", label: "All directions" },
      { value: "OUT", label: "Advanced" },
      { value: "IN", label: "Recovered" },
    ],
    dirBadge: (d) => (d === "OUT" ? "Advanced" : "Recovered"),
    emptyMessage: "No advance transactions recorded",
  },
  borrowing: {
    endpoint: "/api/borrowings/list",
    listKey: "borrowings",
    settlesField: "settlesReceivableId",
    settlesLabel: "Settling a receivable",
    directions: [
      { value: "", label: "All directions" },
      { value: "IN", label: "Received" },
      { value: "OUT", label: "Repayment" },
    ],
    dirBadge: (d) => (d === "OUT" ? "Repayment" : "Received"),
    emptyMessage: "No borrowing transactions recorded",
  },
};

export default function FinancingTransactions({ kind, from, to, branch = "" }) {
  const cfg = CONFIG[kind];

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("");

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const p = new URLSearchParams({ page: String(page), limit: "20" });
        if (from) p.set("from", from);
        if (to) p.set("to", to);
        if (branch) p.set("branch", branch);
        if (search) p.set("party", search);
        if (direction) p.set("direction", direction);
        const res = await fetch(`${cfg.endpoint}?${p}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load transactions");
        setRows(data[cfg.listKey] || []);
        setMeta({ total: data.total || 0, page: data.page || 1, limit: data.limit || 20 });
      } catch (err) {
        setError(err.message || "Failed to load transactions");
      } finally {
        setLoading(false);
      }
    },
    [cfg.endpoint, cfg.listKey, from, to, branch, search, direction],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const columns = [
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    {
      key: "direction",
      label: "Direction",
      render: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
            r.direction === "OUT"
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {cfg.dirBadge(r.direction)}
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
      render: (r) => {
        if (kind !== "advance") {
          return r[cfg.settlesField] ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700">
              <Link2 className="w-3 h-3" /> {cfg.settlesLabel}
            </span>
          ) : (
            "—"
          );
        }
        const lines = settlementLinesFor(r);
        if (lines.length === 0) return "—";
        const total = lines.reduce((sum, l) => sum + (l.amount || 0), 0);
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-700">
            <Link2 className="w-3 h-3" />{" "}
            {lines.length > 1
              ? `Settling ${lines.length} payables · ${formatCurrency(total)}`
              : `Settling ${formatCurrency(total)}`}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.isCancelled ? "Cancelled" : "Active"} />,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
        >
          {cfg.directions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </span>
          <button onClick={() => load(meta.page)} className="font-semibold underline shrink-0">
            Retry
          </button>
        </div>
      ) : (
        <AccountingTable
          columns={columns}
          rows={rows}
          loading={loading}
          urlSync={false}
          filterConfig={{
            showSearch: true,
            searchPlaceholder: "Search party…",
            showBranch: false,
            showDateRange: false,
          }}
          filters={{ search }}
          onFilterChange={(f) => setSearch(f.search)}
          pagination={meta}
          onPageChange={(p) => load(p)}
          getRowKey={(r) => r._id}
          emptyMessage={cfg.emptyMessage}
        />
      )}
    </div>
  );
}
