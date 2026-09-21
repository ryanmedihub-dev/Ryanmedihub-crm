import { AlertTriangle, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

export function BasisTag({ children }) {
  return (
    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

export function DashboardCard({ onDrill, title, basis, value, icon: Icon, color, subtitle, status = "ready", onRetry }) {
  const body = (
    <div
      className={`group relative bg-white rounded-2xl shadow-sm p-4 sm:p-6 transition-all duration-200 h-full text-left ${
        onDrill ? "hover:shadow-md hover:-translate-y-0.5" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg bg-linear-to-r ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {onDrill && (
          <ArrowUpRight className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-gray-600 text-sm font-medium">{title}</p>
        {basis && <BasisTag>{basis}</BasisTag>}
      </div>
      {status === "loading" ? (
        <div className="h-7 w-28 bg-gray-100 rounded animate-pulse mt-1" />
      ) : status === "error" ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-rose-600">Failed to load</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry?.();
            }}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <p className="text-xl font-bold text-gray-900">
          {value === null || value === undefined ? "No data for this period" : value}
        </p>
      )}
      {subtitle && <p className="text-xs text-gray-400 mt-1.5">{subtitle}</p>}
    </div>
  );
  return onDrill ? (
    <button
      type="button"
      onClick={onDrill}
      className="block h-full w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {body}
    </button>
  ) : (
    body
  );
}

export function AttentionRow({ label, count, amount, onDrill }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onDrill}
      className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">
          {count}
          {amount != null ? ` · ${formatCurrency(amount)}` : ""}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
      </div>
    </button>
  );
}
