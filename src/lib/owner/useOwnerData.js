"use client";

import useSWR from "swr";
import { ownerFetch } from "@/lib/ownerFetch";

async function fetcher(key) {
  // A string key is a GET; a [url, body] pair is a POST whose body is part of
  // the cache key, so changing a filter is a different cache entry.
  const [url, body] = Array.isArray(key) ? key : [key, null];
  const init = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body }
    : undefined;

  const r = await ownerFetch(url, init);
  if (!r.ok) {
    const err = new Error(r.error || "Request failed");
    err.status = r.status;
    throw err;
  }
  return r.data;
}

/**
 * Cached data for an owner page. Passing `body` sends a POST and keys the cache
 * on it. A null/undefined `url` suspends the request (filters not resolved yet).
 */
export function useOwnerData(url, { body, ...options } = {}) {
  const key = !url ? null : body == null ? url : [url, JSON.stringify(body)];

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
    ...options,
  });

  const revalidate = () => mutate();
  return { data, error: error?.message || null, loading: isLoading, isValidating, mutate: revalidate };
}
