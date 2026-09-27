"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, X, ChevronDown, SlidersHorizontal } from "lucide-react";
import DataTable from "./DataTable";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { FilterControl } from "./FilterBar";
import { downloadCsv } from "./ReportTable";
import { DATE_RANGES, OWNER_BRANCHES } from "@/lib/owner/filters";
import { useOwnerFilters } from "@/lib/owner/useOwnerFilters";
import { DEFAULT_PAGE_SIZE } from "@/lib/owner/pagination";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function optionLabel(ex, raw) {
  const opt = (ex.options || []).find((o) => (typeof o === "string" ? o : o.value) === raw);
  if (!opt) return raw;
  return typeof opt === "string" ? opt : opt.label;
}

export default function ReportPanel({
  title,
  subtitle,
  show = ["date", "branch"],
  extras = [],
  advancedExtras = [],
  defaults,
  onChange,
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
  searchPlaceholder = "Search…",
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
  const [open, setOpen] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sig = JSON.stringify({ filters, range });
  useEffect(() => {
    onChangeRef.current?.({ filters, range });
    
  }, [sig]);

  const showDate = show.includes("date");
  const showBranch = show.includes("branch");
  const allExtras = useMemo(() => [...extras, ...advancedExtras], [extras, advancedExtras]);

  const chips = useMemo(() => {
    const list = [];
    if (showDate && filters.range && filters.range !== (defaults?.range || "Today")) {
      list.push({
        key: "range",
        label: filters.range === "Custom" && filters.from && filters.to ? `${filters.from} → ${filters.to}` : filters.range,
        reset: () => setFilters({ range: defaults?.range || "Today", from: "", to: "" }),
      });
    }
    if (showBranch && filters.branch && filters.branch !== (defaults?.branch || "All")) {
      list.push({ key: "branch", label: filters.branch, reset: () => setFilter("branch", defaults?.branch || "All") });
    }
    allExtras.forEach((ex) => {
      const v = filters[ex.key];
      const def = defaults?.[ex.key] ?? "";
      if (v && v !== def) {
        list.push({
          key: ex.key,
          label: `${ex.label || ex.key}: ${ex.type === "select" ? optionLabel(ex, v) : v}`,
          reset: () => setFilter(ex.key, def),
        });
      }
    });
    return list;
  }, [filters, showDate, showBranch, allExtras, defaults, setFilter, setFilters]);

  const clearAll = () => {
    const patch = {};
    allExtras.forEach((ex) => {
      patch[ex.key] = defaults?.[ex.key] ?? "";
    });
    if (showBranch) patch.branch = defaults?.branch || "All";
    if (showDate) {
      patch.range = defaults?.range || "Today";
      patch.from = "";
      patch.to = "";
    }
    setFilters(patch);
  };

  
  const storageKey = `owner-cols:${tableId}`;
  const [hidden, setHidden] = useState(() => new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      stored = null;
    }
    setHidden(Array.isArray(stored) ? new Set(stored) : new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
    hydrated.current = true;
    
  }, [storageKey]);

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

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  return (
    <div className="card">
      {(title || subtitle) && (
        <div className="card-title">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
      )}

      <div className="filter-panel">
        <div className="filter-panel-bar">
          <div className="filter-panel-left">
            <button type="button" className="filter-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Filter size={14} />
              <span>Filters</span>
              {chips.length > 0 && <span className="filter-count">{chips.length}</span>}
              <ChevronDown size={14} />
            </button>

            {!open && chips.length > 0 && (
              <div className="filter-chips">
                {chips.map((c) => (
                  <span key={c.key} className="filter-chip">
                    {c.label}
                    <button type="button" onClick={c.reset} aria-label={`Clear ${c.label}`}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <button type="button" className="filter-clear" onClick={clearAll}>
                  Reset
                </button>
              </div>
            )}
          </div>

          <div className="report-table-toolbar-right">
            {onSearchChange && (
              <input
                className="control search"
                type="search"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            )}
            {toolbar}
            <div className="col-menu-wrap">
              <button type="button" className="btn" aria-expanded={colMenuOpen} onClick={() => setColMenuOpen((o) => !o)}>
                Columns
              </button>
              {colMenuOpen && (
                <>
                  <div className="col-menu-scrim" onClick={() => setColMenuOpen(false)} />
                  <div className="col-menu" role="menu">
                    {columns.map((c) => (
                      <label key={c.key} className="col-menu-item">
                        <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} />
                        <span>{c.label || c.key}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              className="btn"
              disabled={loading || rows.length === 0}
              onClick={() => downloadCsv(csvFilename || `${tableId}.csv`, visibleColumns, rows)}
            >
              Export CSV
            </button>
          </div>
        </div>

        {open && (
          <div className="filter-panel-body">
            <div className="filter-grid">
              {showDate && (
                <div className="filter-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Date range</span>
                  <div className="filter-pills">
                    {DATE_RANGES.map((r) => (
                      <button key={r} type="button" className="filter-pill" aria-pressed={filters.range === r} onClick={() => setFilter("range", r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showDate && filters.range === "Custom" && (
                <>
                  <label className="filter-field">
                    <span>From date</span>
                    <input type="date" className="control" value={filters.from || ""} onChange={(e) => setFilter("from", e.target.value)} />
                  </label>
                  <label className="filter-field">
                    <span>To date</span>
                    <input type="date" className="control" value={filters.to || ""} onChange={(e) => setFilter("to", e.target.value)} />
                  </label>
                </>
              )}

              {showBranch && (
                <label className="filter-field">
                  <span>Branch</span>
                  <select className="control" value={filters.branch} onChange={(e) => setFilter("branch", e.target.value)}>
                    {OWNER_BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {extras.map((ex) => (
                <FilterControl key={ex.key} ex={ex} value={filters[ex.key]} onCommit={(v) => setFilter(ex.key, v)} />
              ))}
            </div>

            {advancedExtras.length > 0 && (
              <div className="filter-panel-advanced">
                <div className="filter-panel-advanced-head">
                  <SlidersHorizontal size={14} /> More filters
                </div>
                <div className="filter-grid">
                  {advancedExtras.map((ex) => (
                    <FilterControl key={ex.key} ex={ex} value={filters[ex.key]} onCommit={(v) => setFilter(ex.key, v)} />
                  ))}
                </div>
              </div>
            )}

            <div className="filter-panel-foot">
              {chips.length > 0 && (
                <button type="button" className="btn" onClick={clearAll}>
                  Reset all
                </button>
              )}
              <button type="button" className="primary" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <DataTable
        tall={tall}
        loading={loading}
        emptyMessage={emptyMessage || <EmptyState icon="◍" title="No rows found" hint="Nothing matches the current filters." />}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        onRowClick={onRowClick}
        columns={visibleColumns}
        rows={loading ? [] : rows}
      />

      {onPageChange && (
        <div className="report-table-pager">
          <span className="muted">{loading ? "Loading…" : `${from}–${to} of ${total}`}</span>
          <div className="report-table-pager-controls">
            {onPageSizeChange && (
              <select className="control" aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
              ‹ Prev
            </button>
            <span className="muted">
              Page {page} / {totalPages}
            </span>
            <button type="button" className="btn" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)}>
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
