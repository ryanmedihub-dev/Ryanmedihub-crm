"use client";

import useSWR from "swr";
import { ownerFetch } from "@/lib/ownerFetch";

// SWR fetcher over the existing ownerFetch (keeps its 401/403/502 message mapping and
// { success:false, message } handling) instead of a second bespoke fetcher.
async function fetcher(url) {
  const r = await ownerFetch(url);
  if (!r.ok) {
    const err = new Error(r.error || "Request failed");
    err.status = r.status;
    throw err;
  }
  return r.data;
}

// One data hook for every owner GET. Pass `url: null` (e.g. filters not resolved yet) to skip
// the fetch — replaces the `if (!ready) return` guards the manual useEffect versions needed.
// Also replaces those effects' own AbortController + loading/error state with SWR's.
export function useOwnerData(url, options = {}) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(url, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
    ...options,
  });
  // Callers wire this straight into onClick={} / onRetry={} handlers (ErrorState's own onClick={onRetry}
  // included) — those pass the DOM event as the first arg, which SWR's mutate(data) would otherwise treat
  // as new cache data. Swallow arguments so a bare handler reference is always just "revalidate".
  const revalidate = () => mutate();
  return { data, error: error?.message || null, loading: isLoading, isValidating, mutate: revalidate };
}
