"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Filter,
  ChevronDown,
  Calendar,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import DataTable from "./DataTable";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { FilterControl } from "./FilterBar";
import { downloadCsv } from "./ReportTable";
import { DATE_RANGES, OWNER_BRANCHES } from "@/lib/owner/filters";
import { useOwnerFilters } from "@/lib/owner/useOwnerFilters";
import { DEFAULT_PAGE_SIZE } from "@/lib/owner/pagination";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const Icons = {
  Search: () => (
    <svg
      className="w-4 h-4 text-slate-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  Settings: () => (
    <svg
      className="w-4 h-4 mr-2"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
      />
    </svg>
  ),
  Download: () => (
    <svg
      className="w-4 h-4 mr-2"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  ),
  ChevronLeft: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15 19l-7-7 7-7"
      />
    </svg>
  ),
  ChevronRight: () => (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 5l7 7-7 7"
      />
    </svg>
  ),
};

export default function ReportPanel({
  title,
  subtitle,
  // filters (same contract as FilterBar)
  show = ["date", "branch"],
  extras = [],
  advancedExtras = [],
  defaults,
  onChange,
  // table (same contract as ReportTable)
  tableId = "owner-table",
  columns = [],
  rows = [],
  loading = false,
  error = null,
  onRetry,
  sortKey,
  sortDir,
  onSort,
  search = "",
  onSearchChange,
  searchPlaceholder = "Search records...",
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  total = 0,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  emptyMessage,
  csvFilename,
  toolbar,
  tall = true,
}) {
  const { filters, setFilter, setFilters, range } = useOwnerFilters(defaults);
  const [menuOpen, setMenuOpen] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sig = JSON.stringify({ filters, range });
  useEffect(() => {
    onChangeRef.current?.({ filters, range });
  }, [sig]);

  const showDate = show.includes("date");
  const showBranch = show.includes("branch");

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

  // --- column visibility (persisted per tableId, same as ReportTable) ---
  const storageKey = `owner-cols:${tableId}`;
  const [hidden, setHidden] = useState(() => new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      setHidden(
        Array.isArray(stored)
          ? new Set(stored)
          : new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
      );
    } catch {
      setHidden(
        new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
      );
    }
    hydrated.current = true;
  }, [storageKey, columns]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {}
  }, [hidden, storageKey]);

  const toggleCol = (key) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden],
  );

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  return (
    <div className="flex flex-col w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* --- Unified toolbar: filter toggle/chips on the left, table controls on the right --- */}
      <div className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 bg-slate-50/50">
        {(title || subtitle) && (
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center w-full sm:w-auto gap-4 sm:gap-2">
            {title && (
              <h3 className="text-2xl font-semibold text-slate-900">{title}</h3>
              
            )}
            {subtitle && (
              <p className="text-sm font-bold text-slate-500 mt-0.5"> ( {subtitle} )</p>
            )}
            
          </div>
        )}

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
          <div className="flex items-center gap-3 flex-wrap">
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
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {!menuOpen && activeCount > 0 && (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-xs font-medium text-slate-500">
                  Active:
                </span>
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

          {onSearchChange && (
            <div className="relative w-full sm:w-auto sm:max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Icons.Search />
              </div>
              <input
                type="search"
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm placeholder-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          )}

          {toolbar}

          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center px-3 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              aria-expanded={colMenuOpen}
              onClick={() => setColMenuOpen((o) => !o)}
            >
              <Icons.Settings />
              Columns
            </button>

            {colMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setColMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20 py-1 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                    Toggle Columns
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {columns.map((c) => (
                      <label
                        key={c.key}
                        className="flex items-center px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                          checked={!hidden.has(c.key)}
                          onChange={() => toggleCol(c.key)}
                        />
                        <span className="ml-3 font-medium select-none">
                          {c.label || c.key}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="inline-flex items-center px-3 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={loading || rows.length === 0}
            onClick={() =>
              downloadCsv(csvFilename || `${tableId}.csv`, visibleColumns, rows)
            }
          >
            <Icons.Download />
            Export
          </button>
        </div>
      </div>

      {/* --- Expandable filter panel --- */}
      {menuOpen && (
        <div className="p-5 border-b border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
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
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {showDate && filters.range === "Custom" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">
                    From Date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                    value={filters.from || ""}
                    onChange={(e) => setFilter("from", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">
                    To Date
                  </label>
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
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {extras.map((ex) => (
              <FilterControl
                key={ex.key}
                ex={ex}
                value={filters[ex.key]}
                onCommit={(v) => setFilter(ex.key, v)}
              />
            ))}
          </div>

          {advancedExtras.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />{" "}
                Advanced Filters
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

      {/* --- Data Table --- */}
      <div className="flex-1 w-full overflow-x-auto">
        <DataTable
          tall={tall}
          loading={loading}
          emptyMessage={
            emptyMessage || (
              <EmptyState
                icon="◍"
                title="No rows found"
                hint="We couldn't find anything matching your current filters."
              />
            )
          }
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          onRowClick={onRowClick}
          columns={visibleColumns}
          rows={loading ? [] : rows}
        />
      </div>

      {/* --- Pagination Footer --- */}
      {onPageChange && (
        <div className="px-4 py-3 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-500 font-medium">
            {loading ? (
              "Loading records..."
            ) : (
              <>
                Showing <span className="text-slate-900">{from}</span> to{" "}
                <span className="text-slate-900">{to}</span> of{" "}
                <span className="text-slate-900">{total}</span> results
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500 hidden sm:block">
                  Rows per page:
                </label>
                <select
                  className="pl-3 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 mr-2">
                Page {page} of {totalPages}
              </span>
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  type="button"
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:bg-slate-100 transition-colors"
                  disabled={loading || page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  <span className="sr-only">Previous</span>
                  <Icons.ChevronLeft />
                </button>
                <button
                  type="button"
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:bg-slate-100 transition-colors"
                  disabled={loading || page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  <span className="sr-only">Next</span>
                  <Icons.ChevronRight />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
