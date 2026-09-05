"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  X,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Edit2,
  Trash2,
  RotateCcw,
  FileText,
  FileDown,
  Calendar,
  Building2,
  CreditCard,
  Landmark,
  Tag,
  Receipt,
  Link2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wallet,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  User,
  Package,
  IndianRupee,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { useToast } from "@/components/Toast";
import BillGenerator from "@/components/BillGenerator";
import { ALL_BRANCHES } from "@/lib/branches";
import { formatCurrency, StatusBadge } from "@/lib/financeUI";
import { METHOD_LABELS } from "@/constants/paymentMethods";
import { UNSETTLED_METHODS, FURTHER_MODES } from "@/constants/bankRouting";
import {
  EXPENSE_CATEGORIES,
  getExpenseTypes,
} from "@/constants/expenseCategories";
import {
  ENTRY_TYPES,
  ENTRY_TYPE_TONE_CLASSES,
  ENTRY_TYPE_FILTER_OPTIONS,
} from "@/constants/entryTypes";

import ReverseTransactionModal from "@/components/finance/ReverseTransactionModal";
import TransactionStatusBadges from "@/components/finance/StatusBadges";
import SuspenseManager from "@/components/SuspenseManager";
import ContraManager from "@/components/ContraManager";
import SearchableMultiSelect from "@/components/SearchableMultiSelect";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const getTodayDate = () => new Date().toISOString().split("T")[0];

const isoDate = (d) => d.toISOString().split("T")[0];

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisMonth", label: "This Month" },
  { key: "all", label: "All Time" },
];

/** dateFrom/dateTo for one of the DATE_PRESETS keys — "all" means no date filter at all. */
const getPresetRange = (key) => {
  if (key === "yesterday") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const v = isoDate(y);
    return { dateFrom: v, dateTo: v };
  }
  if (key === "thisMonth") {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: isoDate(first), dateTo: getTodayDate() };
  }
  if (key === "all") {
    return { dateFrom: "", dateTo: "" };
  }
  return { dateFrom: getTodayDate(), dateTo: getTodayDate() };
};

/** Which preset (if any) the current dateFrom/dateTo pair matches — for highlighting. */
const matchingPreset = (dateFrom, dateTo) => {
  const found = DATE_PRESETS.find((p) => {
    const r = getPresetRange(p.key);
    return (dateFrom || "") === r.dateFrom && (dateTo || "") === r.dateTo;
  });
  return found?.key || null;
};

const calculateNetAmount = (transaction) =>
  Math.max(0, parseFloat(transaction?.amount) || 0);

const formatDateForDisplay = (date) => {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTime = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const getPatientName = (row) =>
  row.patient?.personal?.name ||
  row.patientName ||
  "Walk-in Customer";

const getPatientPhone = (row) =>
  row.patient?.personal?.phone ||
  row.patientPhone ||
  "";

const getMedicineName = (row) =>
  typeof row.medicineId === "object"
    ? row.medicineId?.name || "Medicine"
    : "Medicine";

const getExpenseGiverName = (row) => {
  if (row.expenseGiver?.type === "VENDOR") {
    return typeof row.expenseGiver.vendorId === "object"
      ? row.expenseGiver.vendorId?.name ||
          row.expenseGiver.name ||
          "Vendor"
      : row.expenseGiver.name || "Vendor";
  }

  return row.expenseGiver?.name || "N/A";
};

const parseList = (raw) =>
  raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const MULTI_FILTER_KEYS = [
  "branch",
  "paymentMethod",
  "procedure",
  "furtherMode",
  "expenseCategory",
  "expenseType",
  "entryType",
];

const FILTER_KEYS = [
  "branch",
  "dateFrom",
  "dateTo",
  "paymentMethod",
  "procedure",
  "furtherMode",
  "expenseCategory",
  "expenseType",
  "entryType",
];

const defaultFilters = () => ({
  branch: [],
  dateFrom: getTodayDate(),
  dateTo: getTodayDate(),
  paymentMethod: [],
  procedure: [],
  furtherMode: [],
  expenseCategory: [],
  expenseType: [],
  entryType: [],
});

const filtersFromParams = (params) => ({
  branch: parseList(params.get("branch")),
  dateFrom: params.get("dateFrom") || getTodayDate(),
  dateTo: params.get("dateTo") || getTodayDate(),
  paymentMethod: parseList(params.get("paymentMethod")),
  procedure: parseList(params.get("procedure")),
  furtherMode: parseList(params.get("furtherMode")),
  expenseCategory: parseList(params.get("expenseCategory")),
  expenseType: parseList(params.get("expenseType")),
  entryType: parseList(params.get("entryType")),
});

const filterEquals = (a, b) =>
  Array.isArray(a) || Array.isArray(b)
    ? (a || []).length === (b || []).length &&
      (a || []).every((v, i) => v === (b || [])[i])
    : a === b;

const TRANSACTION_CATEGORIES = [
  {
    value: "ALL",
    label: "All",
    icon: LayoutGrid,
    tone: "slate",
  },
  {
    value: "TRANSPLANT",
    label: "Transplants",
    icon: User,
    tone: "indigo",
  },
  {
    value: "SERVICE",
    label: "Services",
    icon: Sparkles,
    tone: "pink",
  },
  {
    value: "MEDICINE",
    label: "Medicine",
    icon: Package,
    tone: "emerald",
  },
  {
    value: "EXPENSE",
    label: "Expenses",
    icon: TrendingDown,
    tone: "rose",
  },
  {
    value: "CONTRA",
    label: "Contra",
    icon: Wallet,
    tone: "violet",
  },
  {
    value: "SUSPENSE",
    label: "Suspense",
    icon: AlertCircle,
    tone: "amber",
  },
];

const NON_TRANSACTION_TABS = ["CONTRA", "SUSPENSE"];

const VALID_CATEGORIES = new Set(
  TRANSACTION_CATEGORIES.map((x) => x.value)
);

const REVENUE_CATEGORIES = [
  "TRANSPLANT",
  "SERVICE",
  "MEDICINE",
];

const TRANSPLANT_PROCEDURES = [
  "Sapphire FUE",
  "DHI",
  "Turkish DHI",
  "Beard Transplant",
];

const SERVICE_PROCEDURES = [
  "PRP",
  "GFC",
  "Alopecia",
  "Headwash",
  "Canacot",
];

const UNTRACKED_FURTHER_MODE = "__UNTRACKED__";

const getCategoryStyle = (category) => {
  const styles = {
    TRANSPLANT:
      "bg-indigo-50 text-indigo-700 border-indigo-100",
    SERVICE:
      "bg-pink-50 text-pink-700 border-pink-100",
    MEDICINE:
      "bg-emerald-50 text-emerald-700 border-emerald-100",
    EXPENSE:
      "bg-rose-50 text-rose-700 border-rose-100",
    CONTRA:
      "bg-violet-50 text-violet-700 border-violet-100",
    SUSPENSE:
      "bg-amber-50 text-amber-700 border-amber-100",
  };

  return (
    styles[category] ||
    "bg-slate-50 text-slate-700 border-slate-100"
  );
};

const getMethodStyle = (method) => {
  const styles = {
    cash: "bg-emerald-50 text-emerald-700",
    upi: "bg-blue-50 text-blue-700",
    card: "bg-purple-50 text-purple-700",
    banking: "bg-indigo-50 text-indigo-700",
    bajaj_loan: "bg-orange-50 text-orange-700",
    fibe_loan: "bg-orange-50 text-orange-700",
    hdfc_skin_bank_transfer: "bg-sky-50 text-sky-700",
    hdfc_ryan_medihub_bank_transfer:
      "bg-teal-50 text-teal-700",
    icici_medihub_bank_transfer:
      "bg-rose-50 text-rose-700",
  };

  return (
    styles[method?.toLowerCase()] ||
    "bg-slate-50 text-slate-700"
  );
};

/* -------------------------------------------------------------------------- */
/* Small UI primitives                                                        */
/* -------------------------------------------------------------------------- */

function SectionLabel({ children }) {
  return (
    <p className="text-[17px] font-bold uppercase tracking-wider text-slate-400">
      {children}
    </p>
  );
}

function CategoryBadge({ category }) {
  if (!category) return null;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md border text-[11px] font-bold ${getCategoryStyle(
        category
      )}`}
    >
      {category}
    </span>
  );
}

function MethodBadge({ method }) {
  if (!method) return null;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold ${getMethodStyle(
        method
      )}`}
    >
      {METHOD_LABELS[method] || method}
    </span>
  );
}

