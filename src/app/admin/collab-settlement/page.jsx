"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import CollabCaseForm from "@/components/CollabCaseForm";
import { useToast } from "@/components/Toast";
import { ModalShell, RecordCollectionModal, SettleModal } from "@/components/collab/CollabModals";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import { COLLAB_BRANCHES } from "@/lib/branches";
import {
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  Trash2,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react";

const TABS = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "payable", label: "Standing Payables", icon: TrendingDown },
  { key: "receivable", label: "Standing Receivables", icon: TrendingUp },
  { key: "settled", label: "Settled", icon: CheckCircle2 },
];

function caseCategories(c) {
  const standingPayable = (c.payableValue || 0) > 0;
  const standingReceivable = (c.receivableValue || 0) > 0;
  const settledPayable = (c.payableTotal || 0) > 0 && !standingPayable;
  const settledReceivable = (c.receivableTotal || 0) > 0 && !standingReceivable;
  return {
    pending: standingPayable || standingReceivable || (c.status === "OPEN" && !settledPayable && !settledReceivable),
    payable: standingPayable,
    receivable: standingReceivable,
    settled: c.status === "SETTLED" || settledPayable || settledReceivable,
  };
}

const PAGE_SIZE = 20;

export default function AdminCollabSettlementPage() {
  const toast = useToast();

  const [cases, setCases] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [clinicFilter, setClinicFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [collectionCase, setCollectionCase] = useState(null);
  const [settleClinic, setSettleClinic] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cr, br] = await Promise.all([
        fetch("/api/collab-settlement/cases?limit=500"),
        fetch("/api/collab-settlement/balances"),
      ]);
      const [cd, bd] = await Promise.all([cr.json(), br.json()]);
      if (cr.ok) setCases(cd.cases || []);
      if (br.ok) setBalances(bd.balances || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteCase = async (c) => {
    if (
      !window.confirm(
        `Delete collab case for ${c.patientName || "Unknown"} · ${c.clinic} · ${formatCurrency(c.packageAmount)}?\n\nThe revenue transaction, clinic-share expense and the payable/receivable are deleted with it.\n\nThis cannot be undone.`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/collab-settlement/cases/${c._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || "Failed to delete");
      toast.success("Case deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete case");
    }
  };

  const filtered = useMemo(() => {
    let list = cases.filter((c) => c.status !== "CANCELLED");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.patientName || "").toLowerCase().includes(q) ||
          (c.patientPhone || "").includes(q) ||
          (c.clinic || "").toLowerCase().includes(q),
      );
    }
    if (clinicFilter) list = list.filter((c) => c.clinic === clinicFilter);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter((c) => new Date(c.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((c) => new Date(c.createdAt) <= to);
    }
    const tabs = { pending: [], payable: [], receivable: [], settled: [] };
    for (const c of list) {
      const cat = caseCategories(c);
      for (const key of Object.keys(tabs)) if (cat[key]) tabs[key].push(c);
    }
    return tabs;
  }, [cases, search, clinicFilter, dateFrom, dateTo]);

  const stats = useMemo(
    () => ({
      pending: {
        count: filtered.pending.length,
        total: filtered.pending.reduce((s, c) => s + (c.payableValue || 0) + (c.receivableValue || 0), 0),
      },
      payable: {
        count: filtered.payable.length,
        total: filtered.payable.reduce((s, c) => s + (c.payableValue || 0), 0),
      },
      receivable: {
        count: filtered.receivable.length,
        total: filtered.receivable.reduce((s, c) => s + (c.receivableValue || 0), 0),
      },
      settled: { count: filtered.settled.length, total: 0 },
    }),
    [filtered],
  );

  const activeCases = filtered[activeTab] || [];
  const totalPages = Math.max(1, Math.ceil(activeCases.length / PAGE_SIZE));
  const paginated = activeCases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = search || clinicFilter || dateFrom || dateTo;

  const settleBalance = settleClinic ? balances.find((b) => b.clinic === settleClinic) : null;
  const settleOpenCases = settleClinic ? cases.filter((c) => c.clinic === settleClinic && c.status === "OPEN") : [];

  const switchTab = (key) => {
    setActiveTab(key);
    setPage(1);
    setExpandedId(null);
  };

  const clearFilters = () => {
    setSearch("");
    setClinicFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Collab Settlement</h1>
              <p className="text-sm text-gray-500 mt-1">Patient-wise settlement overview across all partner clinics</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Collab Case
            </button>
          </div>

          {/* KPI Strip */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-5">
            <div className="flex flex-wrap divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              <KPIItem label="Total Pending" value={formatCurrency(stats.pending.total)} count={stats.pending.count} icon={Clock} color="bg-amber-50 text-amber-600" />
              <KPIItem label="Standing Payables" value={formatCurrency(stats.payable.total)} count={stats.payable.count} icon={TrendingDown} color="bg-rose-50 text-rose-600" />
              <KPIItem label="Standing Receivables" value={formatCurrency(stats.receivable.total)} count={stats.receivable.count} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
              <KPIItem label="Settled" value={`${stats.settled.count} cases`} count={stats.settled.count} icon={CheckCircle2} color="bg-gray-100 text-gray-600" />
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto mb-5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => switchTab(tab.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                    active ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-white/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className={`text-[11px] ${active ? "text-gray-500" : "text-gray-400"}`}>
                    {filtered[tab.key]?.length || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-5">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1 lg:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search patient name, phone or clinic…"
                  className="w-full h-10 pl-9 pr-9 rounded-lg border border-gray-200 bg-gray-50/60 text-sm outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <select
                value={clinicFilter}
                onChange={(e) => {
                  setClinicFilter(e.target.value);
                  setPage(1);
                }}
                className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm min-w-40"
              >
                <option value="">All Clinics</option>
                {COLLAB_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm"
                />
              </div>
              {hasFilters && (
                <button onClick={clearFilters} className="h-10 px-3 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : activeCases.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-500 text-sm">
              No cases in this section{hasFilters ? " matching your filters" : ""}.
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {paginated.map((c) => (
                  <MobileCard
                    key={c._id}
                    c={c}
                    activeTab={activeTab}
                    expanded={expandedId === c._id}
                    onToggle={() => setExpandedId(expandedId === c._id ? null : c._id)}
                    onSettle={() => setSettleClinic(c.clinic)}
                    onCollection={() => setCollectionCase(c)}
                    onDelete={() => deleteCase(c)}
                  />
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Patient</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600">Clinic</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600">Procedure</th>
                        <th className="text-right px-3 py-3 font-semibold text-gray-600">Package</th>
                        <th className="text-right px-3 py-3 font-semibold text-gray-600">Clinic Share</th>
                        <th className="text-right px-3 py-3 font-semibold text-emerald-600">Paid (Us)</th>
                        <th className="text-right px-3 py-3 font-semibold text-indigo-600">Paid (Clinic)</th>
                        <th className="text-right px-3 py-3 font-semibold text-amber-700">Outstanding</th>
                        <th className="text-right px-3 py-3 font-semibold text-emerald-700">Receivable</th>
                        <th className="text-right px-3 py-3 font-semibold text-rose-700">Payable</th>
                        <th className="text-right px-3 py-3 font-semibold text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginated.map((c) => (
                        <Fragment key={c._id}>
                          <tr className="hover:bg-gray-50/60">
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setExpandedId(expandedId === c._id ? null : c._id)}
                                className="flex items-center gap-1.5 text-left font-medium text-gray-900 hover:text-indigo-600"
                              >
                                {expandedId === c._id ? (
                                  <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate max-w-40">{c.patientName || "Unknown"}</span>
                              </button>
                              {c.patientPhone && <p className="text-xs text-gray-400 ml-5">{c.patientPhone}</p>}
                            </td>
                            <td className="px-3 py-3 text-gray-700">{c.clinic}</td>
                            <td className="px-3 py-3 text-gray-700">{c.procedure}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.packageAmount)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.clinicShare)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{formatCurrency(c.collectedByUs)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-indigo-600">{formatCurrency(c.collectedByClinic)}</td>
                            <td className="px-3 py-3 text-right tabular-nums font-semibold text-amber-700">{formatCurrency(c.patientOutstanding)}</td>
                            <SettlementCell value={c.receivableValue} total={c.receivableTotal} tone="text-emerald-700" />
                            <SettlementCell value={c.payableValue} total={c.payableTotal} tone="text-rose-700" />
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {activeTab !== "settled" && ((c.payableValue || 0) > 0 || (c.receivableValue || 0) > 0) && (
                                  <button
                                    onClick={() => setSettleClinic(c.clinic)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition"
                                  >
                                    <Wallet className="w-3.5 h-3.5" /> Settle
                                  </button>
                                )}
                                {c.status === "OPEN" && (
                                  <button
                                    onClick={() => setCollectionCase(c)}
                                    className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                                  >
                                    Collection
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteCase(c)}
                                  title="Delete case"
                                  className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedId === c._id && (
                            <tr>
                              <td colSpan={11} className="px-4 pb-4 bg-gray-50/60">
                                <CaseHistory collabCase={c} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-gray-500">
                    Page {page} of {totalPages} · {activeCases.length} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      {showCreate && (
        <NewCollabCaseModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            fetchData();
          }}
          toast={toast}
        />
      )}
      {collectionCase && (
        <RecordCollectionModal
          collabCase={collectionCase}
          onClose={() => setCollectionCase(null)}
          onSuccess={() => {
            setCollectionCase(null);
            fetchData();
          }}
          toast={toast}
        />
      )}
      {settleClinic && (
        <SettleModal
          clinic={settleClinic}
          balance={settleBalance || { netPosition: 0 }}
          openCases={settleOpenCases}
          onClose={() => setSettleClinic(null)}
          onSuccess={() => {
            setSettleClinic(null);
            fetchData();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ---- KPI Item ---- */
function KPIItem({ label, value, count, icon: Icon, color }) {
  return (
    <div className="flex-1 min-w-42.5 px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-gray-950">{value}</p>
          <p className="mt-1 text-xs text-gray-400">{count} cases</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

/* ---- Settlement value cell (receivable or payable) ---- */
function SettlementCell({ value, total, tone }) {
  if (value == null)
    return (
      <td className="px-3 py-3 text-right text-gray-300" title="Not crystallised yet">
        —
      </td>
    );
  const cleared = !(value > 0);
  return (
    <td className={`px-3 py-3 text-right tabular-nums ${cleared ? "text-gray-400" : tone}`}>
      <span className={cleared ? "" : "font-semibold"}>{formatCurrency(value)}</span>
      {cleared && (total || 0) > 0 && (
        <span className="block text-[10px] text-gray-400">settled</span>
      )}
    </td>
  );
}

/* ---- Mobile card ---- */
function MobileCard({ c, activeTab, expanded, onToggle, onSettle, onCollection, onDelete }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <button onClick={onToggle} className="flex items-center justify-between w-full text-left mb-2">
        <span className="font-medium text-gray-900 truncate flex items-center gap-1.5">
          {expanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          {c.patientName || "Unknown"}
        </span>
        <span className="text-xs text-gray-500 shrink-0 ml-2">{c.clinic}</span>
      </button>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
        <span>Procedure: {c.procedure}</span>
        <span className="text-right">Package {formatCurrency(c.packageAmount)}</span>
        <span>Clinic Share {formatCurrency(c.clinicShare)}</span>
        <span className="text-right">{formatDate(c.createdAt)}</span>
        <span className="text-emerald-600">Paid (Us) {formatCurrency(c.collectedByUs)}</span>
        <span className="text-right text-indigo-600">Paid (Clinic) {formatCurrency(c.collectedByClinic)}</span>
        <span className="text-amber-700 font-semibold">Outstanding {formatCurrency(c.patientOutstanding)}</span>
        <span />
        <span className="text-emerald-700 font-semibold">
          Receivable {c.receivableValue != null ? formatCurrency(c.receivableValue) : "—"}
        </span>
        <span className="text-right text-rose-700 font-semibold">
          Payable {c.payableValue != null ? formatCurrency(c.payableValue) : "—"}
        </span>
      </div>

      <div className="flex justify-end gap-2">
        {activeTab !== "settled" && ((c.payableValue || 0) > 0 || (c.receivableValue || 0) > 0) && (
          <button onClick={onSettle} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100">
            <Wallet className="w-3.5 h-3.5" /> Settle
          </button>
        )}
        {c.status === "OPEN" && (
          <button onClick={onCollection} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100">
            Collection
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <CaseHistory collabCase={c} />
        </div>
      )}
    </div>
  );
}

/* ---- Patient Transactions (every entry booked against this patient) ---- */
function PatientTransactions({ patientId, patientName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/transactions/get-all?patient=${encodeURIComponent(patientId)}&limit=200&sortKey=date&sortDir=desc`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success !== false) setRows(data.transactions || []);
        else setError(data.error || data.message || "Failed to load transactions");
      } catch {
        if (!cancelled) setError("Failed to load transactions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const total = rows.reduce((s, t) => s + (t.costType === "Revenue" ? t.amount || 0 : -(t.amount || 0)), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Patient Transactions ({rows.length})</h4>
        {rows.length > 0 && (
          <span className="text-xs font-semibold text-gray-700 tabular-nums">Net {formatCurrency(total)}</span>
        )}
      </div>
      {!patientId ? (
        <p className="text-sm text-gray-400">This case has no linked patient record.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading transactions…
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">No transactions booked against {patientName || "this patient"} yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead className="text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left px-1 py-1.5 font-semibold">Date</th>
                <th className="text-left px-1 py-1.5 font-semibold">Category</th>
                <th className="text-left px-1 py-1.5 font-semibold">Procedure / Head</th>
                <th className="text-left px-1 py-1.5 font-semibold">Method</th>
                <th className="text-left px-1 py-1.5 font-semibold">Account</th>
                <th className="text-left px-1 py-1.5 font-semibold">Branch</th>
                <th className="text-right px-1 py-1.5 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((t) => {
                const isRevenue = t.costType === "Revenue";
                return (
                  <tr key={t._id} className="hover:bg-gray-50/60">
                    <td className="px-1 py-1.5 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="px-1 py-1.5">{t.transactionCategory || "—"}</td>
                    <td className="px-1 py-1.5">{t.procedure || t.expenseType || t.expense || "—"}</td>
                    <td className="px-1 py-1.5">{(t.method || "—").replace(/_/g, " ")}</td>
                    <td className="px-1 py-1.5">{t.furtherMode || "—"}</td>
                    <td className="px-1 py-1.5">{t.branch || "—"}</td>
                    <td className={`px-1 py-1.5 text-right font-semibold tabular-nums ${isRevenue ? "text-emerald-700" : "text-rose-600"}`}>
                      {isRevenue ? "" : "−"}
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---- Case History (patient transactions + clinic collections + log) ---- */
function CaseHistory({ collabCase }) {
  const collections = collabCase.clinicCollections || [];
  const log = collabCase.log || [];

  return (
    <div className="space-y-4 pt-1">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase">Collected by Us</p>
          <p className="font-bold text-emerald-700 tabular-nums">{formatCurrency(collabCase.collectedByUs)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase">Collected by Clinic</p>
          <p className="font-bold text-indigo-700 tabular-nums">{formatCurrency(collabCase.collectedByClinic)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase">Patient Outstanding</p>
          <p className="font-bold text-amber-700 tabular-nums">{formatCurrency(collabCase.patientOutstanding)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase">Case Net</p>
          <p
            className={`font-bold tabular-nums ${
              collabCase.clinicShareSettledAt
                ? collabCase.caseNet > 0
                  ? "text-emerald-700"
                  : collabCase.caseNet < 0
                    ? "text-rose-600"
                    : "text-gray-500"
                : "text-gray-400 italic"
            }`}
          >
            {collabCase.clinicShareSettledAt ? formatCurrency(collabCase.caseNet) : "Pending"}
          </p>
        </div>
      </div>

      <PatientTransactions patientId={collabCase.patient} patientName={collabCase.patientName} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Clinic Collections ({collections.length})
          </h4>
          {collections.length === 0 ? (
            <p className="text-sm text-gray-400">No collections recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {[...collections].reverse().map((c, i) => (
                <li key={i} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatCurrency(c.amount)}
                      {c.discount > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-amber-600">+ {formatCurrency(c.discount)} discount</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(c.date)} · {(c.mode || "—").replace(/_/g, " ").toUpperCase()}
                      {c.reference ? ` · ${c.reference}` : ""}
                      {c.furtherMode ? ` · ${c.furtherMode}` : ""}
                    </p>
                    {c.note && <p className="text-xs text-gray-400 italic mt-0.5">{c.note}</p>}
                  </div>
                  <p className="text-xs text-gray-500 text-right shrink-0 ml-3">{c.recordedBy?.name || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity Log ({log.length})</h4>
          {log.length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {[...log].reverse().map((entry, i) => (
                <li key={i} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{entry.action}</span>
                    <span className="text-xs text-gray-500">{formatDate(entry.performedAt)}</span>
                  </div>
                  {entry.previousValue && (
                    <p className="text-xs text-gray-500">
                      {entry.previousValue} → {entry.newValue}
                    </p>
                  )}
                  {entry.note && <p className="text-xs text-gray-400 italic mt-0.5">{entry.note}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">by {entry.performedBy?.name || "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- New Collab Case Modal ---- */
function NewCollabCaseModal({ onClose, onSuccess, toast }) {
  return (
    <ModalShell
      icon={Plus}
      iconBg="bg-indigo-100"
      iconFg="text-indigo-600"
      title="New Collab Case"
      subtitle="Admin case creation"
      onClose={onClose}
      maxWidth="max-w-3xl"
      notice={{
        title: "Admin / Emergency Entry",
        body: "Normally, collab cases should be created from the collab panel. Use this form only when a manual entry is required.",
      }}
    >
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-6">
            <CollabCaseForm
              onCancel={onClose}
              submitLabel="Create Collab Case"
              onSuccess={(data) => {
                const derived =
                  data.derived === "PAYABLE"
                    ? `Payable of ₹${Number(data.derivedAmount).toLocaleString("en-IN")} created`
                    : data.derived === "RECEIVABLE"
                      ? `Receivable of ₹${Number(data.derivedAmount).toLocaleString("en-IN")} created`
                      : "no payable or receivable needed";
                toast.success(`Collab case created — ${derived}`);
                onSuccess();
              }}
            />
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
