import {
  Search,
  X,
  RefreshCw,
  Loader2,
  FileDown,
  Plus,
  Clock,
  SlidersHorizontal,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Package,
} from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { DATE_PRESETS, TRANSACTION_CATEGORIES } from "./transactionsHelpers";
import { SectionLabel } from "./TransactionBadges";

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

export function PageHeader({
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

export function KPIBar({ stats }) {
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

export function CategoryNavigation({
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

export function TransactionToolbar({
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
