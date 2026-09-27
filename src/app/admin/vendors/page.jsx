"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import {
  Loader2,
  Plus,
  Search,
  Store,
  Mail,
  Phone,
  Hash,
  Pencil,
  ChevronRight,
  Users,
  Wallet,
  Coins,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Download } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { formatCurrency } from "@/lib/financeUI";
import { ALL_BRANCHES } from "@/lib/branches";
import VendorLedgerModal from "@/components/finance/VendorLedgerModal";
import { exportWorkbook, filterProvenanceRows } from "@/lib/exportToExcel";
import { fetchInterleavedRows } from "@/lib/finance/headedExport";


const initials = (name) =>
  (name || "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-sky-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-violet-500 to-fuchsia-600",
];
const avatarGradient = (name) => {
  let hash = 0;
  for (const ch of name || "?") hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[hash];
};

export default function AdminVendorsPage() {
  const toast = useToast();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState({ branch: "", dateFrom: "", dateTo: "" });
  const [ledger, setLedger] = useState({});
  const [recvLedger, setRecvLedger] = useState({});
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [openVendor, setOpenVendor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendors/get");
      const d = await res.json();
      if (res.ok && d.success !== false) setVendors(d.data || d.vendors || []);
      else toast.error(d.message || "Failed to load vendors");
    } catch {
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const p = new URLSearchParams({ level: "1", groupBy: "vendor" });
      if (scope.branch) p.set("branch", scope.branch);
      if (scope.dateFrom) p.set("from", scope.dateFrom);
      if (scope.dateTo) p.set("to", scope.dateTo);
      const [payJson, recvJson] = await Promise.all([
        fetch(`/api/payables/grouped?${p.toString()}`).then((r) => r.json()),
        fetch(`/api/receivables/grouped?${p.toString()}`).then((r) => r.json()),
      ]);
      const byId = {};
      (payJson.rows || []).forEach((r) => {
        byId[r.key] = r;
      });
      const recvById = {};
      (recvJson.rows || []).forEach((r) => {
        recvById[r.key] = r;
      });
      setLedger(byId);
      setRecvLedger(recvById);
    } catch {
      toast.error("Failed to load vendor balances");
    } finally {
      setLedgerLoading(false);
    }
  }, [scope, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const term = search.trim().toLowerCase();
  const shown = term
    ? vendors.filter((v) =>
        [v.name, v.DealsIn, v.email, v.gstNumber, v.contact]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(term)),
      )
    : vendors;

  const stats = useMemo(() => {
    const rows = Object.values(ledger);
    const recvRows = Object.values(recvLedger);
    const totalOutstanding = rows.reduce((s, r) => s + Math.max(r.closing, 0), 0);
    const totalSettled = rows.reduce((s, r) => s + (r.settled || 0), 0);
    const withDues = rows.filter((r) => r.closing > 0.5).length;
    const totalReceivable = recvRows.reduce((s, r) => s + Math.max(r.closing, 0), 0);
    return { totalOutstanding, totalSettled, withDues, totalReceivable };
  }, [ledger, recvLedger]);

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const groupedQS = () => {
        const p = new URLSearchParams({ level: "1", groupBy: "vendor" });
        if (scope.branch) p.set("branch", scope.branch);
        if (scope.dateFrom) p.set("from", scope.dateFrom);
        if (scope.dateTo) p.set("to", scope.dateTo);
        return p.toString();
      };
      const [gJson, rJson, interleaved] = await Promise.all([
        fetch(`/api/payables/grouped?${groupedQS()}`).then((r) => r.json()),
        fetch(`/api/receivables/grouped?${groupedQS()}`).then((r) => r.json()),
        fetchInterleavedRows({ kind: "payables", scope }),
      ]);
      if (interleaved.truncated) {
        toast.error(
          `Detail sheet capped at the ${interleaved.docLimit || 5000} newest payables — narrow the date range for a complete file.`,
        );
      }

      
      const byKey = new Map();
      (gJson.rows || []).forEach((r) => {
        byKey.set(r.key, {
          Vendor: r.label,
          "Payable Billed": r.movement,
          "Payable Paid": r.settled,
          "Payable Pending": r.closing,
          "Receivable Invoiced": 0,
          "Receivable Received": 0,
          "Receivable Pending": 0,
        });
      });
      (rJson.rows || []).forEach((r) => {
        const row = byKey.get(r.key) || {
          Vendor: r.label,
          "Payable Billed": 0,
          "Payable Paid": 0,
          "Payable Pending": 0,
          "Receivable Invoiced": 0,
          "Receivable Received": 0,
          "Receivable Pending": 0,
        };
        row["Receivable Invoiced"] = r.movement;
        row["Receivable Received"] = r.settled;
        row["Receivable Pending"] = r.closing;
        byKey.set(r.key, row);
      });
      const overviewRows = [...byKey.values()];

      
      const vendorDetail = (interleaved.rows || []).filter((row) => row["Payee Type"] === "VENDOR");

      await exportWorkbook({
        filename: `Vendors_${scope.branch || "All"}_${scope.dateFrom || "start"}_to_${scope.dateTo || "today"}.xlsx`,
        sheets: [
          {
            name: "Info",
            rows: filterProvenanceRows({ branch: scope.branch, dateFrom: scope.dateFrom, dateTo: scope.dateTo }),
            colWidths: [22, 24],
          },
          {
            name: "Overview",
            rows: overviewRows,
            colWidths: [26, 16, 14, 16, 18, 18, 18],
            currencyCols: [
              "Payable Billed",
              "Payable Paid",
              "Payable Pending",
              "Receivable Invoiced",
              "Receivable Received",
              "Receivable Pending",
            ],
          },
          {
            name: "Payables & Payments",
            rows: vendorDetail,
            colWidths: [8, 24, 12, 16, 16, 12, 10, 14, 12, 14, 12, 12, 14, 16, 18, 24],
            currencyCols: ["Total Amount", "Paid", "Pending", "Payment Amount"],
          },
        ],
      });
      toast.success("Vendors exported");
    } catch (err) {
      console.error("Vendor export failed:", err);
      toast.error("Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = !!(scope.branch || scope.dateFrom || scope.dateTo);
  const asOfLabel = scope.dateTo
    ? new Date(scope.dateTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "today";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
              <p className="text-gray-500 mt-1 text-sm">
                Suppliers you buy from, and what's owed to each one — balance as of {asOfLabel}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download Excel
              </button>
              <Link
                href="/admin/vendors/create"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-sm shadow-indigo-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Vendor
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Total Vendors"
              value={loading ? "…" : vendors.length}
              icon={Users}
              color="from-indigo-500 to-indigo-600"
            />
            <MetricCard
              title="Payable — We Owe"
              value={ledgerLoading ? "…" : formatCurrency(stats.totalOutstanding)}
              icon={Wallet}
              color="from-rose-500 to-rose-600"
            />
            <MetricCard
              title="Receivable — Owed To Us"
              value={ledgerLoading ? "…" : formatCurrency(stats.totalReceivable)}
              icon={Coins}
              color="from-emerald-500 to-emerald-600"
            />
            <MetricCard
              title="Vendors With Dues"
              value={ledgerLoading ? "…" : stats.withDues}
              icon={AlertTriangle}
              color="from-amber-500 to-amber-600"
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-55">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, category, email, GST or phone…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300"
                />
              </div>
              <div className="h-8 w-px bg-gray-100 hidden sm:block" />
              <select
                value={scope.branch}
                onChange={(e) => setScope((s) => ({ ...s, branch: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white text-gray-700"
              >
                <option value="">All branches</option>
                {ALL_BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <input
                type="date"
                value={scope.dateFrom}
                onChange={(e) => setScope((s) => ({ ...s, dateFrom: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={scope.dateTo}
                onChange={(e) => setScope((s) => ({ ...s, dateTo: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700"
              />
              {hasFilters && (
                <button
                  onClick={() => setScope({ branch: "", dateFrom: "", dateTo: "" })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="px-5 py-3.5" rowSpan={2}>Vendor</th>
                    <th className="px-4 py-3.5" rowSpan={2}>Deals In</th>
                    <th className="px-4 py-3.5" rowSpan={2}>Contact</th>
                    <th className="px-4 py-2 text-center text-rose-500 border-l border-gray-200" colSpan={3}>
                      Payable — We Owe
                    </th>
                    <th className="px-4 py-2 text-center text-emerald-600 border-l border-gray-200" colSpan={3}>
                      Receivable — Owed To Us
                    </th>
                    <th className="px-4 py-3.5" rowSpan={2} />
                  </tr>
                  <tr className="bg-gray-50/80 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-200">
                    <th className="px-4 py-2 text-right border-l border-gray-200">Billed</th>
                    <th className="px-4 py-2 text-right">Paid</th>
                    <th className="px-4 py-2 text-right">Pending</th>
                    <th className="px-4 py-2 text-right border-l border-gray-200">Invoiced</th>
                    <th className="px-4 py-2 text-right">Received</th>
                    <th className="px-4 py-2 text-right">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(10)].map((__, j) => (
                          <td key={j} className="px-4 py-4">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? "70%" : "50%" }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : !shown.length ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-16 text-center">
                        <Store className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-gray-500 font-medium">
                          {vendors.length ? "No vendor matches that search." : "No vendors yet"}
                        </p>
                        {!vendors.length && (
                          <p className="text-gray-400 text-xs mt-1">Add your first supplier to get started.</p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    shown.map((v) => {
                      const bal = ledger[v._id];
                      const rbal = recvLedger[v._id];
                      const pending = bal?.closing ?? 0;
                      const rPending = rbal?.closing ?? 0;
                      const isSettled = bal && pending <= 0.5 && bal.movement > 0;
                      const rIsSettled = rbal && rPending <= 0.5 && rbal.movement > 0;
                      return (
                        <tr
                          key={v._id}
                          onClick={() => setOpenVendor(v)}
                          className="group hover:bg-indigo-50/40 cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-2xl bg-linear-to-br ${avatarGradient(v.name)} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm`}
                              >
                                {initials(v.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate">{v.name || "Unnamed"}</p>
                                {v.gstNumber ? (
                                  <p className="text-[11px] text-gray-400 flex items-center gap-1 truncate">
                                    <Hash className="w-2.5 h-2.5" />
                                    {v.gstNumber}
                                  </p>
                                ) : v.address ? (
                                  <p className="text-[11px] text-gray-400 truncate max-w-xs">{v.address}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {v.DealsIn ? (
                              <span className="inline-flex px-2 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                {v.DealsIn}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-gray-500">
                            <div className="space-y-0.5">
                              {v.contact ? (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Phone className="w-3 h-3 text-gray-300" />
                                  <span className="font-mono">{v.contact}</span>
                                </div>
                              ) : null}
                              {v.email ? (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Mail className="w-3 h-3 text-gray-300" />
                                  <span className="truncate max-w-45">{v.email}</span>
                                </div>
                              ) : null}
                              {!v.contact && !v.email && <span className="text-gray-300">—</span>}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-600 border-l border-gray-100">
                            {ledgerLoading ? "…" : bal ? formatCurrency(bal.movement) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-emerald-600 font-medium">
                            {ledgerLoading ? "…" : bal ? formatCurrency(bal.settled) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {ledgerLoading ? (
                              <span className="text-gray-400">…</span>
                            ) : !bal ? (
                              <span className="text-gray-300">—</span>
                            ) : isSettled ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                              </span>
                            ) : (
                              <div>
                                <p className="tabular-nums font-bold text-rose-600">{formatCurrency(pending)}</p>
                                {bal.opening > 0.5 && (
                                  <p className="text-[10px] text-gray-400">incl. {formatCurrency(bal.opening)} opening</p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-gray-600 border-l border-gray-100">
                            {ledgerLoading ? "…" : rbal ? formatCurrency(rbal.movement) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums text-emerald-600 font-medium">
                            {ledgerLoading ? "…" : rbal ? formatCurrency(rbal.settled) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {ledgerLoading ? (
                              <span className="text-gray-400">…</span>
                            ) : !rbal ? (
                              <span className="text-gray-300">—</span>
                            ) : rIsSettled ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Clear
                              </span>
                            ) : (
                              <div>
                                <p className="tabular-nums font-bold text-amber-600">{formatCurrency(rPending)}</p>
                                {rbal.opening > 0.5 && (
                                  <p className="text-[10px] text-gray-400">incl. {formatCurrency(rbal.opening)} opening</p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                              <Link
                                href={`/stocks/vendors/edit/${v._id}`}
                                title="Edit vendor"
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Link>
                              <button
                                onClick={() => setOpenVendor(v)}
                                title="View ledger"
                                className="p-1.5 rounded-lg border border-gray-200 text-indigo-600 hover:bg-indigo-50"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && vendors.length > 0 && (
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Store className="w-3 h-3" />
              {shown.length} of {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · click a row to see its full bill history
            </p>
          )}
        </div>
      </main>

      {openVendor && (
        <VendorLedgerModal vendor={openVendor} scope={scope} onClose={() => setOpenVendor(null)} />
      )}
    </div>
  );
}
