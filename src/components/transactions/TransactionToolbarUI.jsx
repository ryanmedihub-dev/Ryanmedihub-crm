import {
  Search,
  X,
  RefreshCw,
  Loader2,
  FileDown,
  Plus,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { buttonClass, inputClass } from "@/components/ui";
import { DATE_PRESETS, TRANSACTION_CATEGORIES } from "./transactionsHelpers";

export function PageHeader({
  refreshing,
  onRefresh,
  onExport,
  exporting,
  onCreate,
  hasExport,
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">Revenue, expenses and transfers across every branch.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={buttonClass("secondary", "icon")}
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {hasExport && (
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className={buttonClass("secondary")}
              title="Export every transaction matching the current filters"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 text-gray-500" />}
              <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export"}</span>
            </button>
          )}

          <button type="button" onClick={onCreate} className={buttonClass("primary")}>
            <Plus className="w-4 h-4" />
            New transaction
          </button>
        </div>
      </div>
    </header>
  );
}

function KPIItem({ label, value, count }) {
  return (
    <div className="min-w-0 bg-white px-5 py-4">
      <p className="text-[13px] font-medium text-gray-500 truncate">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-gray-900 tabular-nums whitespace-nowrap">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500 tabular-nums">
        {count.toLocaleString("en-IN")} {count === 1 ? "transaction" : "transactions"}
      </p>
    </div>
  );
}

export function KPIBar({ stats }) {
  const items = [
    ["Total activity", stats.ALL],
    ["Transplant revenue", stats.TRANSPLANT],
    ["Service revenue", stats.SERVICE],
    ["Medicine revenue", stats.MEDICINE],
    ["Expenses", stats.EXPENSE],
  ];
  return (
    <div className="stagger grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100 border border-gray-200 rounded-xl overflow-hidden mb-6 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
      {items.map(([label, s]) => (
        <KPIItem key={label} label={label} value={formatCurrency(s?.total || 0)} count={s?.count || 0} />
      ))}
    </div>
  );
}

/* Underline tabs: the indicator is a border colour change, no layout shift. */
export function CategoryNavigation({ activeCategory, stats, onChange }) {
  return (
    <div role="tablist" aria-label="Transaction type" className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px">
      {TRANSACTION_CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const active = activeCategory === cat.value;
        return (
          <button
            key={cat.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(cat.value)}
            className={`group flex items-center gap-2 h-11 px-3 border-b-2 text-sm whitespace-nowrap transition-colors duration-150 ${
              active
                ? "border-indigo-600 text-gray-900 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-500"}`} />
            {cat.label}
            {stats[cat.value] && (
              <span className={`text-xs tabular-nums ${active ? "text-gray-500" : "text-gray-400"}`}>
                {stats[cat.value].count || 0}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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
    <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-white flex flex-col lg:flex-row gap-3 lg:items-center">
      <div className="relative w-full lg:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search patient, transaction ID, expense…"
          aria-label="Search transactions"
          className={inputClass(false, "pl-9 pr-9")}
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <div role="group" aria-label="Date range" className="inline-flex h-9 p-0.5 rounded-lg border border-gray-200 bg-gray-50">
          {DATE_PRESETS.map((preset) => {
            const on = activeDatePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={on}
                onClick={() => onDatePreset(preset.key)}
                className={`px-3 rounded-md text-[13px] whitespace-nowrap transition-colors duration-150 ${
                  on ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {activeCategory === "EXPENSE" && (
          <button
            type="button"
            onClick={onPendingToggle}
            aria-pressed={pendingOnly}
            className={buttonClass("secondary", "md", pendingOnly ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50" : "")}
          >
            <Clock className="w-4 h-4" />
            Pending
          </button>
        )}

        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={showFilters}
          className={buttonClass("secondary", "md", showFilters ? "border-gray-300 bg-gray-50" : "")}
        >
          <SlidersHorizontal className="w-4 h-4 text-gray-500" />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[11px] font-semibold tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button type="button" onClick={onClear} className={buttonClass("ghost")}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
