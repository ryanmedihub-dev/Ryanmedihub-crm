"use client";

import { useState, useEffect, useMemo } from "react";
import { useDebounced } from "@/lib/useDebounced";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import {
  Search, Download, RefreshCw, Pencil, Trash2, FileText,
  Scissors, Heart, Pill, Receipt, ChevronLeft, ChevronRight,
  ChevronDown, User, Filter, X, Clock, History, ArrowRight,
  CheckCircle, AlertCircle, Plus,
} from "lucide-react";
import Link from "next/link";
import BillGenerator from "@/components/BillGenerator";

const DATE_RANGES = ["Today", "Yesterday", "Last 7 Days", "This Month", "Custom"];

const CAT_CFG = {
  TRANSPLANT: { label: "Transplants", tab: "Transplant", gradient: "from-violet-500 to-purple-600", icon: Scissors },
  SERVICE:    { label: "Services",    tab: "Services",   gradient: "from-pink-500 to-rose-500",    icon: Heart    },
  MEDICINE:   { label: "Medicines",   tab: "Medicine",   gradient: "from-emerald-400 to-green-600", icon: Pill    },
  EXPENSE:    { label: "Expenses",    tab: "Expenses",   gradient: "from-red-500 to-rose-600",      icon: Receipt  },
};

const PROCEDURE_COLORS = {
  "Sapphire FUE":     "bg-violet-100 text-violet-800",
  "DHI":              "bg-blue-100 text-blue-800",
  "Turkish DHI":      "bg-orange-100 text-orange-800",
  "Beard Transplant": "bg-amber-100 text-amber-800",
  "PRP":              "bg-teal-100 text-teal-800",
  "Alopecia":         "bg-pink-100 text-pink-800",
  "Headwash":         "bg-cyan-100 text-cyan-800",
  "GFC":              "bg-indigo-100 text-indigo-800",
  "Medicine":         "bg-green-100 text-green-800",
  "Canacot":          "bg-lime-100 text-lime-800",
  "Other":            "bg-gray-100 text-gray-700",
};

const METHOD_COLORS = {
  upi:            "bg-purple-500 text-white",
  cash:           "bg-green-500 text-white",
  card:           "bg-sky-500 text-white",
  banking:        "bg-blue-500 text-white",
  bajaj_loan:     "bg-orange-500 text-white",
  fibe_loan:      "bg-amber-500 text-white",
  hdfc_skin_bank_transfer:            "bg-blue-700 text-white",
  hdfc_ryan_medihub_bank_transfer:    "bg-indigo-700 text-white",
  icici_medihub_bank_transfer:        "bg-rose-700 text-white",
  other:          "bg-gray-400 text-white",
};

const PAYMENT_COLORS = {
  Booking:        "bg-blue-100 text-blue-700",
  Pending:        "bg-rose-100 text-rose-700",
  "Full-payment": "bg-green-100 text-green-700",
  Other:          "bg-gray-100 text-gray-600",
};

const BRANCH_COLORS = {
  Delhi:     "bg-violet-100 text-violet-800",
  Mumbai:    "bg-orange-100 text-orange-800",
  Hyderabad: "bg-teal-100 text-teal-800",
  Noida:     "bg-pink-100 text-pink-800",
};

const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) : "—";

function getRange(label, custom) {
  const now = new Date();
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  if (label === "Today")       return { from: sod(now), to: eod(now) };
  if (label === "Yesterday")   { const y = new Date(now); y.setDate(now.getDate() - 1); return { from: sod(y), to: eod(y) }; }
  if (label === "Last 7 Days") { const d = new Date(now); d.setDate(now.getDate() - 6); return { from: sod(d), to: eod(now) }; }
  if (label === "This Month")  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: eod(now) };
  if (label === "Custom")      return {
    from: custom.from ? sod(new Date(custom.from)) : null,
    to:   custom.to   ? eod(new Date(custom.to))   : null,
  };
  return { from: null, to: null };
}

