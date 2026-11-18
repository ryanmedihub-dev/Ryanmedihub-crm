"use client";

import { useState, useMemo } from "react";
import { PAYABLE_PURPOSES, payablePurposeLabel } from "@/constants/payablePurposes";
import {
  Filter,
  Search,
  Calendar,
  Users,
  IndianRupee,
  Star,
  X,
  RefreshCw,
  ChevronDown,
  Package,
  HeartPulse,
  FileBarChart,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import {
  BRANCHES, DATE_PRESETS, TECHNIQUES, PROCEDURES, PAYMENT_TYPES,
  PATIENT_STATUSES, REPORTS, CATEGORIES,
} from "./reportsConfig";
import { buildDateRange, downloadReport } from "./reportExport";
import ReportCard from "./ReportCard";
import { buttonClass, inputClass } from "@/components/ui";
import Toast from "./Toast";

export default function AdminReportsPage() {
  const [loadingId, setLoadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_favoriteReports") || "[]"); }
    catch { return []; }
  });

  const [datePreset, setDatePreset] = useState("last30");
  const [customDates, setCustomDates] = useState({ from: "", to: "" });
  const [pendingCustom, setPendingCustom] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState({
    branch: "All",
    status: "",
    technique: "",
    staff: "",
    procedure: "",
    paymentType: "",
    payableType: "",
  });

  const showToast = (title, message, type = "success") => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const toggleFavorite = (id) => {
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem("admin_favoriteReports", JSON.stringify(next)); } catch {}
  };

  const clearFilters = () => {
    setDatePreset("last30");
    setCustomDates({ from: "", to: "" });
    setPendingCustom({ from: "", to: "" });
    setFilters({ branch: "All", status: "", technique: "", staff: "", procedure: "", paymentType: "", payableType: "" });
    setSearchTerm("");
  };

  const applyCustomDates = () => {
    if (!pendingCustom.from) return;
    setCustomDates(pendingCustom);
    setDatePreset("custom");
  };

  const visibleReports = useMemo(() => {
    let list = REPORTS;
    if (activeCategory !== "All") list = list.filter((r) => r.category === activeCategory);
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.description.toLowerCase().includes(s) ||
          r.category.toLowerCase().includes(s)
      );
    }
    return [...list].sort((a, b) => {
      const af = favorites.includes(a.id);
      const bf = favorites.includes(b.id);
      if (af && !bf) return -1;
      if (!af && bf) return 1;
      return 0;
    });
  }, [activeCategory, searchTerm, favorites]);

  const activeFilterCount = [
    filters.branch !== "All" && filters.branch,
    filters.status,
    filters.technique,
    filters.procedure,
    filters.paymentType,
    filters.payableType,
    datePreset !== "last30" && datePreset !== "allTime" && datePreset,
  ].filter(Boolean).length;

  const handleDownload = async (report) => {
    setLoadingId(report.id);
    try {
      const result = await downloadReport(report, { datePreset, customDates, filters });

      if (result.empty) {
        showToast("No Data Found", "Try adjusting the date range or filters.", "error");
        return;
      }

      showToast("Report Downloaded!", `${result.rowCount} records saved as ${result.fileName}`);
    } catch (err) {
      console.error(err);
      showToast("Download Failed", err.message, "error");
    } finally {
      setLoadingId(null);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts = {};
    CATEGORIES.forEach((cat) => {
      counts[cat] = cat === "All" ? REPORTS.length : REPORTS.filter((r) => r.category === cat).length;
    });
    return counts;
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50">

      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-semibold tracking-tight text-gray-900">Reports</h1>
                </div>
                <p className="text-sm text-gray-500">
                  {REPORTS.length} Excel exports across patients, staff, finance, inventory and audit logs
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" aria-hidden />
                  {favorites.length} favorited
                </span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className={buttonClass("ghost", "sm")}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center h-5 px-1.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                  className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <span>{showFilters ? "Fewer" : "More"} filters</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)] gap-4 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Date Range
                    </label>
                    <div role="group" aria-label="Date range" className="inline-flex flex-wrap p-0.5 rounded-lg border border-gray-200 bg-gray-50">
                      {DATE_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setDatePreset(p.value)}
                          aria-pressed={datePreset === p.value}
                          className={`h-8 px-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors duration-150 ${
                            datePreset === p.value
                              ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setDatePreset("custom")}
                        aria-pressed={datePreset === "custom"}
                        className={`h-8 px-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors duration-150 ${
                          datePreset === "custom"
                            ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200"
                            : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rp-branch" className="block text-xs font-medium text-gray-600 mb-1.5">
                      Branch
                    </label>
                    <select
                      id="rp-branch"
                      value={filters.branch}
                      onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}
                      className={inputClass(false, "pr-8")}
                    >
                      {BRANCHES.map((b) => (
                        <option key={b} value={b}>{b === "All" ? "All branches" : b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rp-search" className="block text-xs font-medium text-gray-600 mb-1.5">
                      Search
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="rp-search"
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Report name or category…"
                        className={inputClass(false, "pl-9 pr-8")}
                      />
                      {searchTerm && (
                        <button aria-label="Clear search"
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {datePreset === "custom" && (
                  <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">From</label>
                      <input
                        type="date"
                        value={pendingCustom.from}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, from: e.target.value }))}
                        className={inputClass(false, "w-auto")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
                      <input
                        type="date"
                        value={pendingCustom.to}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, to: e.target.value }))}
                        min={pendingCustom.from}
                        className={inputClass(false, "w-auto")}
                      />
                    </div>
                    <button
                      onClick={applyCustomDates}
                      disabled={!pendingCustom.from}
                      className={buttonClass("primary")}
                    >
                      Apply
                    </button>
                    {customDates.from && (
                      <span className="text-xs text-gray-600 font-medium tabular-nums">
                        Active: {customDates.from} → {customDates.to || customDates.from}
                      </span>
                    )}
                  </div>
                )}

                {showFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Patient Status
                      </label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Statuses</option>
                        {PATIENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Technique
                      </label>
                      <select
                        value={filters.technique}
                        onChange={(e) => setFilters((f) => ({ ...f, technique: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Techniques</option>
                        {TECHNIQUES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Procedure
                      </label>
                      <select
                        value={filters.procedure}
                        onChange={(e) => setFilters((f) => ({ ...f, procedure: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Procedures</option>
                        {PROCEDURES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Payment Type
                      </label>
                      <select
                        value={filters.paymentType}
                        onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Payment Types</option>
                        {PAYMENT_TYPES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Payable Type
                      </label>
                      <select
                        value={filters.payableType}
                        onChange={(e) => setFilters((f) => ({ ...f, payableType: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Payable Types</option>
                        {PAYABLE_PURPOSES.map((p) => (
                          <option key={p} value={p}>{payablePurposeLabel(p)}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-400">
                        Applies to the Payables Report — pick Rent for just the rent ledger.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div role="tablist" aria-label="Report category" className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-gray-200">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  role="tab"
                  aria-selected={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`-mb-px flex items-center gap-2 h-10 px-3 border-b-2 text-sm whitespace-nowrap transition-colors duration-150 ${
                    activeCategory === cat
                      ? "border-indigo-600 text-gray-900 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  {cat}
                  <span
                    className={`text-xs tabular-nums ${
                      activeCategory === cat ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {categoryCounts[cat]}
                  </span>
                </button>
              ))}
            </div>

            {visibleReports.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-14 px-6 text-center">
                <Search className="w-5 h-5 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-900">No reports match your search</p>
                <button
                  onClick={() => { setSearchTerm(""); setActiveCategory("All"); }}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-gray-500">
                    <span className="font-medium text-gray-900 tabular-nums">{visibleReports.length}</span> reports
                    {searchTerm && ` for "${searchTerm}"`}
                  </p>
                  {loadingId && (
                    <div className="flex items-center gap-2 text-[13px] text-gray-600" role="status">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating report…
                    </div>
                  )}
                </div>

                <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {visibleReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      filters={filters}
                      loadingId={loadingId}
                      favorites={favorites}
                      onDownload={handleDownload}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </ul>
              </>
            )}


          </div>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
