"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

export function BasisTag({ children }) {
  return (
    <span className="inline-flex items-center h-5 px-1.5 text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded">
      {children}
    </span>
  );
}

/* A bordered surface whose cells are separated by hairlines instead of nested cards. */
export function KpiStrip({ cols, children, className = "" }) {
  return (
    <div
      className={`stagger grid grid-cols-1 sm:grid-cols-2 ${cols} gap-px bg-gray-100 border border-gray-200 rounded-xl overflow-hidden
        [&>*]:bg-white sm:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 ${className}`}
    >
      {children}
    </div>
  );
}

/* One figure inside a KpiStrip. size="lg" for the headline balances. */
export function KpiCell({ onDrill, title, value, subtitle, status = "ready", onRetry, size = "md", tone }) {
  const figure =
    status === "loading" ? (
      <span className={`block bg-gray-100 rounded animate-pulse ${size === "lg" ? "h-8 w-40 mt-1" : "h-6 w-28 mt-1"}`} />
    ) : status === "error" ? (
      <span className="flex items-center gap-2 text-sm">
        <span className="text-rose-600">Failed to load</span>
        {onRetry && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRetry(); } }}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Retry
          </span>
        )}
      </span>
    ) : (
      <span
        className={`block font-semibold tracking-tight tabular-nums whitespace-nowrap ${
          size === "lg" ? "text-[28px] leading-9" : "text-xl leading-7"
        } ${tone === "negative" ? "text-rose-700" : "text-gray-900"}`}
      >
        {value === null || value === undefined ? "—" : value}
      </span>
    );

  const inner = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-gray-500 truncate">{title}</span>
        {onDrill && (
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-gray-300 transition-colors duration-150 group-hover:text-gray-600" aria-hidden />
        )}
      </span>
      <span className="block mt-1.5">{figure}</span>
      {subtitle && <span className="block mt-1 text-xs leading-5 text-gray-500 truncate">{subtitle}</span>}
    </>
  );

  const pad = size === "lg" ? "px-5 py-5 sm:px-6" : "px-5 py-4";
  return onDrill ? (
    <button
      type="button"
      onClick={onDrill}
      className={`group block w-full min-w-0 text-left ${pad} transition-colors duration-150 hover:bg-gray-50/80 active:bg-gray-100/70 focus-visible:outline-offset-[-2px]`}
    >
      {inner}
    </button>
  ) : (
    <div className={`min-w-0 ${pad}`}>{inner}</div>
  );
}

/* Section heading used above strips: title, basis tag, optional "How it's calculated". */
export function SectionHead({ title, basis, aside, explain }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {basis && <BasisTag>{basis}</BasisTag>}
        {explain && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            How it&apos;s calculated
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ease-(--ease-out) ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
        {aside && <span className="ml-auto text-xs text-gray-400">{aside}</span>}
      </div>
      {explain && (
        <div className="expand" data-open={open}>
          <div>
            <p className="pt-2 text-xs leading-relaxed text-gray-500 max-w-3xl">{explain}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttentionRow({ label, count, amount, onDrill }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onDrill}
      className="group flex items-center gap-3 w-full px-5 py-3 text-left transition-colors duration-150 hover:bg-gray-50/80 active:bg-gray-100/70 focus-visible:outline-offset-[-2px]"
    >
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-gray-800 leading-5">{label}</span>
        {amount != null && <span className="block text-xs text-gray-500 tabular-nums leading-5">{formatCurrency(amount)}</span>}
      </span>
      <span className="text-sm font-semibold text-gray-900 tabular-nums">{count.toLocaleString("en-IN")}</span>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" aria-hidden />
    </button>
  );
}
