import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export function EmptyState({ hasFilters }) {
  return (
    <div className="py-20 px-6 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Search className="w-6 h-6 text-slate-400" />
      </div>

      <h3 className="font-bold text-slate-900">
        No transactions found
      </h3>

      <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
        {hasFilters
          ? "Try changing or clearing your filters to see more records."
          : "There are no transactions available for this period."}
      </p>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  perPage,
  total,
  startIdx,
  endIdx,
  setPage,
  setPerPage,
}) {
  return (
    <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-center justify-between">
      <p className="text-xs sm:text-sm text-slate-500">
        Showing{" "}
        <span className="font-semibold text-slate-800">
          {total === 0 ? 0 : startIdx + 1}–{endIdx}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-slate-800">
          {total.toLocaleString()}
        </span>
      </p>

      <div className="flex items-center gap-2">
        <select
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setPage(1);
          }}
          className="h-9 px-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white outline-none"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>

        <button
          disabled={page <= 1}
          onClick={() =>
            setPage((p) => Math.max(1, p - 1))
          }
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="px-2 text-xs font-semibold text-slate-600">
          {page} / {pages}
        </span>

        <button
          disabled={page >= pages}
          onClick={() =>
            setPage((p) =>
              Math.min(pages, p + 1)
            )
          }
          className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
