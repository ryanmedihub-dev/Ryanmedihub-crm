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

      if (result.truncated) {
        showToast(
          "Downloaded — but truncated",
          `${result.rowCount} rows saved. Capped at the ${result.docLimit} most recent records; narrow the date range for a complete export.`,
          "error",
        );
      } else {
        showToast("Report Downloaded!", `${result.rowCount} records saved as ${result.fileName}`);
      }
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
                  <div className="w-9 h-9 rounded-xl bg-linear-to-br from-amber-500 via-orange-500 to-red-500 flex items-center justify-center shadow-md">
                    <FileBarChart className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">Reports Center</h1>
                </div>
                <p className="text-sm text-gray-500 ml-12">
                  Generate and download {REPORTS.length} report & log types across all modules
                </p>
              </div>

              <div className="flex items-center gap-3 ml-12 sm:ml-0">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-semibold text-amber-700">{favorites.length} Favorited</span>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-xl border border-red-200 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <Filter className="w-4.5 h-4.5 text-amber-600" />
                  <span className="font-semibold text-gray-900 text-sm">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span>{showFilters ? "Hide" : "Show"} Advanced</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Date Range
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {DATE_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setDatePreset(p.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            datePreset === p.value
                              ? "bg-amber-500 text-white shadow-sm"
                              : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setDatePreset("custom")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          datePreset === "custom"
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Branch
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {BRANCHES.map((b) => (
                        <button
                          key={b}
                          onClick={() => setFilters((f) => ({ ...f, branch: b }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.branch === b
                              ? "bg-amber-500 text-white shadow-sm"
                              : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Search Reports
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or category..."
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                      />
                      {searchTerm && (
                        <button
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
                  <div className="flex flex-wrap items-end gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <Calendar className="w-4 h-4 text-amber-600 self-center" />
                    <div>
                      <label className="block text-xs font-semibold text-amber-700 mb-1">From</label>
                      <input
                        type="date"
                        value={pendingCustom.from}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, from: e.target.value }))}
                        className="px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-700 mb-1">To</label>
                      <input
                        type="date"
                        value={pendingCustom.to}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, to: e.target.value }))}
                        min={pendingCustom.from}
                        className="px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <button
                      onClick={applyCustomDates}
                      disabled={!pendingCustom.from}
                      className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Apply
                    </button>
                    {customDates.from && (
                      <span className="text-xs text-amber-700 font-medium">
                        Active: {customDates.from} → {customDates.to || customDates.from}
                      </span>
                    )}
                  </div>
                )}

                {showFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Patient Status
                      </label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Statuses</option>
                        {PATIENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Technique
                      </label>
                      <select
                        value={filters.technique}
                        onChange={(e) => setFilters((f) => ({ ...f, technique: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Techniques</option>
                        {TECHNIQUES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Procedure
                      </label>
                      <select
                        value={filters.procedure}
                        onChange={(e) => setFilters((f) => ({ ...f, procedure: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Procedures</option>
                        {PROCEDURES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Payment Type
                      </label>
                      <select
                        value={filters.paymentType}
                        onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Payment Types</option>
                        {PAYMENT_TYPES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Payable Type
                      </label>
                      <select
                        value={filters.payableType}
                        onChange={(e) => setFilters((f) => ({ ...f, payableType: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
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

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    activeCategory === cat
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-700 shadow-sm"
                  }`}
                >
                  {cat}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      activeCategory === cat
                        ? "bg-white/25 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {categoryCounts[cat]}
                  </span>
                </button>
              ))}
            </div>

            {visibleReports.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No reports match your search.</p>
                <button
                  onClick={() => { setSearchTerm(""); setActiveCategory("All"); }}
                  className="mt-3 text-sm text-amber-600 hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500 font-medium">
                    Showing <span className="font-bold text-gray-900">{visibleReports.length}</span> reports
                    {searchTerm && ` for "${searchTerm}"`}
                  </p>
                  {loadingId && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating report...
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                </div>
              </>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Quick Reference — Report Coverage
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Patient Reports",   count: 7, color: "bg-blue-50 text-blue-700 border-blue-200",     icon: HeartPulse,  cat: "Patient Reports" },
                  { label: "Staff Reports",     count: 6, color: "bg-purple-50 text-purple-700 border-purple-200", icon: Users,       cat: "Staff Reports" },
                  { label: "Financial Reports", count: 13, color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: IndianRupee, cat: "Financial Reports" },
                  { label: "Inventory Reports", count: 2, color: "bg-orange-50 text-orange-700 border-orange-200",  icon: Package,     cat: "Inventory Reports" },
                  { label: "Audit Logs",        count: 4, color: "bg-red-50 text-red-700 border-red-200",           icon: ShieldAlert, cat: "Audit Logs" },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setActiveCategory(item.cat)}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${item.color} transition-all hover:shadow-sm`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <div className="text-left">
                      <p className="text-xs font-bold leading-none">{item.count} reports</p>
                      <p className="text-[10px] mt-0.5 opacity-80">{item.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
