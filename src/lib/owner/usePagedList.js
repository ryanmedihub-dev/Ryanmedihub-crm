"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/owner/pagination";

export function usePagedList({ defaultSort = "name", defaultDir = "asc", dirForKey, pageSize: initialPageSize = DEFAULT_PAGE_SIZE } = {}) {
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
      setSortDir(dirForKey?.(key) === "desc" ? "desc" : "asc");
      return key;
    });
  }, [dirForKey]);

  const onSearchChange = useCallback((v) => {
    setPage(1);
    setSearch(v);
  }, []);

  const onPageSizeChange = useCallback((n) => {
    setPage(1);
    setPageSize(n);
  }, []);

  
  
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
