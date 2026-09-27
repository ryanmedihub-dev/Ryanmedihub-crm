"use client";

import useSWR from "swr";
import { ownerFetch } from "@/lib/ownerFetch";
import { stableScope } from "./useAiInsight";
import { isLongFeature } from "./featureMeta";

function cleanScope(scope) {
  const out = {};
  for (const [k, v] of Object.entries(scope || {})) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

async function postVerdicts(url, scope) {
  const r = await ownerFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  if (!r.ok) throw new Error(r.error || "AI verdicts request failed");
  return r.data;
}

export function useAiVerdicts(feature, scope, { enabled = true } = {}) {
  const cleanedScope = cleanScope(scope);
  const base = isLongFeature(feature) ? "/api/owner/ai/verdicts-long" : "/api/owner/ai/verdicts";
  const url = `${base}/${feature}`;
  const key = enabled && feature ? `${url}|${stableScope(cleanedScope)}` : null;

  const { data, error, isLoading } = useSWR(key, () => postVerdicts(url, cleanedScope), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  return {
    byId: data?.byId || {},
    loading: isLoading,
    status: data?.status || (error ? "error" : "idle"),
    cohortNote: data?.cohortNote || "",
    generatedAt: data?.generatedAt || null,
    cached: !!data?.cached,
  };
}
