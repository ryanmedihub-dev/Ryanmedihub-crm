"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Filter, X, ChevronDown, Calendar, MapPin, SlidersHorizontal } from "lucide-react";
import { DATE_RANGES, OWNER_BRANCHES } from "@/lib/owner/filters";
import { useOwnerFilters } from "@/lib/owner/useOwnerFilters";

const DEBOUNCE_MS = 450;

// Reusable animated input wrapper with Tailwind styling
export function FilterControl({ ex, value, onCommit }) {
  const type = ex.type || "select";
  const id = `filter-${ex.key}`;

  const baseInputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 hover:border-slate-300";

  if (type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-semibold text-slate-500">
          {ex.label || ex.key}
        </label>
        <div className="relative">
          <select id={id} className={`${baseInputClass} appearance-none cursor-pointer`} value={value ?? ""} onChange={(e) => onCommit(e.target.value)}>
            <option value="" disabled hidden>
              Select {ex.label?.toLowerCase()}...
            </option>
            {(ex.options || []).map((o) => {
              const v = typeof o === "string" ? o : o.value;
              const label = typeof o === "string" ? o : o.label;
              return (
                <option key={v} value={v}>
                  {label}
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>
    );
  }

  if (type === "date") {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-semibold text-slate-500">
          {ex.label || ex.key}
        </label>
        <input type="date" id={id} className={baseInputClass} value={value || ""} onChange={(e) => onCommit(e.target.value)} />
      </div>
    );
  }

  // text / number — debounced
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [local, setLocal] = useState(value ?? "");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const timer = useRef(null);
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => setLocal(value ?? ""), [value]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500">
        {ex.label || ex.key}
      </label>
      <input
        type={type === "number" ? "number" : "text"}
        id={id}
        className={baseInputClass}
        placeholder={ex.placeholder || `Enter ${ex.label?.toLowerCase()}...`}
        value={local}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onCommit(v), DEBOUNCE_MS);
        }}
      />
    </div>
  );
}

export default function FilterBar({
  show = ["date", "branch"],
  extras = [],
  advancedExtras = [],
  defaults,
  onChange,
  children,
}) {
  const { filters, setFilter, setFilters, range } = useOwnerFilters(defaults);
  const [menuOpen, setMenuOpen] = useState(false);

  // Notify the page whenever the resolved filters/range change
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sig = JSON.stringify({ filters, range });
  
  useEffect(() => {
    onChangeRef.current?.({ filters, range });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const showDate = show.includes("date");
  const showBranch = show.includes("branch");

  // Calculate Active Filters for the badge and chips
  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.range && filters.range !== "Today") count++;
    if (filters.branch && filters.branch !== "All") count++;
    
    [...extras, ...advancedExtras].forEach((ex) => {
      if (filters[ex.key] && filters[ex.key] !== (defaults?.[ex.key] || "")) {
        count++;
      }
    });
    return count;
  }, [filters, extras, advancedExtras, defaults]);

  const clearAllFilters = () => {
    const resetPatch = {};
    [...extras, ...advancedExtras].forEach((ex) => {
      resetPatch[ex.key] = defaults?.[ex.key] || "";
    });
    
    if (showBranch) resetPatch.branch = defaults?.branch || "All";
    if (showDate) {
      resetPatch.range = defaults?.range || "Today";
      resetPatch.from = "";
      resetPatch.to = "";
    }
    setFilters(resetPatch);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Navbar / Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border ${
              menuOpen
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 ml-1 text-xs font-bold text-white bg-indigo-600 rounded-full">
                {activeCount}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          
          {/* Quick Active Chips Summary (Visible when menu is closed) */}
          {!menuOpen && activeCount > 0 && (
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="text-xs font-medium text-slate-500">Active:</span>
              {filters.range && filters.range !== "Today" && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-600 font-medium">
                  {filters.range}
                </span>
              )}
              {filters.branch && filters.branch !== "All" && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-600 font-medium">
                  {filters.branch}
                </span>
              )}
              {/* Note: In a real app you might want to map through extras here to show specific chips */}
              <button 
                onClick={clearAllFilters}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-1"
                title="Clear all filters"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Right side (Controls/Refresh) */}
        <div className="flex items-center gap-2">
          {children}
        </div>
      </div>

      {/* Expandable Nav Menu Panel */}
      {menuOpen && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Default / Core Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {showDate && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Date Range
                </label>
                <div className="relative">
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                    value={filters.range}
                    onChange={(e) => setFilter("range", e.target.value)}
                  >
                    {DATE_RANGES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {showDate && filters.range === "Custom" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">From Date</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                    value={filters.from || ""}
                    onChange={(e) => setFilter("from", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">To Date</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                    value={filters.to || ""}
                    onChange={(e) => setFilter("to", e.target.value)}
                  />
                </div>
              </>
            )}

            {showBranch && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Branch
                </label>
                <div className="relative">
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                    value={filters.branch}
                    onChange={(e) => setFilter("branch", e.target.value)}
                  >
                    {OWNER_BRANCHES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Main Extras */}
            {extras.map((ex) => (
              <FilterControl
                key={ex.key}
                ex={ex}
                value={filters[ex.key]}
                onCommit={(v) => setFilter(ex.key, v)}
              />
            ))}
          </div>

          {/* Advanced Extras Area */}
          {advancedExtras.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-slate-400" /> Advanced Filters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {advancedExtras.map((ex) => (
                  <FilterControl
                    key={ex.key}
                    ex={ex}
                    value={filters[ex.key]}
                    onCommit={(v) => setFilter(ex.key, v)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            {activeCount > 0 && (
              <button 
                onClick={clearAllFilters}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Clear All
              </button>
            )}
            <button 
              onClick={() => setMenuOpen(false)}
              className="px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors"
            >
              Apply & Close
            </button>
          </div>

        </div>
      )}
    </div>
  );
}