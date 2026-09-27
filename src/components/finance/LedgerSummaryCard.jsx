"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { useLedgerScope } from "@/components/finance/LedgerScopeProvider";

const TONE = {
  indigo: "text-indigo-600 bg-indigo-50",
  orange: "text-orange-600 bg-orange-50",
  emerald: "text-emerald-600 bg-emerald-50",
  rose: "text-rose-600 bg-rose-50",
  amber: "text-amber-600 bg-amber-50",
  violet: "text-violet-600 bg-violet-50",
  teal: "text-teal-600 bg-teal-50",
};

export default function LedgerSummaryCard({
  href,
  label,
  amount,
  count,
  description,
  icon: Icon,
  tone = "indigo",
  loading = false,
}) {
  const { scopeQS } = useLedgerScope();
  const qs = scopeQS();
  const toneCls = TONE[tone] || TONE.indigo;

  return (
    <Link
      href={qs ? `${href}?${qs}` : href}
      className="group bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon ? (
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${toneCls}`}>
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
              {label}
            </p>
          </div>
          {loading ? (
            <div className="h-8 w-32 bg-gray-100 rounded animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(amount)}</p>
          )}
          {description ? (
            <p className="text-xs text-gray-400 mt-1">{description}</p>
          ) : null}
          {count != null ? (
            <p className="text-[11px] text-gray-400 mt-1">
              {count} {count === 1 ? "record" : "records"}
            </p>
          ) : null}
        </div>
        <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 shrink-0" />
      </div>
    </Link>
  );
}
