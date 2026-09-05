"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import MetricCard from "@/components/MetricCard";
import CollabCaseForm from "@/components/CollabCaseForm";
import { useToast } from "@/components/Toast";
import { ModalShell, RecordCollectionModal, SettleModal } from "@/components/collab/CollabModals";
import { formatCurrency, formatDate } from "@/lib/financeUI";
import {
  Building2,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  Trash2,
  UserRound,
} from "lucide-react";

// Mirrors Transactions.procedure's enum — used to categorize any revenue
// transaction a settlement generates the same way the transplant form does.
const PROCEDURE_OPTIONS = [
  "Sapphire FUE",
  "DHI",
  "Turkish DHI",
  "Beard Transplant",
  "PRP",
  "Alopecia",
  "Headwash",
  "Canacot",
  "GFC",
  "Medicine",
  "Other",
];

const DEFAULT_CASE_FILTERS = {
  search: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};
const CASE_LIMIT = 20;

export default function AdminCollabSettlementPage() {
  const toast = useToast();

  const [balances, setBalances] = useState([]);
  const [totals, setTotals] = useState({ totalReceivable: 0, totalPayable: 0 });
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [clinicSearch, setClinicSearch] = useState("");

  const [expandedClinic, setExpandedClinic] = useState(null);
  const [clinicCases, setClinicCases] = useState([]);
  const [caseTotal, setCaseTotal] = useState(0);
  const [casesLoading, setCasesLoading] = useState(false);
  const [expandedCaseId, setExpandedCaseId] = useState(null);
  const [caseFilters, setCaseFilters] = useState(DEFAULT_CASE_FILTERS);
  const [casePage, setCasePage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collectionModalCase, setCollectionModalCase] = useState(null);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const [settlements, setSettlements] = useState([]);
  const [settlementsLoading, setSettlementsLoading] = useState(false);

  const fetchSettlements = async (clinic) => {
    setSettlementsLoading(true);
    try {
      const res = await fetch(
        `/api/collab-settlement/settlements?clinic=${encodeURIComponent(clinic)}&limit=50`,
      );
      const data = await res.json();
      if (res.ok) setSettlements(data.settlements || []);
      else toast.error(data.error || "Failed to load settlements");
    } catch (error) {
      console.error("Error fetching settlements:", error);
      toast.error("Failed to load settlements");
    } finally {
      setSettlementsLoading(false);
    }
  };

  const deleteCase = async (c) => {
    const ok = window.confirm(
      `Permanently delete this collab case?\n\n` +
        `  ${c.patientName || "Unknown"} · ${c.clinic} · package ${formatCurrency(c.packageAmount)}\n\n` +
        `The revenue transaction, clinic-share expense and the payable/receivable this case ` +
        `created are deleted with it, so none of it stays on the books.\n\n` +
        `This cannot be undone.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/collab-settlement/cases/${c._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || "Failed to delete case");
      toast.success("Collab case deleted");
      refreshAfterChange();
    } catch (error) {
      console.error("Error deleting collab case:", error);
      toast.error("Failed to delete case");
    }
  };

  const deleteSettlement = async (s) => {
    const linkedCount = s.generatedTransactions?.length || 0;
    const ok = window.confirm(
      `Permanently delete this settlement?\n\n` +
        `  ${s.clinic} · ${s.direction === "THEY_PAID" ? "They paid us" : "We paid them"} · ${formatCurrency(s.amount)}\n` +
        `  ${formatDate(s.date)}${s.reference ? ` · ${s.reference}` : ""}\n\n` +
        (linkedCount
          ? `The ${linkedCount} transaction(s) this settlement generated will be deleted with it, so the money stops showing in reports.\n\n`
          : "") +
        `This cannot be undone.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/collab-settlement/settlements/${s._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok)
        return toast.error(data.error || "Failed to delete settlement");
      toast.success("Settlement deleted");
      if (expandedClinic) fetchSettlements(expandedClinic);
      refreshAfterChange();
    } catch (error) {
      console.error("Error deleting settlement:", error);
      toast.error("Failed to delete settlement");
    }
  };

  const fetchBalances = async () => {
    setBalancesLoading(true);
    try {
      const res = await fetch("/api/collab-settlement/balances");
      const data = await res.json();
      if (res.ok) {
        setBalances(data.balances || []);
        setTotals({
          totalReceivable: data.totalReceivable || 0,
          totalPayable: data.totalPayable || 0,
        });
      } else {
        toast.error(data.error || "Failed to load balances");
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
      toast.error("Failed to load balances");
    } finally {
      setBalancesLoading(false);
    }
  };

  const fetchCasesForClinic = async (clinic, filters, page) => {
    setCasesLoading(true);
    try {
      const params = new URLSearchParams({
        clinic,
        page: String(page),
        limit: String(CASE_LIMIT),
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      const res = await fetch(`/api/collab-settlement/cases?${params}`);
      const data = await res.json();
      if (res.ok) {
        setClinicCases(data.cases || []);
        setCaseTotal(data.total || 0);
      } else {
        toast.error(data.error || "Failed to load cases");
      }
    } catch (error) {
      console.error("Error fetching cases:", error);
      toast.error("Failed to load cases");
    } finally {
      setCasesLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, []);

  useEffect(() => {
    if (expandedClinic)
      fetchCasesForClinic(expandedClinic, caseFilters, casePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedClinic, caseFilters, casePage]);

  useEffect(() => {
    if (expandedClinic) fetchSettlements(expandedClinic);
    else setSettlements([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedClinic]);

  const toggleClinic = (clinic) => {
    if (expandedClinic === clinic) {
      setExpandedClinic(null);
      setClinicCases([]);
      return;
    }
    setExpandedClinic(clinic);
    setExpandedCaseId(null);
    setCaseFilters(DEFAULT_CASE_FILTERS);
    setCasePage(1);
  };

  const handleCaseFilterChange = (key, value) => {
    setCasePage(1);
    setCaseFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearCaseFilters = () => {
    setCasePage(1);
    setCaseFilters(DEFAULT_CASE_FILTERS);
  };

  const refreshAfterChange = () => {
    fetchBalances();
    if (expandedClinic)
      fetchCasesForClinic(expandedClinic, caseFilters, casePage);
  };

  const activeBalances = balances.filter(
    (b) => b.netPosition !== 0 || b.caseCount > 0,
  );
  const visibleBalances = clinicSearch
    ? activeBalances.filter((b) =>
        b.clinic.toLowerCase().includes(clinicSearch.toLowerCase()),
      )
    : activeBalances;
  const caseTotalPages = Math.max(1, Math.ceil(caseTotal / CASE_LIMIT));
  const maxAbsBalance = Math.max(
    1,
    ...activeBalances.map((b) => Math.abs(b.netPosition || 0)),
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Collab Clinic Settlement
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Running account with partner clinics — who owes whom, and how
                much
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/collab-settlement/patient"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors shadow-sm"
              >
                <UserRound className="w-4 h-4" />
                Settle by Patient
              </Link>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Collab Case (Admin)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <MetricCard
              title="Total Receivable (clinics owe us)"
              value={formatCurrency(totals.totalReceivable)}
              icon={TrendingUp}
              color="from-emerald-500 to-emerald-600"
            />
            <MetricCard
              title="Total Payable (we owe clinics)"
              value={formatCurrency(totals.totalPayable)}
              icon={TrendingDown}
              color="from-rose-500 to-rose-600"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
            Per-case settlement is painful — amounts flow both directions and
            cancel out. Let cases accumulate through the month, then settle each
            clinic's single net figure once.
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={clinicSearch}
                onChange={(e) => setClinicSearch(e.target.value)}
                placeholder="Search clinic…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm sm:max-w-xs"
              />
            </div>
          </div>

          {/* ================= CLINIC LIST ================= */}
          {/* A single-column register (not a grid) is deliberate: it's what lets each
              clinic's statement open directly beneath that clinic's own row, instead of
              in a block detached at the bottom of the page. */}
          {balancesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            </div>
          ) : activeBalances.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-500 text-sm">
              No collab cases yet.
            </div>
          ) : visibleBalances.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-500 text-sm">
              No clinics match "{clinicSearch}".
            </div>
          ) : (
            <div className="space-y-3">
              {visibleBalances.map((b) => (
                <Fragment key={b.clinic}>
                  <ClinicRow
                    balance={b}
                    maxAbs={maxAbsBalance}
                    expanded={expandedClinic === b.clinic}
                    onToggle={() => toggleClinic(b.clinic)}
                  />

                  {expandedClinic === b.clinic && (
                    <div className="bg-white rounded-xl shadow-sm border border-indigo-200 p-4 sm:p-6 -mt-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">
                          {b.clinic} — Cases
                        </h3>
                        <button
                          onClick={() => setShowSettleModal(true)}
                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          <Wallet className="w-4 h-4" />
                          Settle {b.clinic}
                        </button>
                      </div>

                      {/* Filters — order: search -> status -> date range (no purpose/branch axis; clinic is already selected) */}
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 mb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="relative lg:col-span-2">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={caseFilters.search}
                              onChange={(e) =>
                                handleCaseFilterChange("search", e.target.value)
                              }
                              placeholder="Search patient…"
                              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                          <select
                            value={caseFilters.status}
                            onChange={(e) =>
                              handleCaseFilterChange("status", e.target.value)
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                          >
                            <option value="">All Statuses</option>
                            <option value="OPEN">Open</option>
                            <option value="SETTLED">Settled</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={caseFilters.dateFrom}
                              onChange={(e) =>
                                handleCaseFilterChange("dateFrom", e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                            />
                            <input
                              type="date"
                              value={caseFilters.dateTo}
                              onChange={(e) =>
                                handleCaseFilterChange("dateTo", e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                            />
                          </div>
                        </div>
                        {(caseFilters.search ||
                          caseFilters.status ||
                          caseFilters.dateFrom ||
                          caseFilters.dateTo) && (
                          <button
                            onClick={clearCaseFilters}
                            className="mt-2 text-xs font-medium text-indigo-700 hover:text-indigo-800"
                          >
                            Clear all filters
                          </button>
                        )}
                      </div>

                      {casesLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                        </div>
                      ) : clinicCases.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">
                          No cases match these filters.
                        </p>
                      ) : (
                        <>
                          {/* Mobile: stacked cards below sm breakpoint */}
                          <div className="sm:hidden divide-y divide-gray-100">
                            {clinicCases.map((c) => (
                              <div key={c._id} className="py-3">
                                <button
                                  onClick={() =>
                                    setExpandedCaseId(
                                      expandedCaseId === c._id ? null : c._id,
                                    )
                                  }
                                  className="flex items-center justify-between w-full text-left mb-2"
                                >
                                  <span className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                                    {expandedCaseId === c._id ? (
                                      <ChevronUp className="w-4 h-4 shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 shrink-0" />
                                    )}
                                    {c.patientName || "Unknown"}
                                  </span>
                                </button>
                                {c.paidToClinic > 0 && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2"
                                    title="Patient has paid this amount directly to the partner clinic. It is not reflected on the patient's payment record until the clinic settles — do not chase the patient for it."
                                  >
                                    Patient paid · {formatCurrency(c.paidToClinic)}{" "}
                                    with clinic
                                  </span>
                                )}
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
                                  <span>
                                    Package {formatCurrency(c.patientPackage)}
                                    {c.patientFigureRepeated && " ↺"}
                                  </span>
                                  <span className="text-right">
                                    Clinic Share {formatCurrency(c.clinicShare)}
                                  </span>
                                  <span>
                                    Collected (us) {formatCurrency(c.collectedByUs)}
                                  </span>
                                  <span className="text-right">
                                    Collected (clinic){" "}
                                    {formatCurrency(c.collectedByClinic)}
                                  </span>
                                  <span className="text-emerald-700 font-semibold">
                                    Receivable{" "}
                                    {c.receivableValue == null ? "—" : formatCurrency(c.receivableValue)}
                                  </span>
                                  <span className="text-right text-rose-700 font-semibold">
                                    Payable{" "}
                                    {c.payableValue == null ? "—" : formatCurrency(c.payableValue)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <div>
                                    <span className="text-gray-500">Outstanding </span>
                                    <span className="font-semibold text-amber-700">
                                      {formatCurrency(c.patientOutstanding)}
                                      {c.patientFigureRepeated && " ↺"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Case Net </span>
                                    {c.clinicShareSettledAt ? (
                                      <span
                                        className={`font-bold ${
                                          c.caseNet > 0
                                            ? "text-emerald-700"
                                            : c.caseNet < 0
                                              ? "text-rose-600"
                                              : "text-gray-500"
                                        }`}
                                      >
                                        {formatCurrency(c.caseNet)}
                                      </span>
                                    ) : (
                                      <span className="font-medium text-gray-400 italic">
                                        Pending completion
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 mt-2">
                                  {c.status === "OPEN" && (
                                    <button
                                      onClick={() => setCollectionModalCase(c)}
                                      className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                                    >
                                      Record Collection
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteCase(c)}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                </div>
                                {expandedCaseId === c._id && (
                                  <div className="mt-3">
                                    <CaseHistory collabCase={c} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Desktop/tablet: table */}
                          <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-600">
                                    Patient
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Package
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Clinic Share
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Collected by Us
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Collected by Clinic
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Patient Outstanding
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Case Net
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-emerald-700">
                                    Receivable
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-rose-700">
                                    Payable
                                  </th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {clinicCases.map((c) => (
                                  <Fragment key={c._id}>
                                    <tr className="hover:bg-gray-50/60">
                                      <td className="px-3 py-2">
                                        <button
                                          onClick={() =>
                                            setExpandedCaseId(
                                              expandedCaseId === c._id
                                                ? null
                                                : c._id,
                                            )
                                          }
                                          className="flex items-center gap-1.5 text-left font-medium text-gray-900 hover:text-indigo-600"
                                        >
                                          {expandedCaseId === c._id ? (
                                            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                                          ) : (
                                            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                          )}
                                          <span className="truncate max-w-37.5">
                                            {c.patientName || "Unknown"}
                                          </span>
                                        </button>
                                        {c.paidToClinic > 0 && (
                                          <span
                                            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                            title="Patient has paid this amount directly to the partner clinic. It is not reflected on the patient's payment record until the clinic settles — do not chase the patient for it."
                                          >
                                            Patient paid ·{" "}
                                            {formatCurrency(c.paidToClinic)} with
                                            clinic
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {formatCurrency(c.patientPackage)}
                                        {c.patientFigureRepeated && (
                                          <span
                                            className="ml-1 text-[10px] font-semibold text-gray-400"
                                            title="Patient-level figure — already counted on an earlier case for this patient"
                                          >
                                            ↺
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {formatCurrency(c.clinicShare)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-emerald-700">
                                        {formatCurrency(c.collectedByUs)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-indigo-700">
                                        {formatCurrency(c.collectedByClinic)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-amber-700 tabular-nums">
                                        {formatCurrency(c.patientOutstanding)}
                                        {c.patientFigureRepeated && (
                                          <span
                                            className="ml-1 text-[10px] font-semibold text-gray-400"
                                            title="Patient-level figure — already counted on an earlier case for this patient"
                                          >
                                            ↺
                                          </span>
                                        )}
                                      </td>
                                      <td
                                        className={
                                          c.clinicShareSettledAt
                                            ? `px-3 py-2 text-right font-bold ${
                                                c.caseNet > 0
                                                  ? "text-emerald-700"
                                                  : c.caseNet < 0
                                                    ? "text-rose-600"
                                                    : "text-gray-500"
                                              }`
                                            : "px-3 py-2 text-right font-medium text-gray-400 italic"
                                        }
                                      >
                                        {c.clinicShareSettledAt
                                          ? formatCurrency(c.caseNet)
                                          : "Pending completion"}
                                      </td>
                                      <SettlementValueCells c={c} />
                                      <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {c.status === "OPEN" && (
                                            <button
                                              onClick={() =>
                                                setCollectionModalCase(c)
                                              }
                                              className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                                            >
                                              Record Collection
                                            </button>
                                          )}
                                          <button
                                            onClick={() => deleteCase(c)}
                                            title="Delete case permanently"
                                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 shrink-0"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    {expandedCaseId === c._id && (
                                      <tr>
                                        <td
                                          colSpan={10}
                                          className="px-3 pb-4 bg-gray-50/60"
                                        >
                                          <CaseHistory collabCase={c} />
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}

                      {!casesLoading &&
                        clinicCases.length > 0 &&
                        caseTotalPages > 1 && (
                          <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500">
                              Page {casePage} of {caseTotalPages} · {caseTotal}{" "}
                              total
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  setCasePage((p) => Math.max(1, p - 1))
                                }
                                disabled={casePage <= 1}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium disabled:opacity-40"
                              >
                                Previous
                              </button>
                              <button
                                onClick={() =>
                                  setCasePage((p) =>
                                    Math.min(caseTotalPages, p + 1),
                                  )
                                }
                                disabled={casePage >= caseTotalPages}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium disabled:opacity-40"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}

                      {/* Settlement history — the actual money movements with this clinic, separate
                          from the per-case view above. This is where a mis-entered settlement gets
                          removed; deleting one also removes the transactions it generated. */}
                      <div className="mt-6 pt-5 border-t border-gray-200">
                        <h4 className="text-sm font-bold text-gray-900 mb-3">
                          Settlement History ({settlements.length})
                        </h4>
                        {settlementsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                          </div>
                        ) : settlements.length === 0 ? (
                          <p className="text-sm text-gray-500 py-4 text-center">
                            No settlements recorded with {b.clinic} yet.
                          </p>
                        ) : (
                          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                            {settlements.map((s) => {
                              const linkedCount =
                                s.generatedTransactions?.length || 0;
                              return (
                                <div
                                  key={s._id}
                                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">
                                      <span
                                        className={
                                          s.direction === "THEY_PAID"
                                            ? "text-emerald-700"
                                            : "text-rose-600"
                                        }
                                      >
                                        {s.direction === "THEY_PAID"
                                          ? "They paid us"
                                          : "We paid them"}
                                      </span>{" "}
                                      {formatCurrency(s.amount)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {formatDate(s.date)} ·{" "}
                                      {(s.mode || "—")
                                        .replace(/_/g, " ")
                                        .toUpperCase()}
                                      {s.reference ? ` · ${s.reference}` : ""}
                                      {linkedCount > 0 && ` · ${linkedCount} txn`}
                                    </p>
                                    {s.remarks && (
                                      <p className="text-xs text-gray-400 italic mt-0.5">
                                        {s.remarks}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => deleteSettlement(s)}
                                    title="Delete settlement permanently"
                                    className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </main>

      {showCreateModal && (
        <NewCollabCaseModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refreshAfterChange();
          }}
          toast={toast}
        />
      )}

      {collectionModalCase && (
        <RecordCollectionModal
          collabCase={collectionModalCase}
          onClose={() => setCollectionModalCase(null)}
          onSuccess={() => {
            setCollectionModalCase(null);
            refreshAfterChange();
          }}
          toast={toast}
        />
      )}

      {showSettleModal && expandedClinic && (
        <SettleModal
          clinic={expandedClinic}
          balance={balances.find((b) => b.clinic === expandedClinic)}
          openCases={clinicCases.filter((c) => c.status === "OPEN")}
          onClose={() => setShowSettleModal(false)}
          onSuccess={() => {
            setShowSettleModal(false);
            refreshAfterChange();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ========== BALANCE METER (quick visual scan of who owes the most) ==========
function BalanceMeter({ value, maxAbs }) {
  const pct = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs, 1) : 0;
  const isReceivable = value > 0;
  const isPayable = value < 0;
  return (
    <div className="relative h-2 w-full max-w-40 rounded-full bg-gray-100 overflow-hidden">
      <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
      {isReceivable && (
        <div
          className="absolute inset-y-0 left-1/2 rounded-r-full bg-emerald-500"
          style={{ width: `${pct * 50}%` }}
        />
      )}
      {isPayable && (
        <div
          className="absolute inset-y-0 right-1/2 rounded-l-full bg-rose-500"
          style={{ width: `${pct * 50}%` }}
        />
      )}
    </div>
  );
}

// ========== PAYABLE / RECEIVABLE VALUE CELLS ==========
// Live pending on the documents this case crystallised into — the same figures the clinic
// totals at the top of the page are built from. A case that hasn't crystallised yet has no
// document, so it shows "—" rather than a projection that wouldn't tie to those totals.
function SettlementValueCells({ c }) {
  const cell = (value, total, status, tone) => {
    if (value == null) {
      return (
        <td className="px-3 py-2 text-right text-gray-300" title="Not crystallised yet">
          —
        </td>
      );
    }
    const cleared = !(value > 0);
    return (
      <td className={`px-3 py-2 text-right tabular-nums ${cleared ? "text-gray-400" : tone}`}>
        <span className={cleared ? "" : "font-semibold"}>{formatCurrency(value)}</span>
        {cleared && total > 0 && (
          <span className="block text-[10px] text-gray-400">
            {status === "Paid" || status === "Received" ? "settled" : "nil"}
          </span>
        )}
      </td>
    );
  };

  return (
    <>
      {cell(c.receivableValue, c.receivableTotal, c.receivableStatus, "text-emerald-700")}
      {cell(c.payableValue, c.payableTotal, c.payableStatus, "text-rose-700")}
    </>
  );
}

// ========== CLINIC ROW ==========
function ClinicRow({ balance, maxAbs, expanded, onToggle }) {
  const {
    clinic,
    netPosition,
    openCaseCount,
    caseCount,
    outstandingReceivable = 0,
    outstandingPayable = 0,
    receivableCount = 0,
    payableCount = 0,
  } = balance;
  const isReceivable = netPosition > 0;
  const isPayable = netPosition < 0;

  return (
    <button
      onClick={onToggle}
      className={`w-full text-left bg-white rounded-xl shadow-sm border p-4 sm:p-5 transition-all hover:shadow-md flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${
        expanded
          ? "border-indigo-400 ring-2 ring-indigo-100"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 lg:w-56 lg:shrink-0">
        <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{clinic}</p>
          <p className="text-xs text-gray-500">
            {openCaseCount} open · {caseCount} total case
            {caseCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Both sides of the running account against this location, not just the net —
          a clinic can owe us and be owed by us at the same time, and netting hides that. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:flex lg:items-center">
        <div className="lg:text-right lg:w-36">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Receivable
          </p>
          <p className="text-sm font-bold text-emerald-600 tabular-nums">
            {formatCurrency(outstandingReceivable)}
          </p>
          <p className="text-[11px] text-gray-400">
            {receivableCount} doc{receivableCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="lg:text-right lg:w-36">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Payable
          </p>
          <p className="text-sm font-bold text-rose-600 tabular-nums">
            {formatCurrency(outstandingPayable)}
          </p>
          <p className="text-[11px] text-gray-400">
            {payableCount} doc{payableCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden xl:block">
          <BalanceMeter value={netPosition} maxAbs={maxAbs} />
        </div>
        <p
          className={`text-sm font-bold shrink-0 ${
            isReceivable
              ? "text-emerald-600"
              : isPayable
                ? "text-rose-600"
                : "text-gray-500"
          }`}
        >
          {isReceivable && `Net: clinic owes us ${formatCurrency(netPosition)}`}
          {isPayable &&
            `Net: we owe clinic ${formatCurrency(Math.abs(netPosition))}`}
          {!isReceivable && !isPayable && "Square"}
        </p>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </div>
    </button>
  );
}

// ========== PATIENT TRANSACTIONS (every entry booked against this patient) ==========
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

  const total = rows.reduce(
    (s, t) => s + (t.costType === "Revenue" ? t.amount || 0 : -(t.amount || 0)),
    0,
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Patient Transactions ({rows.length})
        </h4>
        {rows.length > 0 && (
          <span className="text-xs font-semibold text-gray-700 tabular-nums">
            Net {formatCurrency(total)}
          </span>
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
        <p className="text-sm text-gray-400">
          No transactions booked against {patientName || "this patient"} yet.
        </p>
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
                    <td className="px-1 py-1.5">
                      {t.procedure || t.expenseType || t.expense || "—"}
                    </td>
                    <td className="px-1 py-1.5">{(t.method || "—").replace(/_/g, " ")}</td>
                    <td className="px-1 py-1.5">{t.furtherMode || "—"}</td>
                    <td className="px-1 py-1.5">{t.branch || "—"}</td>
                    <td
                      className={`px-1 py-1.5 text-right font-semibold tabular-nums ${
                        isRevenue ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
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

// ========== CASE HISTORY (patient transactions + clinicCollections + log) ==========
function CaseHistory({ collabCase }) {
  const collections = collabCase.clinicCollections || [];
  const log = collabCase.log || [];

  return (
    <div className="space-y-4 pt-1">
    <PatientTransactions
      patientId={collabCase.patient}
      patientName={collabCase.patientName}
    />
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
              <li
                key={i}
                className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {formatCurrency(c.amount)}
                    {c.discount > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-amber-600">
                        + {formatCurrency(c.discount)} discount
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(c.date)} ·{" "}
                    {(c.mode || "—").replace(/_/g, " ").toUpperCase()}
                    {c.reference ? ` · ${c.reference}` : ""}
                    {c.furtherMode ? ` · ${c.furtherMode}` : ""}
                  </p>
                  {c.note && (
                    <p className="text-xs text-gray-400 italic mt-0.5">
                      {c.note}
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-500 text-right shrink-0 ml-3">
                  {c.recordedBy?.name || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Activity Log ({log.length})
        </h4>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...log].reverse().map((entry, i) => (
              <li
                key={i}
                className="text-sm border-b border-gray-50 pb-2 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {entry.action}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDate(entry.performedAt)}
                  </span>
                </div>
                {entry.previousValue && (
                  <p className="text-xs text-gray-500">
                    {entry.previousValue} → {entry.newValue}
                  </p>
                )}
                {entry.note && (
                  <p className="text-xs text-gray-400 italic mt-0.5">
                    {entry.note}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  by {entry.performedBy?.name || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    </div>
  );
}

// ========== NEW COLLAB CASE MODAL ==========
// Admin EMERGENCY entry point. Deliberately renders the same shared CollabCaseForm the
// collab panel uses — collab case entry logic must exist in exactly one place, so the
// admin path cannot drift from the normal path. The clinic is an explicit
// COLLAB_BRANCHES dropdown inside the form (no default), never a main branch.
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

