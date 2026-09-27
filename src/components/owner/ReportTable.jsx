"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { DEFAULT_PAGE_SIZE } from "@/lib/owner/pagination";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function toCsvValue(col, row) {
  let v;
  if (typeof col.csv === "function") v = col.csv(row);
  else v = row[col.key];
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, columns, rows) {
  const header = columns.map((c) => toCsvValue({ key: "__h", csv: () => c.label || c.key }, {})).join(",");
  const body = rows.map((r) => columns.map((c) => toCsvValue(c, r)).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportTable({
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
    if (Array.isArray(stored)) {
      setHidden(new Set(stored));
    } else {
      setHidden(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
    }
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
    <div className="report-table">
      <div className="report-table-toolbar">
        {onSearchChange && (
          <input
            className="control search"
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        )}

        <div className="report-table-toolbar-right">
          {toolbar}

          <div className="col-menu-wrap">
            <button
              type="button"
              className="btn"
              aria-expanded={colMenuOpen}
              onClick={() => setColMenuOpen((o) => !o)}
            >
              Columns
            </button>
            {colMenuOpen && (
              <>
                <div className="col-menu-scrim" onClick={() => setColMenuOpen(false)} />
                <div className="col-menu" role="menu">
                  {columns.map((c) => (
                    <label key={c.key} className="col-menu-item">
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.key)}
                        onChange={() => toggleCol(c.key)}
                      />
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
            onClick={() =>
              downloadCsv(csvFilename || `${tableId}.csv`, visibleColumns, rows)
            }
          >
            Export CSV
          </button>
        </div>
      </div>

      <DataTable
        tall={tall}
        loading={loading}
        emptyMessage={
          emptyMessage || <EmptyState icon="◍" title="No rows" hint="Nothing matches the current filters." />
        }
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        onRowClick={onRowClick}
        columns={visibleColumns}
        rows={loading ? [] : rows}
      />

      {onPageChange && (
        <div className="report-table-pager">
          <span className="muted">
            {loading ? "Loading…" : `${from}–${to} of ${total}`}
          </span>

          <div className="report-table-pager-controls">
            {onPageSizeChange && (
              <select
                className="control"
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn"
              disabled={loading || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              ‹ Prev
            </button>
            <span className="muted">Page {page} / {totalPages}</span>
            <button
              type="button"
              className="btn"
              disabled={loading || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
