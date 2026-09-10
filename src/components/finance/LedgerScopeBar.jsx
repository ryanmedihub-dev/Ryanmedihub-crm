"use client";

import { ALL_BRANCHES } from "@/lib/branches";
import DebouncedDateInput from "@/components/finance/DebouncedDateInput";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

/**
 * Branch select + from/to date range + Clear, lifted verbatim from the old assets/liabilities
 * pages so the markup is identical. `actions` is a right-aligned slot for per-page buttons
 * (Download Excel, Record Advance, …). Sticky so a long table never hides the date range.
 */
export default function LedgerScopeBar({ actions = null }) {
  const { scope, setScope, asOfLabel } = useLedgerScope();
  const dirty = scope.branch || scope.dateFrom || scope.dateTo;

  return (
    <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-gray-50/85 backdrop-blur border-b border-gray-200">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scope.branch}
          onChange={(e) => setScope({ branch: e.target.value })}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
        >
          <option value="">All branches</option>
          {ALL_BRANCHES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <DebouncedDateInput
          value={scope.dateFrom}
          onCommit={(v) => setScope({ dateFrom: v })}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
        />
        <span className="text-xs text-gray-400">to</span>
        <DebouncedDateInput
          value={scope.dateTo}
          onCommit={(v) => setScope({ dateTo: v })}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white shadow-sm"
        />
        {dirty ? (
          <button
            onClick={() => setScope({ branch: "", dateFrom: "", dateTo: "" })}
            className="text-xs font-medium text-indigo-700 hover:text-indigo-800"
          >
            Clear filters
          </button>
        ) : null}
        <span className="text-xs text-gray-400 hidden sm:inline">{asOfLabel}</span>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