function Bdg({ cls, val }) {
  return val ? <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold ${cls}`}>{val}</span> : <span className="text-gray-300 text-xs">—</span>;
}

function AuditModal({ tx, onClose }) {
  const { createdBy, editors = [] } = tx;

  const timeline = [
    createdBy && {
      type: "created",
      name:   createdBy.name   || "Unknown",
      email:  createdBy.email  || "",
      branch: createdBy.branch || "",
      date:   createdBy.date,
      fields: [],
    },
    ...editors.map((e) => ({
      type:   "edited",
      name:   e.name   || "Unknown",
      email:  e.email  || "",
      branch: e.branch || "",
      date:   e.date,
      fields: e.updatedFields || [],
    })).reverse(),
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-100 rounded-lg">
              <History className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">Audit Trail</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {tx.patient?.personal?.name || tx.patientName || "Transaction"} · {timeline.length} event{timeline.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-gray-500">Procedure</span><p className="font-semibold text-gray-800 mt-0.5">{tx.procedure || "—"}</p></div>
            <div><span className="text-gray-500">Amount</span><p className="font-semibold text-gray-800 mt-0.5">{fmtCurrency(tx.amount)}</p></div>
            <div><span className="text-gray-500">Branch</span><p className="font-semibold text-gray-800 mt-0.5">{tx.branch || "—"}</p></div>
            <div><span className="text-gray-500">Date</span><p className="font-semibold text-gray-800 mt-0.5">{fmtDate(tx.date)}</p></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Clock className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No audit records found</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-5 bottom-5 w-px bg-gray-200" />

              <div className="space-y-5">
                {timeline.map((entry, idx) => (
                  <div key={idx} className="relative pl-10">
                    <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                      entry.type === "created" ? "bg-emerald-500" : "bg-indigo-500"
                    }`} />

                    <div className={`rounded-xl p-3.5 border ${
                      entry.type === "created"
                        ? "bg-emerald-50 border-emerald-100"
                        : "bg-white border-gray-100 shadow-sm"
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {entry.type === "created"
                            ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            : <Pencil className="w-4 h-4 text-indigo-500 shrink-0" />
                          }
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{entry.name}</p>
                            {entry.email && <p className="text-xs text-gray-400">{entry.email}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">{fmtDateTime(entry.date)}</p>
                          {entry.branch && (
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                              BRANCH_COLORS[entry.branch] || "bg-gray-100 text-gray-600"
                            }`}>
                              {entry.branch}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className={`text-xs font-medium mb-2 ${
                        entry.type === "created" ? "text-emerald-700" : "text-indigo-600"
                      }`}>
                        {entry.type === "created" ? "Created transaction" : `Edited ${entry.fields.length} field${entry.fields.length !== 1 ? "s" : ""}`}
                      </p>

                      {entry.fields.length > 0 && (
                        <div className="space-y-1.5 mt-2 pt-2 border-t border-gray-100">
                          {entry.fields.map((f, fi) => (
                            <div key={fi} className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">{f.name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded line-through decoration-red-300">
                                  {f.previousValue || "—"}
                                </span>
                                <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                                <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">
                                  {f.newValue || "—"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-xs text-gray-400 text-center">
            {editors.length} edit{editors.length !== 1 ? "s" : ""} · Created by {createdBy?.name || "Unknown"}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ catKey, total, count }) {
  const cfg = CAT_CFG[catKey];
  const Icon = cfg.icon;
  return (
    <div className={`relative rounded-2xl p-5 bg-linear-to-br ${cfg.gradient} text-white overflow-hidden shadow-md`}>
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_80%_20%,white,transparent_60%)]" />
      <p className="text-sm font-medium opacity-90 mb-1">{cfg.label}</p>
      <p className="text-2xl font-bold mb-3 leading-tight">{fmtCurrency(total)}</p>
      <p className="text-xs opacity-75">{count} transaction{count !== 1 ? "s" : ""}</p>
      <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}

export default function TransactionTable({ config = {} }) {
  const {
    title             = "All Transactions",
    subtitle          = "View and manage all transaction categories",
    apiEndpoint       = "/api/transactions/get-all",
    visibleCategories = ["TRANSPLANT", "SERVICE", "MEDICINE", "EXPENSE"],
    actions           = ["view", "edit"],
    editBasePath      = "",
    viewBasePath      = "",
    createPath        = "",
    showCsvExport     = true,
    defaultPageSize   = 25,
    pageSizeOptions   = [25, 50, 100],
    defaultCostType   = "",
    filters = {
      showMethod:      true,
      showPaymentType: true,
      showBranch:      true,
    },
  } = config;

  const router = useRouter();

  const { data: session } = useSession();
  const userRole = session?.user?.role || "";

  const [allTx, setAllTx]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [auditTx, setAuditTx]         = useState(null);
  const [billTxId, setBillTxId]       = useState(null);
  const [deletingId, setDeletingId]   = useState(null);

  const [activeTab, setActiveTab]     = useState(visibleCategories[0]);
  const [search, setSearch]           = useState("");
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(defaultPageSize);
  const [filterOpen, setFilterOpen]   = useState(false);

  const [dateRange, setDateRange]     = useState("Today");
  const [customDates, setCustom]      = useState({ from: "", to: "" });

  const [fMethod,      setFMethod]      = useState("");
  const [fPaymentType, setFPaymentType] = useState("");
  const [fBranch,      setFBranch]      = useState("");

  const debSearch = useDebounced(search, 300);

  useEffect(() => {
    setLoading(true);
    fetch(apiEndpoint)
      .then((r) => r.json())
      .then((d) => setAllTx(d.transactions || d.data || []))
      .catch(() => setAllTx([]))
      .finally(() => setLoading(false));
  }, [apiEndpoint, refreshKey]);

  const handleDelete = async (tx) => {
    if (!confirm(`Delete this ${tx.transactionCategory?.toLowerCase()} transaction of ₹${tx.amount}? This cannot be undone.`)) return;
    const categoryEndpointMap = {
      TRANSPLANT: "/api/transactions/transplant/delete",
      SERVICE:    "/api/transactions/service/delete",
      MEDICINE:   "/api/transactions/medicine/delete",
      EXPENSE:    "/api/transactions/expense/delete",
    };
    const endpoint = categoryEndpointMap[tx.transactionCategory];
    if (!endpoint) return alert("Unknown transaction category");
    setDeletingId(tx._id);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: tx._id }),
      });
      const data = await res.json();
      if (data.success) {
        setAllTx((prev) => prev.filter((t) => t._id !== tx._id));
      } else {
        alert(data.message || "Failed to delete transaction");
      }
    } catch {
      alert("Network error while deleting transaction");
    } finally {
      setDeletingId(null);
    }
  };

  const dateFiltered = useMemo(() => {
    const { from, to } = getRange(dateRange, customDates);
    return allTx.filter((t) => {
      if (defaultCostType && t.costType !== defaultCostType) return false;
      const d = new Date(t.date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }, [allTx, dateRange, customDates, defaultCostType]);

  const catStats = useMemo(() =>
    Object.fromEntries(
      visibleCategories.map((cat) => {
        const rows = dateFiltered.filter((t) => t.transactionCategory === cat);
        const totalRows = rows.filter((t) => t.isSettlement !== true);
        return [
          cat,
          { count: rows.length, total: totalRows.reduce((s, t) => s + (t.amount || 0), 0) },
        ];
      })
    ),
  [dateFiltered, visibleCategories]);

  const tableRows = useMemo(() => {
    let rows = dateFiltered.filter((t) => t.transactionCategory === activeTab);
    if (fMethod)      rows = rows.filter((t) => (t.method || "").toLowerCase() === fMethod.toLowerCase());
    if (fPaymentType) rows = rows.filter((t) => t.paymentType === fPaymentType);
    if (fBranch)      rows = rows.filter((t) => t.branch === fBranch);
    if (debSearch) {
      const q = debSearch.toLowerCase();
      rows = rows.filter((t) =>
        (t.patient?.personal?.name  || "").toLowerCase().includes(q) ||
        maskPhone(t.patient?.personal?.phone, userRole).toLowerCase().includes(q) ||
        (t.procedure  || "").toLowerCase().includes(q) ||
        (t.paymentId  || "").toLowerCase().includes(q) ||
        (t.branch     || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [dateFiltered, activeTab, fMethod, fPaymentType, fBranch, debSearch]);

  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const paginated  = tableRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [
    activeTab, dateRange, customDates, fMethod, fPaymentType, fBranch, debSearch, pageSize,
  ]);

  const pageNums = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end   = Math.min(totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [page, totalPages]);

  const exportCSV = () => {
    const headers = ["Date","Patient","Phone","Procedure","Payment Type","Amount","Method","Trans ID","Branch","Created By","Total Edits"];
    const rows = tableRows.map((t) => [
      fmtDate(t.date),
      t.patient?.personal?.name  || t.patientName  || "N/A",
      maskPhone(t.patient?.personal?.phone || t.patientPhone, userRole),
      t.procedure   || "",
      t.paymentType || "",
      t.amount      || 0,
      t.method      || "",
      t.paymentId   || "",
      t.branch      || "",
      t.createdBy?.name || "",
      t.editors?.length || 0,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `transactions-${activeTab.toLowerCase()}-${Date.now()}.csv`,
    }).click();
  };

  const activeChips = [
    fMethod      && { key: "m",  label: `Method: ${fMethod}`,        clear: () => setFMethod("") },
    fPaymentType && { key: "pt", label: `Payment: ${fPaymentType}`,  clear: () => setFPaymentType("") },
    fBranch      && { key: "br", label: `Branch: ${fBranch}`,        clear: () => setFBranch("") },
  ].filter(Boolean);

  return (
    <>
      {auditTx && <AuditModal tx={auditTx} onClose={() => setAuditTx(null)} />}

      {billTxId && <BillGenerator transactionId={billTxId} onClose={() => setBillTxId(null)} />}

      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto">

          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            </div>
            <div className="flex gap-2">
              {createPath && (
                <button
                  onClick={() => router.push(createPath)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Transaction
                </button>
              )}
              {showCsvExport && (
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Excel
                </button>
              )}
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loading}
                title="Refresh"
                className="p-2 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {visibleCategories.map((cat) => (
              <StatCard key={cat} catKey={cat} {...catStats[cat]} />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateRange === r
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {r}
              </button>
            ))}
            {dateRange === "Custom" && (
              <>
                <input
                  type="date" value={customDates.from}
                  onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="self-center text-gray-400 text-sm">to</span>
                <input
                  type="date" value={customDates.to}
                  onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))}
                  className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-100 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {visibleCategories.map((cat) => {
                  const cfg = CAT_CFG[cat];
                  const Icon = cfg.icon;
                  const isActive = activeTab === cat;
                  const count = catStats[cat]?.count ?? 0;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveTab(cat)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? `bg-linear-to-r ${cfg.gradient} text-white shadow-sm`
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {cfg.tab}
                      <span className={isActive ? "opacity-80" : "text-gray-400"}>({count})</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search transactions..."
                    className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl w-52 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 bg-gray-50"
                  />
                </div>
                <button
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`relative p-2 rounded-xl border transition-colors ${
                    filterOpen || activeChips.length > 0
                      ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  {activeChips.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center">
                      {activeChips.length}
                    </span>
                  )}
                </button>
                {activeChips.length > 0 && (
                  <button
                    onClick={() => { setFMethod(""); setFPaymentType(""); setFBranch(""); }}
                    className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                    title="Clear filters"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {filterOpen && (
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-end">
                {filters.showMethod && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Method</label>
                    <select value={fMethod} onChange={(e) => setFMethod(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">All Methods</option>
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="banking">Banking</option>
                      <option value="bajaj_loan">Bajaj Loan</option>
                      <option value="fibe_loan">Fibe Loan</option>
                      <option value="hdfc_skin_bank_transfer">HDFC Skin Bank Transfer</option>
                      <option value="hdfc_ryan_medihub_bank_transfer">HDFC Ryan Medihub Bank Transfer</option>
                      <option value="icici_medihub_bank_transfer">ICICI Medihub Bank Transfer</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}
                {filters.showPaymentType && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Type</label>
                    <select value={fPaymentType} onChange={(e) => setFPaymentType(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">All Types</option>
                      <option>Booking</option>
                      <option>Pending</option>
                      <option>Full-payment</option>
                      <option>Other</option>
                    </select>
                  </div>
                )}
                {filters.showBranch && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Branch</label>
                    <select value={fBranch} onChange={(e) => setFBranch(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">All Branches</option>
                      <option>Delhi</option>
                      <option>Mumbai</option>
                      <option>Hyderabad</option>
                      <option>Noida</option>
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Per page</label>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-200">
                    {pageSizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            {activeChips.length > 0 && (
              <div className="px-4 py-2 border-b border-gray-100 flex gap-2 flex-wrap">
                {activeChips.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-medium">
                    {c.label}
                    <button onClick={c.clear}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        {["Date","Patient","Procedure","Payment Type","Amount","Method","Trans ID","Branch","Audit"].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                        {actions.length > 0 && (
                          <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan={actions.length > 0 ? 10 : 9} className="py-16 text-center">
                            <Receipt className="w-12 h-12 mx-auto text-gray-200 mb-3" />
                            <p className="text-sm font-medium text-gray-500">No transactions found</p>
                            <p className="text-xs text-gray-400 mt-1">Try a different date range or clear filters</p>
                          </td>
                        </tr>
                      ) : (
                        paginated.map((tx) => (
                          <tr key={tx._id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="px-5 py-3.5 text-sm text-gray-600 whitespace-nowrap">{fmtDate(tx.date)}</td>

                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-sm text-gray-900 leading-none">{tx.patient?.personal?.name || tx.patientName || "Walk-in Customer"}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{maskPhone(tx.patient?.personal?.phone || tx.patientPhone, userRole)}</div>
                            </td>

                            <td className="px-5 py-3.5">
                              <Bdg cls={PROCEDURE_COLORS[tx.procedure] || "bg-gray-100 text-gray-700"} val={tx.procedure} />
                            </td>

                            <td className="px-5 py-3.5">
                              <Bdg cls={PAYMENT_COLORS[tx.paymentType] || "bg-gray-100 text-gray-600"} val={tx.paymentType} />
                            </td>

                            <td className="px-5 py-3.5">
                              <span className="text-sm font-bold text-gray-900">{fmtCurrency(tx.amount)}</span>
                            </td>

                            <td className="px-5 py-3.5">
                              <Bdg cls={METHOD_COLORS[tx.method] || "bg-gray-400 text-white"} val={(tx.method || "").toUpperCase()} />
                            </td>

                            <td className="px-5 py-3.5">
                              <span className="text-xs text-gray-400 font-mono">{tx.paymentId || "—"}</span>
                            </td>

                            <td className="px-5 py-3.5">
                              <Bdg cls={BRANCH_COLORS[tx.branch] || "bg-gray-100 text-gray-600"} val={tx.branch} />
                            </td>

                            <td className="px-5 py-3.5">
                              <button
                                onClick={() => setAuditTx(tx)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 text-xs font-medium transition-colors group"
                                title="View audit trail"
                              >
                                <User className="w-3 h-3 shrink-0" />
                                <span className="max-w-20 truncate">
                                  {tx.createdBy?.name || "—"}
                                </span>
                                {tx.editors?.length > 0 && (
                                  <span className="px-1 py-0.5 bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 rounded text-[10px] font-bold leading-none">
                                    +{tx.editors.length}
                                  </span>
                                )}
                                <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                              </button>
                            </td>

                            {actions.length > 0 && (
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  {actions.includes("view") && tx.patient?._id && viewBasePath && (
                                    <Link
                                      href={`${viewBasePath}/${tx.patient._id}`}
                                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                                      title="View Patient"
                                    >
                                      <FileText className="w-4 h-4" />
                                    </Link>
                                  )}
                                  {actions.includes("edit") && editBasePath && (
                                    <Link
                                      href={`${editBasePath}/${tx._id}`}
                                      className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors"
                                      title="Edit Transaction"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Link>
                                  )}
                                  {actions.includes("bill") && tx.transactionCategory !== "EXPENSE" && (
                                    <button
                                      onClick={() => setBillTxId(
                                        tx.transactionCategory === "TRANSPLANT" && tx.patient?._id
                                          ? tx.patient._id
                                          : tx._id
                                      )}
                                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                                      title="View Bill"
                                    >
                                      <Receipt className="w-4 h-4" />
                                    </button>
                                  )}
                                  {actions.includes("delete") && (
                                    <button
                                      onClick={() => handleDelete(tx)}
                                      disabled={deletingId === tx._id}
                                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                                      title="Delete Transaction"
                                    >
                                      <Trash2 className={`w-4 h-4 ${deletingId === tx._id ? "animate-spin" : ""}`} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    {tableRows.length === 0
                      ? "No results"
                      : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, tableRows.length)} of ${tableRows.length}`}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex gap-1">
                      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {pageNums.map((pg) => (
                        <button key={pg} onClick={() => setPage(pg)}
                          className={`w-8 h-8 text-sm rounded-lg font-medium transition-colors ${
                            pg === page ? "bg-indigo-600 text-white" : "hover:bg-gray-100 text-gray-600"
                          }`}>
                          {pg}
                        </button>
                      ))}
                      <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                        className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
