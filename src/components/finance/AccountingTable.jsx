"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { STATUS_STYLES } from "@/lib/financeUI";
import { ALL_BRANCHES } from "@/lib/branches";

export default function AccountingTable({
  columns,
  rows = [],
  loading = false,
  filterConfig = {},
  filters = {},
  onFilterChange,
  pagination,
  onPageChange,
  emptyMessage = "No records match these filters",
  getRowKey = (row) => row._id || row.key,
  renderRowActions,
  onRowClick,
  urlSync = true,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState({
    search: filters.search || "",
    status: filters.status || "",
    category: filters.category || "",
    branch: filters.branch || "",
    dateFrom: filters.dateFrom || "",
    dateTo: filters.dateTo || "",
  });

  useEffect(() => {
    if (!urlSync) return;
    const fromUrl = {
      search: searchParams.get("q") || "",
      status: searchParams.get("status") || "",
      category: searchParams.get("cat") || "",
      branch: searchParams.get("branch") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    };
    const hasAny = Object.values(fromUrl).some(Boolean);
    if (hasAny) {
      setDraft(fromUrl);
      onFilterChange?.(fromUrl);
    }
  }, []);

  const writeUrl = useCallback(
    (next) => {
      if (!urlSync) return;
      const params = new URLSearchParams();
      if (next.search) params.set("q", next.search);
      if (next.status) params.set("status", next.status);
      if (next.category) params.set("cat", next.category);
      if (next.branch) params.set("branch", next.branch);
      if (next.dateFrom) params.set("dateFrom", next.dateFrom);
      if (next.dateTo) params.set("dateTo", next.dateTo);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, urlSync],
  );

  const apply = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    writeUrl(next);
    onFilterChange?.(next);
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      if (draft.search !== (filters.search || "")) apply({ search: draft.search });
    }, 400);
    return () => clearTimeout(handle);
  }, [draft.search]);

  const {
    showSearch = true,
    searchPlaceholder = "Search…",
    showStatus = false,
    statusOptions = [],
    showCategory = false,
    categoryLabel = "Category",
    categoryOptions = [],
    showBranch = true,
    showDateRange = true,
  } = filterConfig;

  const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={draft.search}
              onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        )}
        {showStatus && (
          <select
            value={draft.status}
            onChange={(e) => apply({ status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {showCategory && (
          <select
            value={draft.category}
            onChange={(e) => apply({ category: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">{categoryLabel}: all</option>
            {categoryOptions.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}
        {showBranch && (
          <select
            value={draft.branch}
            onChange={(e) => apply({ branch: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">All branches</option>
            {ALL_BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}
        {showDateRange && (
          <>
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => apply({ dateFrom: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => apply({ dateTo: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </>
        )}
      </div>

      <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide ${
                    c.numeric ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                </th>
              ))}
              {renderRowActions && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                  {renderRowActions && <td className="px-4 py-3" />}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (renderRowActions ? 1 : 0)} className="px-4 py-10 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={getRowKey(row) ?? `row-${idx}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`hover:bg-gray-50 ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 ${c.numeric ? "text-right font-medium" : ""}`}>
                      {c.render ? c.render(row) : c.numeric ? money(row[c.key]) : (row[c.key] ?? "—")}
                    </td>
                  ))}
                  {renderRowActions && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {renderRowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden space-y-2">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-1/3" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
            {emptyMessage}
          </div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={getRowKey(row) ?? `row-${idx}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`bg-white border border-gray-200 rounded-xl p-4 space-y-1.5 ${onRowClick ? "cursor-pointer active:bg-gray-50" : ""}`}
            >
              {columns.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-400 text-xs">{c.label}</span>
                  <span className={c.numeric ? "font-semibold text-gray-900" : "text-gray-700 text-right"}>
                    {c.render ? c.render(row) : c.numeric ? money(row[c.key]) : (row[c.key] ?? "—")}
                  </span>
                </div>
              ))}
              {renderRowActions && (
                <div className="pt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                  {renderRowActions(row)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {pagination && pagination.total > pagination.limit && (
        <div className="flex items-center justify-between text-sm text-gray-500 px-1">
          <span>
            Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pagination.limit))} ·{" "}
            {pagination.total.toLocaleString("en-IN")} records
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
              onClick={() => onPageChange?.(pagination.page + 1)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { STATUS_STYLES };
