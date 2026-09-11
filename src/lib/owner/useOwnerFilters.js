"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_DATE_RANGE, buildDateRange } from "@/lib/owner/filters";

// Owner-panel filter state that lives in the URL query string (Owner Panel v2, F3)
// so a filtered view is bookmarkable/shareable and the back button steps through
// filter changes — not just React state.
//
//   const { filters, setFilter, setFilters, range } = useOwnerFilters();
//   // filters.range / filters.branch / filters.from / filters.to / ...extras
//   // range === { from, to } ISO window derived from the preset (or custom dates)
//
// `defaults` seeds any key absent from the URL (e.g. { branch: "All" }).

export function useOwnerFilters(defaults = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seed = useMemo(
    () => ({ range: DEFAULT_DATE_RANGE, branch: "All", from: "", to: "", ...defaults }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Drop a key from the URL when it equals its default — keeps links tidy.
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

  // The resolved [from, to] ISO window for the active preset / custom dates.
  const range = useMemo(
    () => buildDateRange(filters.range, { from: filters.from, to: filters.to }),
    [filters.range, filters.from, filters.to],
  );

  return { filters, setFilter, setFilters, range };
}