function EntryBadge({ row }) {
  const type = ENTRY_TYPES[row.entryType];

  if (!type || row.entryType === "REGULAR") return null;

  const tone =
    ENTRY_TYPE_TONE_CLASSES[type.tone] ||
    ENTRY_TYPE_TONE_CLASSES.gray;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md border text-[10px] font-bold ${tone}`}
    >
      {type.label}
    </span>
  );
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-white border border-indigo-100 text-indigo-700 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm">
      {label}

      <button
        type="button"
        onClick={onRemove}
        className="text-indigo-400 hover:text-indigo-700"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function Input({
  label,
  type = "text",
  value,
  onChange,
  icon: Icon,
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}
      </span>

      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        )}

        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-10 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 ${
            Icon ? "pl-9 pr-3" : "px-3"
          }`}
        />
      </div>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

function PageHeader({
  activeCategory,
  refreshing,
  onRefresh,
  onExport,
  exporting,
  onCreate,
  hasExport,
}) {
  const category =
    TRANSACTION_CATEGORIES.find(
      (x) => x.value === activeCategory
    ) || TRANSACTION_CATEGORIES[0];

  return (
    <header className="mb-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <category.icon className="w-5 h-5 text-white" />
            </div>

            <SectionLabel>Finance / Transactions</SectionLabel>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
            {activeCategory === "ALL" ? "Transactions" : category.label}
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Review, manage and track your financial activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="h-10 w-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                refreshing ? "animate-spin" : ""
              }`}
            />
          </button>

          {hasExport && (
            <button
              onClick={onExport}
              disabled={exporting}
              className="h-10 px-3 rounded-lg border border-slate-200 bg-white flex items-center gap-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              title="Export every transaction matching the current filters"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {exporting ? "Exporting…" : "Export"}
              </span>
            </button>
          )}

          <button
            onClick={onCreate}
            className="h-10 px-4 rounded-lg bg-slate-950 hover:bg-slate-800 text-white flex items-center gap-2 text-sm font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            New Transaction
          </button>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI strip                                                                  */
/* -------------------------------------------------------------------------- */

function KPIItem({
  label,
  value,
  count,
  icon: Icon,
  color,
}) {
  return (
    <div className="flex-1 min-w-[180px] px-5 py-4 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">
            {value}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {count} transactions
          </p>
        </div>

        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function KPIBar({ stats }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-5">
      <div className="flex flex-wrap divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <KPIItem
          label="Total activity"
          value={formatCurrency(stats.ALL?.total || 0)}
          count={stats.ALL?.count || 0}
          icon={IndianRupee}
          color="bg-slate-100 text-slate-700"
        />

        <KPIItem
          label="Transplant revenue"
          value={formatCurrency(
            stats.TRANSPLANT?.total || 0
          )}
          count={stats.TRANSPLANT?.count || 0}
          icon={TrendingUp}
          color="bg-indigo-50 text-indigo-600"
        />

        <KPIItem
          label="Service revenue"
          value={formatCurrency(stats.SERVICE?.total || 0)}
          count={stats.SERVICE?.count || 0}
          icon={TrendingUp}
          color="bg-pink-50 text-pink-600"
        />

        <KPIItem
          label="Medicine revenue"
          value={formatCurrency(
            stats.MEDICINE?.total || 0
          )}
          count={stats.MEDICINE?.count || 0}
          icon={Package}
          color="bg-emerald-50 text-emerald-600"
        />

        <KPIItem
          label="Expenses"
          value={formatCurrency(stats.EXPENSE?.total || 0)}
          count={stats.EXPENSE?.count || 0}
          icon={TrendingDown}
          color="bg-rose-50 text-rose-600"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Category navigation                                                        */
/* -------------------------------------------------------------------------- */

function CategoryNavigation({
  activeCategory,
  stats,
  onChange,
}) {
  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
      {TRANSACTION_CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const active = activeCategory === cat.value;

        return (
          <button
            key={cat.value}
            onClick={() => onChange(cat.value)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
              active
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
            }`}
          >
            <Icon className="w-4 h-4" />

            {cat.label}

            {stats[cat.value] && (
              <span
                className={`text-[11px] ${
                  active
                    ? "text-slate-500"
                    : "text-slate-400"
                }`}
              >
                {stats[cat.value].count || 0}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                    */
/* -------------------------------------------------------------------------- */

function TransactionToolbar({
  search,
  onSearch,
  showFilters,
  onToggleFilters,
  pendingOnly,
  onPendingToggle,
  activeCategory,
  hasActiveFilters,
  activeFilterCount = 0,
  onClear,
  activeDatePreset,
  onDatePreset,
}) {
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-white space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
          Range
        </span>

        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => onDatePreset(preset.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeDatePreset === preset.key
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search patient, transaction ID, expense..."
            className="w-full h-10 pl-9 pr-9 rounded-lg border border-slate-200 bg-slate-50/60 text-sm outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition"
          />

          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeCategory === "EXPENSE" && (
            <button
              onClick={onPendingToggle}
              className={`h-10 px-3 rounded-lg text-sm font-semibold flex items-center gap-2 transition ${
                pendingOnly
                  ? "bg-amber-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Clock className="w-4 h-4" />
              Pending
            </button>
          )}

          <button
            onClick={onToggleFilters}
            className={`h-10 px-3 rounded-lg border text-sm font-semibold flex items-center gap-2 transition ${
              showFilters
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={onClear}
              className="h-10 px-3 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */
function FilterPanel({
  activeCategory,
  draftFilters,
  setDraftFilters,
  applyFilters,
  hasPendingChanges,
  appliedFilters,
  removeFilter,
  onReset,
}) {
  const hasAppliedFilters =
    MULTI_FILTER_KEYS.some(
      (key) => appliedFilters[key]?.length
    ) ||
    appliedFilters.dateFrom !== getTodayDate() ||
    appliedFilters.dateTo !== getTodayDate();

  const activeFilterCount = MULTI_FILTER_KEYS.reduce(
    (count, key) =>
      count + (appliedFilters[key]?.length || 0),
    0
  ) +
    (appliedFilters.dateFrom !== getTodayDate() ? 1 : 0) +
    (appliedFilters.dateTo !== getTodayDate() ? 1 : 0);

  return (
    <div className="border-b border-slate-200 bg-white">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 pt-5 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200">
                <svg
                  className="h-5 w-5 text-slate-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 5h18M6 12h12M10 19h4"
                  />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Filter transactions
                  </h3>

                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-slate-900 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-slate-500">
                  Refine your financial records using the filters below.
                </p>
              </div>
            </div>

            {hasPendingChanges && (
              <div className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span className="text-[11px] font-semibold text-amber-700">
                  Unsaved changes
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Filter Area */}
        <div className="px-4 sm:px-6 pb-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {/* Branch */}
              <SearchableMultiSelect
                label="Branch"
                icon={Building2}
                allLabel="All Branches"
                value={draftFilters.branch}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    branch: v,
                  }))
                }
                options={ALL_BRANCHES.map((b) => ({
                  value: b,
                  label: b,
                }))}
              />

              {/* Date From */}
              <Input
                label="From date"
                type="date"
                icon={Calendar}
                value={draftFilters.dateFrom}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    dateFrom: v,
                  }))
                }
              />

              {/* Date To */}
              <Input
                label="To date"
                type="date"
                icon={Calendar}
                value={draftFilters.dateTo}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    dateTo: v,
                  }))
                }
              />

              {/* Payment Method */}
              <SearchableMultiSelect
                label="Payment method"
                icon={CreditCard}
                allLabel="All Methods"
                value={draftFilters.paymentMethod}
                onChange={(v) =>
                  setDraftFilters((f) => ({
                    ...f,
                    paymentMethod: v,
                  }))
                }
                options={Object.keys(METHOD_LABELS).map((m) => ({
                  value: m,
                  label: METHOD_LABELS[m] || m,
                }))}
              />

              {/* Entry Type */}
              {!NON_TRANSACTION_TABS.includes(activeCategory) && (
                <SearchableMultiSelect
                  label="Entry type"
                  icon={Link2}
                  allLabel="All Entry Types"
                  value={draftFilters.entryType}
                  onChange={(v) =>
                    setDraftFilters((f) => ({
                      ...f,
                      entryType: v,
                    }))
                  }
                  options={ENTRY_TYPE_FILTER_OPTIONS.filter(
                    (o) => o.value
                  ).map((o) => ({
                    value: o.value,
                    label: o.label.replace(/ only$/, ""),
                  }))}
                />
              )}

              {/* Procedure */}
              {(activeCategory === "ALL" ||
                activeCategory === "TRANSPLANT" ||
                activeCategory === "SERVICE") && (
                <SearchableMultiSelect
                  label="Procedure"
                  icon={Tag}
                  allLabel="All Procedures"
                  value={draftFilters.procedure}
                  onChange={(v) =>
                    setDraftFilters((f) => ({
                      ...f,
                      procedure: v,
                    }))
                  }
                  options={[
                    ...TRANSPLANT_PROCEDURES,
                    ...SERVICE_PROCEDURES,
                  ].map((p) => ({
                    value: p,
                    label: p,
                  }))}
                />
              )}

              {/* Account */}
              {(REVENUE_CATEGORIES.includes(activeCategory) ||
                activeCategory === "EXPENSE" ||
                activeCategory === "ALL") && (
                <SearchableMultiSelect
                  label={
                    activeCategory === "EXPENSE"
                      ? "Paid from"
                      : "Received in"
                  }
                  icon={Landmark}
                  allLabel="All Accounts"
                  value={draftFilters.furtherMode}
                  onChange={(v) =>
                    setDraftFilters((f) => ({
                      ...f,
                      furtherMode: v,
                    }))
                  }
                  options={[
                    {
                      value: UNTRACKED_FURTHER_MODE,
                      label: "Untracked",
                    },
                    ...FURTHER_MODES.map((m) => ({
                      value: m,
                      label: m,
                    })),
                  ]}
                />
              )}

              {/* Expense Category */}
              {(activeCategory === "EXPENSE" ||
                activeCategory === "ALL") && (
                <>
                  <SearchableMultiSelect
                    label="Expense category"
                    allLabel="All Categories"
                    value={draftFilters.expenseCategory}
                    onChange={(v) =>
                      setDraftFilters((f) => ({
                        ...f,
                        expenseCategory: v,
                        expenseType: [],
                      }))
                    }
                    options={EXPENSE_CATEGORIES.map((c) => ({
                      value: c,
                      label: c,
                    }))}
                  />

                  {/* Expense Type */}
                  <SearchableMultiSelect
                    label="Expense type"
                    allLabel="All Types"
                    value={draftFilters.expenseType}
                    onChange={(v) =>
                      setDraftFilters((f) => ({
                        ...f,
                        expenseType: v,
                      }))
                    }
                    options={(
                      draftFilters.expenseCategory.length
                        ? [
                            ...new Set(
                              draftFilters.expenseCategory.flatMap(
                                (c) => getExpenseTypes(c)
                              )
                            ),
                          ]
                        : [
                            ...new Set(
                              EXPENSE_CATEGORIES.flatMap((c) =>
                                getExpenseTypes(c)
                              )
                            ),
                          ]
                    ).map((t) => ({
                      value: t,
                      label: t,
                    }))}
                  />
                </>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-slate-500">
                {hasPendingChanges ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Review your changes before applying.
                  </span>
                ) : (
                  <span>
                    Select one or more filters to narrow the results.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="
                      h-10 px-4
                      rounded-xl
                      border border-slate-200
                      bg-white
                      text-sm font-semibold text-slate-600
                      hover:bg-slate-100
                      hover:text-slate-900
                      active:scale-[0.98]
                      transition-all duration-150
                    "
                  >
                    Reset
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!hasPendingChanges}
                  className="
                    h-10 px-5
                    rounded-xl
                    bg-slate-950
                    text-white
                    text-sm font-semibold
                    shadow-sm
                    hover:bg-slate-800
                    active:scale-[0.98]
                    disabled:bg-slate-200
                    disabled:text-slate-400
                    disabled:shadow-none
                    disabled:cursor-not-allowed
                    transition-all duration-150
                  "
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Applied Filters */}
      {hasAppliedFilters && (
        <div className="px-4 sm:px-6 pb-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                    <svg
                      className="h-3.5 w-3.5 text-slate-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 5h18M6 12h12M10 19h4"
                      />
                    </svg>
                  </span>

                  <span className="text-xs font-bold text-slate-700">
                    Active filters
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-wrap gap-2">
                {/* Branch */}
                {appliedFilters.branch.map((v) => (
                  <FilterChip
                    key={`branch-${v}`}
                    label={`Branch: ${v}`}
                    onRemove={() =>
                      removeFilter("branch", v)
                    }
                  />
                ))}

                {/* From Date */}
                {appliedFilters.dateFrom && (
                  <FilterChip
                    label={`From: ${formatDateForDisplay(
                      appliedFilters.dateFrom
                    )}`}
                    onRemove={() =>
                      removeFilter("dateFrom")
                    }
                  />
                )}

                {/* To Date */}
                {appliedFilters.dateTo && (
                  <FilterChip
                    label={`To: ${formatDateForDisplay(
                      appliedFilters.dateTo
                    )}`}
                    onRemove={() =>
                      removeFilter("dateTo")
                    }
                  />
                )}

                {/* Payment Method */}
                {appliedFilters.paymentMethod.map((v) => (
                  <FilterChip
                    key={`method-${v}`}
                    label={`Method: ${
                      METHOD_LABELS[v] || v
                    }`}
                    onRemove={() =>
                      removeFilter("paymentMethod", v)
                    }
                  />
                ))}

                {/* Procedure */}
                {appliedFilters.procedure.map((v) => (
                  <FilterChip
                    key={`procedure-${v}`}
                    label={`Procedure: ${v}`}
                    onRemove={() =>
                      removeFilter("procedure", v)
                    }
                  />
                ))}

                {/* Account */}
                {appliedFilters.furtherMode.map((v) => (
                  <FilterChip
                    key={`account-${v}`}
                    label={`Account: ${
                      v === UNTRACKED_FURTHER_MODE
                        ? "Untracked"
                        : v
                    }`}
                    onRemove={() =>
                      removeFilter("furtherMode", v)
                    }
                  />
                ))}

                {/* Expense Category */}
                {appliedFilters.expenseCategory.map((v) => (
                  <FilterChip
                    key={`expense-category-${v}`}
                    label={`Category: ${v}`}
                    onRemove={() =>
                      removeFilter("expenseCategory", v)
                    }
                  />
                ))}

                {/* Expense Type */}
                {appliedFilters.expenseType.map((v) => (
                  <FilterChip
                    key={`expense-type-${v}`}
                    label={`Type: ${v}`}
                    onRemove={() =>
                      removeFilter("expenseType", v)
                    }
                  />
                ))}

                {/* Entry Type */}
                {appliedFilters.entryType.map((v) => (
                  <FilterChip
                    key={`entry-${v}`}
                    label={`Entry: ${
                      ENTRY_TYPE_FILTER_OPTIONS.find(
                        (o) => o.value === v
                      )?.label || v
                    }`}
                    onRemove={() =>
                      removeFilter("entryType", v)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Transaction details                                                        */
/* -------------------------------------------------------------------------- */

function TransactionDetails({
  row,
  linkedInfo,
  linkedLoading,
}) {
  const router = useRouter();

  const hasTax =
    row.taxDetails &&
    (row.taxDetails.gstAmount ||
      row.taxDetails.tdsAmount);

  const hasCollab =
    row.collabSplit?.ourShare ||
    row.collabSplit?.clinicShare;

  const hasExternalParty =
    !!row.externalParty?.name;

  const hasReceipts =
    row.receipts?.length > 0;

  const hasLink =
    linkedLoading || !!linkedInfo;

  const hasAudit =
    !!row.createdBy?.name ||
    row.editors?.length > 0;

  if (
    !hasTax &&
    !hasCollab &&
    !hasExternalParty &&
    !hasReceipts &&
    !hasLink &&
    !hasAudit
  ) {
    return (
      <div className="px-5 py-4 bg-slate-50 text-xs text-slate-400">
        No additional details available.
      </div>
    );
  }

  return (
    <div className="px-5 py-5 bg-slate-50 border-t border-slate-100">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {hasTax && (
          <DetailBox title="Tax">
            <DetailLine
              label="Base"
              value={formatCurrency(
                row.taxDetails.baseAmount || 0
              )}
            />

            <DetailLine
              label={`GST (${row.taxDetails.gstRate || 0}%)`}
              value={formatCurrency(
                row.taxDetails.gstAmount || 0
              )}
            />

            {row.taxDetails.tdsApplied && (
              <DetailLine
                label={`TDS (${row.taxDetails.tdsRate || 0}%)`}
                value={`-${formatCurrency(
                  row.taxDetails.tdsAmount || 0
                )}`}
                danger
              />
            )}
          </DetailBox>
        )}

        {hasCollab && (
          <DetailBox title="Collaboration split">
            <DetailLine
              label="Our share"
              value={formatCurrency(
                row.collabSplit.ourShare || 0
              )}
            />

            <DetailLine
              label="Clinic share"
              value={formatCurrency(
                row.collabSplit.clinicShare || 0
              )}
            />

            <DetailLine
              label="Received by us"
              value={formatCurrency(
                row.collabSplit.ourReceived || 0
              )}
            />
          </DetailBox>
        )}

        {hasExternalParty && (
          <DetailBox title="External party">
            <DetailLine
              label="Name"
              value={row.externalParty.name}
            />

            <DetailLine
              label="Type"
              value={
                row.externalParty.partyKind || "—"
              }
            />

            <DetailLine
              label="Method"
              value={
                row.externalParty.method || "—"
              }
            />
          </DetailBox>
        )}

        {hasReceipts && (
          <DetailBox title="Receipts">
            <div className="flex flex-wrap gap-2">
              {row.receipts.map((receipt) => (
                <a
                  key={
                    receipt.publicId ||
                    receipt.url
                  }
                  href={receipt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 hover:border-indigo-300 transition"
                >
                  <Receipt className="w-3.5 h-3.5 text-indigo-500" />

                  <span className="max-w-32 truncate">
                    {receipt.fileName || "Receipt"}
                  </span>
                </a>
              ))}
            </div>
          </DetailBox>
        )}

        {hasLink && (
          <DetailBox title="Linked document">
            {linkedLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : linkedInfo?.data ? (
              <>
                <DetailLine
                  label="Total"
                  value={formatCurrency(
                    linkedInfo.data.totalAmount
                  )}
                />

                <DetailLine
                  label={
                    linkedInfo.type === "payable"
                      ? "Paid"
                      : "Received"
                  }
                  value={formatCurrency(
                    linkedInfo.data.paid ??
                      linkedInfo.data.received ??
                      0
                  )}
                />

                <button
                  onClick={() =>
                    router.push(
                      linkedInfo.type === "payable"
                        ? `/admin/liabilities?section=payables&doc=${linkedInfo.data._id}`
                        : `/admin/assets?section=receivables&doc=${linkedInfo.data._id}`
                    )
                  }
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Open document →
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Document not found.
              </p>
            )}
          </DetailBox>
        )}

        {hasAudit && (
          <DetailBox title="Audit trail">
            {row.createdBy?.name && (
              <DetailLine
                label="Created by"
                value={`${row.createdBy.name}${
                  row.createdBy.date
                    ? ` · ${formatDateForDisplay(row.createdBy.date)}`
                    : ""
                }`}
              />
            )}

            {row.editors?.length > 0 ? (
              (() => {
                const lastEditor = row.editors[row.editors.length - 1];
                return (
                  <>
                    <DetailLine
                      label="Last updated by"
                      value={`${lastEditor.name || "—"}${
                        lastEditor.date
                          ? ` · ${formatDateForDisplay(lastEditor.date)}`
                          : ""
                      }`}
                    />

                    {row.editors.length > 1 && (
                      <DetailLine
                        label="Total edits"
                        value={String(row.editors.length)}
                      />
                    )}

                    {lastEditor.updatedFields?.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Changed:{" "}
                        {lastEditor.updatedFields
                          .map((f) => f.name)
                          .join(", ")}
                      </p>
                    )}
                  </>
                );
              })()
            ) : (
              <DetailLine label="Last updated by" value="Not edited" />
            )}
          </DetailBox>
        )}
      </div>
    </div>
  );
}

function DetailBox({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <p className="text-xs font-bold text-slate-700 mb-3">
        {title}
      </p>

      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailLine({
  label,
  value,
  danger = false,
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>

      <span
        className={`font-semibold ${
          danger
            ? "text-rose-600"
            : "text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile transaction card                                                    */
/* -------------------------------------------------------------------------- */

function MobileTransactionCard({
  row,
  category,
  onExpand,
  expanded,
  onDelete,
  onReverse,
  onBill,
  linkedInfo,
  linkedLoading,
}) {
  const rowCategory =
    row.transactionCategory ||
    row.category ||
    "TRANSPLANT";

  const isExpense = rowCategory === "EXPENSE";

  const title = isExpense
    ? getExpenseGiverName(row)
    : getPatientName(row);

  const subtitle = isExpense
    ? row.expense ||
      row.expenseCategory ||
      "Expense"
    : row.procedure ||
      (rowCategory === "MEDICINE"
        ? getMedicineName(row)
        : "Transaction");

  const amount = calculateNetAmount(row);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {category === "ALL" && (
                <CategoryBadge category={rowCategory} />
              )}

              <MethodBadge method={row.method} />
              <EntryBadge row={row} />

              {row.approvalStatus === "PENDING" && (
                <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">
                  Pending
                </span>
              )}
            </div>

            <h3 className="font-bold text-slate-900 truncate">
              {title}
            </h3>

            <p className="text-sm text-slate-500 mt-0.5 truncate">
              {subtitle}
            </p>

            {!isExpense && getPatientPhone(row) && (
              <p className="text-xs text-slate-400 mt-1">
                {getPatientPhone(row)}
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p
              className={`text-lg font-bold ${
                isExpense
                  ? "text-rose-600"
                  : "text-emerald-600"
              }`}
            >
              {formatCurrency(amount)}
            </p>

            <p className="text-xs text-slate-400 mt-1">
              {formatDateForDisplay(row.date)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={onExpand}
            className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Details
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onBill(row)}
              className="p-2 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
              title="Bill"
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              onClick={() => onReverse(row)}
              disabled={
                !!row.reversalOf ||
                !!row.isReversed ||
                !(row.amount > 0)
              }
              className="p-2 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:hidden"
              title="Reverse"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDelete(row)}
              className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <TransactionDetails
          row={row}
          linkedInfo={linkedInfo}
          linkedLoading={linkedLoading}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop table                                                              */
/* -------------------------------------------------------------------------- */
function DesktopTable({
  category,
  rows,
  sortConfig,
  onSort,
  onDelete,
  onReverse,
  onBill,
  expandedId,
  onExpand,
  linkedInfo,
  linkedLoading,
}) {
  const getColumns = () => {
    const base = [["date", "Date"]];

    if (category === "EXPENSE") {
      return [
        ...base,
        ["party", "Paid to"],
        ["description", "Category"],
        ["method", "Method"],
        ["branch", "Branch"],
        ["amount", "Amount"],
        ["actions", ""],
      ];
    }

    if (category === "ALL") {
      return [
        ...base,
        ["category", "Type"],
        ["party", "Party"],
        ["description", "Details"],
        ["method", "Method"],
        ["branch", "Branch"],
        ["amount", "Amount"],
        ["actions", ""],
      ];
    }

    // TRANSPLANT / SERVICE / MEDICINE
    return [
      ...base,
      ["party", "Patient"],
      ["description", category === "MEDICINE" ? "Medicine" : "Procedure"],
      ["method", "Method"],
      ["branch", "Branch"],
      ["amount", "Amount"],
      ["actions", ""],
    ];
  };

  const columns = getColumns();

  const SortButton = ({ column }) => {
    if (!["date", "amount", "branch", "method"].includes(column)) return null;
    if (sortConfig.key !== column) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3 h-3 text-indigo-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600" />
    );
  };

  const renderCell = (row, key) => {
    const rowCategory = row.transactionCategory || row.category || "TRANSPLANT";
    const isExpense = rowCategory === "EXPENSE";

    switch (key) {
      case "date":
        return (
          <div>
            <p className="text-sm font-medium text-slate-700">{formatDateForDisplay(row.date)}</p>
            <p className="text-[11px] text-slate-400">{formatTime(row.date)}</p>
          </div>
        );

      case "category":
        return <CategoryBadge category={rowCategory} />;

      case "party": {
        const name = isExpense ? getExpenseGiverName(row) : getPatientName(row);
        const phone = !isExpense ? getPatientPhone(row) : "";
        return (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">{name}</p>
            {phone && <p className="text-[11px] text-slate-400">{phone}</p>}
          </div>
        );
      }

      case "description": {
        const text = isExpense
          ? row.expenseType || row.expense || row.expenseCategory || "Expense"
          : rowCategory === "MEDICINE"
            ? getMedicineName(row)
            : row.procedure || "—";
        return <span className="text-sm text-slate-600 truncate block max-w-[220px]">{text}</span>;
      }

      case "method":
        return <MethodBadge method={row.method} />;

      case "branch":
        return <span className="text-sm text-slate-600">{row.branch || "—"}</span>;

      case "amount":
        return (
          <span className={`text-sm font-bold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
            {formatCurrency(calculateNetAmount(row))}
          </span>
        );

      case "actions":
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onBill(row)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
              title="Bill"
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              onClick={() => onReverse(row)}
              disabled={!!row.reversalOf || !!row.isReversed || !(row.amount > 0)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30 disabled:pointer-events-none"
              title="Reverse"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDelete(row)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
          <tr>
            {columns.map(([key, label]) => (
              <th
                key={key}
                className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 ${
                  key === "amount" ? "text-right" : key === "actions" ? "text-right" : ""
                }`}
              >
                {label ? (
                  <button
                    onClick={() =>
                      ["date", "amount", "branch", "method"].includes(key) && onSort(key)
                    }
                    className={`inline-flex items-center gap-1.5 ${
                      ["date", "amount", "branch", "method"].includes(key)
                        ? "hover:text-slate-900"
                        : ""
                    }`}
                  >
                    {label}
                    <SortButton column={key} />
                  </button>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>

        {/* ✅ Single tbody – no nesting */}
        <tbody className="divide-y divide-slate-100">
          {rows.flatMap((row) => {
            const expanded = expandedId === row._id;

            // Main row
            const mainRow = (
              <tr
                key={`${row._id}-main`}
                className={`group transition-colors ${
                  expanded ? "bg-indigo-50/40" : "hover:bg-slate-50/70"
                }`}
              >
                {columns.map(([key]) => (
                  <td
                    key={key}
                    className={`px-4 py-3.5 align-middle ${
                      key === "amount" ? "text-right" : key === "actions" ? "text-right" : ""
                    }`}
                  >
                    {renderCell(row, key)}
                  </td>
                ))}
              </tr>
            );

            // Detail row (always present, but content conditionally expanded)
            const detailRow = (
              <tr key={`${row._id}-detail`}>
                <td colSpan={columns.length} className="p-0">
                  <div className="flex items-center gap-2 px-4 py-2 bg-white">
                    <button
                      onClick={() => onExpand(row)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      Details
                    </button>

                    {row.furtherMode && (
                      <span className="text-[10px] text-slate-400">
                        •{" "}
                        {row.costType === "Expenses" ? "Paid from" : "Received in"}{" "}
                        {row.furtherMode}
                      </span>
                    )}

                    {UNSETTLED_METHODS.includes(row.method) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                        <Clock className="w-3 h-3" />
                        Unsettled
                      </span>
                    )}

                    {row.receipts?.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                        <Receipt className="w-3 h-3" />
                        {row.receipts.length} receipt{row.receipts.length > 1 ? "s" : ""}
                      </span>
                    )}

                    {(row.taxDetails?.gstAmount || row.taxDetails?.tdsAmount) && (
                      <span className="text-[10px] font-semibold text-purple-600">Tax</span>
                    )}

                    <TransactionStatusBadges row={row} onShowDetail={() => onExpand(row)} />
                  </div>

                  {expanded && (
                    <TransactionDetails
                      row={row}
                      linkedInfo={linkedInfo}
                      linkedLoading={linkedLoading}
                    />
                  )}
                </td>
              </tr>
            );

            return [mainRow, detailRow];
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({ hasFilters }) {
  return (
    <div className="py-20 px-6 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Search className="w-6 h-6 text-slate-400" />
      </div>

      <h3 className="font-bold text-slate-900">
        No transactions found
      </h3>

      <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
        {hasFilters
          ? "Try changing or clearing your filters to see more records."
          : "There are no transactions available for this period."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

function Pagination({
  page,
  pages,
  perPage,
  total,
  startIdx,
  endIdx,
  setPage,
  setPerPage,
}) {
  return (
    <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-center justify-between">
      <p className="text-xs sm:text-sm text-slate-500">
        Showing{" "}
        <span className="font-semibold text-slate-800">
          {total === 0 ? 0 : startIdx + 1}–{endIdx}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-slate-800">
          {total.toLocaleString()}
        </span>
      </p>

      <div className="flex items-center gap-2">
        <select
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setPage(1);
          }}
          className="h-9 px-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white outline-none"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>

        <button
          disabled={page <= 1}
          onClick={() =>
            setPage((p) => Math.max(1, p - 1))
          }
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="px-2 text-xs font-semibold text-slate-600">
          {page} / {pages}
        </span>

        <button
          disabled={page >= pages}
          onClick={() =>
            setPage((p) =>
              Math.min(pages, p + 1)
            )
          }
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main page                                                                  */
/* -------------------------------------------------------------------------- */

function AllTransactionsPageInner({ Sidebar }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);

  const [stats, setStats] = useState({
    ALL: { count: 0, total: 0 },
    TRANSPLANT: { count: 0, total: 0 },
    SERVICE: { count: 0, total: 0 },
    MEDICINE: { count: 0, total: 0 },
    EXPENSE: { count: 0, total: 0 },
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const [activeCategory, setActiveCategory] =
    useState(() => {
      const category =
        searchParams.get("category");

      return VALID_CATEGORIES.has(category)
        ? category
        : "ALL";
    });

  const [appliedFilters, setAppliedFilters] =
    useState(() =>
      filtersFromParams(searchParams)
    );

  const [draftFilters, setDraftFilters] =
    useState(() =>
      filtersFromParams(searchParams)
    );

  const [tableSearch, setTableSearch] =
    useState("");

  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [showFilters, setShowFilters] =
    useState(false);

  const [pendingOnly, setPendingOnly] =
    useState(false);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [sortConfig, setSortConfig] =
    useState({
      key: "date",
      direction: "desc",
    });

  const [expandedId, setExpandedId] =
    useState(null);

  const [expandedInfo, setExpandedInfo] =
    useState(null);

  const [expandedLoading, setExpandedLoading] =
    useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState(null);

  const [reverseTarget, setReverseTarget] =
    useState(null);

  const [billTransaction, setBillTransaction] =
    useState(null);

  const searchDebounceRef = useRef(null);

  const handleSearch = (value) => {
    setTableSearch(value);

    clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current =
      setTimeout(() => {
        setDebouncedSearch(value);
        setPage(1);
      }, 400);
  };

  // Shared by fetchData (one page, for the screen) and the export (every page, for the
  // download) so the two can never drift on what "the current filters" means.
  const buildFilterParams = useCallback(
    (overrides = {}) => {
      const p = new URLSearchParams({
        category: activeCategory,
        ...overrides,
      });

      const addArray = (key) => {
        if (appliedFilters[key]?.length) {
          p.set(key, appliedFilters[key].join(","));
        }
      };

      addArray("branch");
      addArray("paymentMethod");
      addArray("procedure");
      addArray("furtherMode");
      addArray("expenseCategory");
      addArray("expenseType");
      addArray("entryType");

      if (appliedFilters.dateFrom) p.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) p.set("dateTo", appliedFilters.dateTo);
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (activeCategory === "EXPENSE" && pendingOnly) p.set("approvalStatus", "PENDING");

      return p;
    },
    [activeCategory, appliedFilters, debouncedSearch, pendingOnly]
  );

  const fetchData = useCallback(
    async (refresh = false) => {
      if (
        NON_TRANSACTION_TABS.includes(
          activeCategory
        )
      ) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        refresh
          ? setRefreshing(true)
          : setLoading(true);

        setError(null);

        const p = buildFilterParams({
          page,
          limit: perPage,
          sortKey: sortConfig.key,
          sortDir: sortConfig.direction,
        });

        const res = await fetch(
          `/api/transactions/get-all?${p.toString()}`,
          {
            credentials: "include",
          }
        );

        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}`
          );
        }

        const data = await res.json();

        if (!data.success) {
          throw new Error(
            data.message ||
              data.error ||
              "Failed to load transactions"
          );
        }

        setTransactions(
          data.transactions || []
        );

        setTotal(data.total || 0);

        if (data.stats) {
          // The API only aggregates TRANSPLANT/SERVICE/MEDICINE/EXPENSE — "ALL" (the KPI
          // strip's "Total activity" card) has to be summed client-side or it always shows 0.
          const revenueAndExpense = ["TRANSPLANT", "SERVICE", "MEDICINE", "EXPENSE"];
          const all = revenueAndExpense.reduce(
            (acc, cat) => {
              const s = data.stats[cat] || { count: 0, total: 0 };
              return { count: acc.count + (s.count || 0), total: acc.total + (s.total || 0) };
            },
            { count: 0, total: 0 },
          );
          setStats({ ...data.stats, ALL: all });
        }
      } catch (err) {
        setError(err.message);

        toast?.error?.(
          "Unable to load transactions"
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      activeCategory,
      buildFilterParams,
      page,
      perPage,
      sortConfig,
    ]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [
    activeCategory,
    appliedFilters,
    debouncedSearch,
    pendingOnly,
    sortConfig,
  ]);

  useEffect(() => {
    if (activeCategory !== "EXPENSE") {
      setPendingOnly(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    const params = new URLSearchParams();

    if (activeCategory !== "ALL") {
      params.set(
        "category",
        activeCategory
      );
    }

    Object.entries(appliedFilters).forEach(
      ([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length) {
            params.set(key, value.join(","));
          }
        } else if (value) {
          params.set(key, value);
        }
      }
    );

    const qs = params.toString();

    router.replace(
      qs ? `${pathname}?${qs}` : pathname,
      { scroll: false }
    );
  }, [
    activeCategory,
    appliedFilters,
    pathname,
    router,
  ]);

  const toggleExpand = async (row) => {
    if (expandedId === row._id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(row._id);
    setExpandedInfo(null);

    const receivableId =
      row.receivableId ||
      row.externalParty?.linkedReceivableId;

    const payableId =
      row.payableId ||
      row.externalParty?.linkedPayableId;

    if (!receivableId && !payableId) {
      return;
    }

    setExpandedLoading(true);

    try {
      const endpoint = receivableId
        ? `/api/receivables/${receivableId}`
        : `/api/payables/${payableId}`;

      const res = await fetch(endpoint);
      const data = await res.json();

      if (res.ok) {
        setExpandedInfo({
          type: receivableId
            ? "receivable"
            : "payable",
          data:
            data.receivable ||
            data.payable,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExpandedLoading(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((previous) => ({
      key,
      direction:
        previous.key === key &&
        previous.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const clearFilters = () => {
    const defaults = defaultFilters();

    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setTableSearch("");
    setDebouncedSearch("");
    setPage(1);
  };

  const removeFilter = (key, value) => {
    const update = (filters) => {
      if (
        MULTI_FILTER_KEYS.includes(key)
      ) {
        return {
          ...filters,
          [key]: value
            ? filters[key].filter(
                (v) => v !== value
              )
            : [],
        };
      }

      // dateFrom/dateTo default to today, not "" — clearing them to "" left the chip
      // showing "From: —" instead of actually resetting to (and hiding behind) today.
      if (key === "dateFrom" || key === "dateTo") {
        return { ...filters, [key]: getTodayDate() };
      }

      return {
        ...filters,
        [key]: "",
      };
    };

    setDraftFilters(update);
    setAppliedFilters(update);
  };

  // Preset range buttons (Today/Yesterday/This Month/All Time) bypass the draft->apply
  // gate — they apply immediately, same as removeFilter above.
  const onDatePreset = (key) => {
    const range = getPresetRange(key);
    setDraftFilters((f) => ({ ...f, ...range }));
    setAppliedFilters((f) => ({ ...f, ...range }));
    setPage(1);
  };

  const activeDatePreset = matchingPreset(
    appliedFilters.dateFrom,
    appliedFilters.dateTo
  );

  const pages = Math.max(
    1,
    Math.ceil(total / perPage)
  );

  const current = Math.min(page, pages);

  const startIdx =
    (current - 1) * perPage;

  const endIdx = Math.min(
    startIdx + perPage,
    total
  );

  const hasPendingChanges =
    FILTER_KEYS.some(
      (key) =>
        !filterEquals(
          draftFilters[key],
          appliedFilters[key]
        )
    );

  const hasActiveFilters =
    MULTI_FILTER_KEYS.some(
      (key) =>
        appliedFilters[key]?.length > 0
    ) ||
    appliedFilters.dateFrom !==
      getTodayDate() ||
    appliedFilters.dateTo !==
      getTodayDate() ||
    !!tableSearch;

  // Drives the numeric badge on the "Filters" toggle — how many distinct filter
  // selections are applied, not counting the free-text search box.
  const activeFilterCount =
    MULTI_FILTER_KEYS.reduce(
      (sum, key) => sum + (appliedFilters[key]?.length || 0),
      0
    ) +
    (appliedFilters.dateFrom !== getTodayDate() ? 1 : 0) +
    (appliedFilters.dateTo !== getTodayDate() ? 1 : 0);

  const openBill = (row) => {
    setBillTransaction(row);
  };

  // Pages through /api/transactions/get-all under the currently applied filters until
  // every matching row has been fetched — export must cover everything the filters match,
  // not just the `perPage` rows the screen happens to be showing right now.
  const fetchAllMatchingFilters = async () => {
    const BATCH_SIZE = 2000;
    let batchPage = 1;
    let all = [];
    for (;;) {
      const p = buildFilterParams({
        page: batchPage,
        limit: BATCH_SIZE,
        sortKey: sortConfig.key,
        sortDir: sortConfig.direction,
      });
      const res = await fetch(`/api/transactions/get-all?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to load transactions");

      const batch = data.transactions || [];
      all = all.concat(batch);

      const grandTotal = data.total || 0;
      if (batch.length === 0 || all.length >= grandTotal) break;
      batchPage += 1;
    }
    return all;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const allRows = await fetchAllMatchingFilters();
      if (!allRows.length) {
        toast?.error?.("No transactions match the current filters");
        return;
      }

      const headers = ["Date", "Category", "Party", "Details", "Method", "Branch", "Amount", "Account", "Remarks"];
      const csvRows = allRows.map((row) => {
        const rowCategory = row.transactionCategory || row.category || "TRANSPLANT";
        const isExpense = rowCategory === "EXPENSE";
        return [
          formatDateForDisplay(row.date),
          rowCategory,
          isExpense ? getExpenseGiverName(row) : getPatientName(row),
          isExpense
            ? row.expenseType || row.expense || row.expenseCategory || ""
            : rowCategory === "MEDICINE"
              ? getMedicineName(row)
              : row.procedure || "",
          METHOD_LABELS[row.method] || row.method || "",
          row.branch || "",
          calculateNetAmount(row),
          row.furtherMode || "",
          row.remarks || "",
        ];
      });

      const csv = [headers, ...csvRows]
        .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${activeCategory.toLowerCase()}_${getTodayDate()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast?.success?.(`Exported ${allRows.length.toLocaleString()} transaction${allRows.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast?.error?.(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          </div>

          <p className="text-sm font-semibold text-slate-700">
            Loading transactions
          </p>

          <p className="text-xs text-slate-400 mt-1">
            Fetching your financial records...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm max-w-md w-full p-7 text-center">
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>

          <h2 className="font-bold text-slate-900">
            Unable to load transactions
          </h2>

          <p className="text-sm text-slate-500 mt-2">
            {error}
          </p>

          <button
            onClick={() => fetchData(true)}
            className="mt-5 h-10 px-4 rounded-lg bg-slate-950 text-white text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      {Sidebar && <Sidebar />}

      <main className="lg:pl-0">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          <PageHeader
            activeCategory={activeCategory}
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            onExport={handleExport}
            exporting={exporting}
            onCreate={() =>
              router.push(
                "/admin/transactions/create"
              )
            }
            hasExport={
              !NON_TRANSACTION_TABS.includes(
                activeCategory
              )
            }
          />

          <KPIBar stats={stats} />

          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
              <CategoryNavigation
                activeCategory={activeCategory}
                stats={stats}
                onChange={setActiveCategory}
              />
            </div>

            {!NON_TRANSACTION_TABS.includes(
              activeCategory
            ) && (
              <TransactionToolbar
                search={tableSearch}
                onSearch={handleSearch}
                showFilters={showFilters}
                onToggleFilters={() =>
                  setShowFilters((v) => !v)
                }
                pendingOnly={pendingOnly}
                onPendingToggle={() =>
                  setPendingOnly((v) => !v)
                }
                activeCategory={activeCategory}
                hasActiveFilters={
                  hasActiveFilters
                }
                activeFilterCount={activeFilterCount}
                onClear={clearFilters}
                activeDatePreset={activeDatePreset}
                onDatePreset={onDatePreset}
              />
            )}

            {showFilters &&
              !NON_TRANSACTION_TABS.includes(
                activeCategory
              ) && (
                <FilterPanel
                  activeCategory={activeCategory}
                  draftFilters={draftFilters}
                  setDraftFilters={
                    setDraftFilters
                  }
                  applyFilters={applyFilters}
                  hasPendingChanges={
                    hasPendingChanges
                  }
                  appliedFilters={
                    appliedFilters
                  }
                  removeFilter={removeFilter}
                  onReset={clearFilters}
                />
              )}

            {activeCategory === "SUSPENSE" ? (
              <SuspenseManager />
            ) : activeCategory === "CONTRA" ? (
              <ContraManager />
            ) : transactions.length === 0 ? (
              <EmptyState
                hasFilters={
                  hasActiveFilters
                }
              />
            ) : (
              <>
                <DesktopTable
                  category={activeCategory}
                  rows={transactions}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  onDelete={setDeleteTarget}
                  onReverse={setReverseTarget}
                  onBill={openBill}
                  expandedId={expandedId}
                  onExpand={toggleExpand}
                  linkedInfo={expandedInfo}
                  linkedLoading={
                    expandedLoading
                  }
                />

                <div className="md:hidden">
                  {transactions.map((row) => (
                    <MobileTransactionCard
                      key={row._id}
                      row={row}
                      category={activeCategory}
                      expanded={
                        expandedId === row._id
                      }
                      onExpand={() =>
                        toggleExpand(row)
                      }
                      onDelete={
                        setDeleteTarget
                      }
                      onReverse={
                        setReverseTarget
                      }
                      onBill={openBill}
                      linkedInfo={expandedInfo}
                      linkedLoading={expandedLoading}
                    />
                  ))}
                </div>

                <Pagination
                  page={current}
                  pages={pages}
                  perPage={perPage}
                  total={total}
                  startIdx={startIdx}
                  endIdx={endIdx}
                  setPage={setPage}
                  setPerPage={setPerPage}
                />
              </>
            )}
          </section>
        </div>
      </main>

      {/* Keep your existing delete modal here */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>

            <h2 className="text-lg font-bold text-slate-950">
              Delete transaction?
            </h2>

            <p className="text-sm text-slate-500 mt-2">
              This action cannot be undone.
            </p>

            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">
                  Amount
                </span>

                <span className="font-bold text-rose-600">
                  {formatCurrency(
                    deleteTarget.amount
                  )}
                </span>
              </div>

              <div className="flex justify-between mt-2">
                <span className="text-xs text-slate-500">
                  Date
                </span>

                <span className="text-sm font-semibold text-slate-700">
                  {formatDateForDisplay(
                    deleteTarget.date
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() =>
                  setDeleteTarget(null)
                }
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  try {
                    const category =
                      deleteTarget.transactionCategory ||
                      deleteTarget.category ||
                      "TRANSPLANT";

                    const endpoint =
                      category === "TRANSPLANT"
                        ? "/api/transactions/transplant/delete"
                        : category === "SERVICE"
                        ? "/api/transactions/service/delete"
                        : category === "MEDICINE"
                        ? "/api/transactions/medicine/delete"
                        : "/api/transactions/expense/delete";

                    const res = await fetch(
                      endpoint,
                      {
                        method: "DELETE",
                        headers: {
                          "Content-Type":
                            "application/json",
                        },
                        credentials: "include",
                        body: JSON.stringify({
                          transactionId:
                            deleteTarget._id,
                        }),
                      }
                    );

                    const data =
                      await res.json();

                    if (!res.ok) {
                      throw new Error(
                        data.error ||
                          "Delete failed"
                      );
                    }

                    toast.success(
                      "Transaction deleted"
                    );

                    setDeleteTarget(null);
                    fetchData(true);
                  } catch (err) {
                    toast.error(
                      err.message ||
                        "Delete failed"
                    );
                  }
                }}
                className="flex-1 h-10 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {reverseTarget && (
        <ReverseTransactionModal
          transaction={reverseTarget}
          onClose={() =>
            setReverseTarget(null)
          }
          onDone={() => fetchData(true)}
        />
      )}

      {billTransaction && (
        <BillGenerator
          transactionId={
            billTransaction.patient &&
            billTransaction.costType ===
              "Revenue"
              ? typeof billTransaction.patient ===
                "object"
                ? billTransaction.patient._id
                : billTransaction.patient
              : billTransaction._id
          }
          onClose={() =>
            setBillTransaction(null)
          }
        />
      )}
    </div>
  );
}

export default function TransactionsListPage({
  Sidebar,
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50" />
      }
    >
      <AllTransactionsPageInner
        Sidebar={Sidebar}
      />
    </Suspense>
  );
}
