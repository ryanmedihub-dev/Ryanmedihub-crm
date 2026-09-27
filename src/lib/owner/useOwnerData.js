"use client";

import useSWR from "swr";
import { ownerFetch } from "@/lib/ownerFetch";

async function fetcher(url) {
  const r = await ownerFetch(url);
  if (!r.ok) {
    const err = new Error(r.error || "Request failed");
    err.status = r.status;
    throw err;
  }
  return r.data;
}

export function useOwnerData(url, options = {}) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(url, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 10_000,
    ...options,
  });
  
  
  
  const revalidate = () => mutate();
  return { data, error: error?.message || null, loading: isLoading, isValidating, mutate: revalidate };
}
