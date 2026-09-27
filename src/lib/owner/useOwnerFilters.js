"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_DATE_RANGE, buildDateRange } from "@/lib/owner/filters";

export function useOwnerFilters(defaults = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seed = useMemo(
    () => ({ range: DEFAULT_DATE_RANGE, branch: "All", from: "", to: "", ...defaults }),
    
    [JSON.stringify(defaults)],
  );

  const filters = useMemo(() => {
    const out = { ...seed };
    for (const key of Object.keys(seed)) {
      const v = searchParams.get(key);
      if (v !== null) out[key] = v;
    }
    return out;
  }, [searchParams, seed]);

  const write = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        
        if (value === undefined || value === null || value === "" || value === seed[key]) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, seed],
  );

  const setFilter = useCallback((key, value) => write({ [key]: value }), [write]);
  const setFilters = useCallback((patch) => write(patch), [write]);

  
  const range = useMemo(
    () => buildDateRange(filters.range, { from: filters.from, to: filters.to }),
    [filters.range, filters.from, filters.to],
  );

  return { filters, setFilter, setFilters, range };
}
