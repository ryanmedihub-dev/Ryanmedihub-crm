"use client";

import { formatCurrency } from "@/lib/financeUI";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

export default function LedgerMetrics({ items, loading = false }) {
  const { asOfLabel } = useLedgerScope();
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it) => (
          <div key={it.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{it.label}</p>
            {loading ? (
              <div className="h-6 w-20 bg-gray-100 rounded animate-pulse mt-1.5" />
            ) : (
              <p className={`text-lg font-bold mt-1 ${it.tone || "text-gray-900"}`}>
                {typeof it.value === "number" ? formatCurrency(it.value) : it.value}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">{asOfLabel}</p>
    </div>
  );
}
