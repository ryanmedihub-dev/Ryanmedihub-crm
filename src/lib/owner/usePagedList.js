"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/owner/pagination";

// Page/sort/search state for a server-paginated ReportTable. The API does the
// sorting and slicing (src/lib/owner/pagination.js); this hook only holds the
// request state and resets to page 1 whenever anything that reorders the list
// changes, so a stale page number can never point past the end.
//
//   const list = usePagedList({ defaultSort: "total", defaultDir: "desc" });
//   ... ownerFetch(`/api/x?${base}&${list.query}`)
//   <ReportTable {...list.tableProps} rows={...} total={data.total} />
export function usePagedList({ defaultSort = "name", defaultDir = "asc", pageSize: initialPageSize = DEFAULT_PAGE_SIZE } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sortDir, setSortDir] = useState(defaultDir);
  const [search, setSearch] = useState("");

  const onSort = useCallback((key) => {
    setPage(1);
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const onSearchChange = useCallback((v) => {
    setPage(1);
    setSearch(v);
  }, []);

  const onPageSizeChange = useCallback((n) => {
    setPage(1);
    setPageSize(n);
  }, []);

  // Call when filters outside the table change (date range, branch) so the
  // new result set is read from its first page.
  const resetPage = useCallback(() => setPage(1), []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    p.set("sortBy", sortKey);
    p.set("sortDir", sortDir);
    if (search) p.set("search", search);
    return p.toString();
  }, [page, pageSize, sortKey, sortDir, search]);

  const tableProps = {
    page, pageSize, sortKey, sortDir, search,
    onSort, onSearchChange, onPageChange: setPage, onPageSizeChange,
  };

  return { page, pageSize, sortKey, sortDir, search, query, tableProps, resetPage };
}
