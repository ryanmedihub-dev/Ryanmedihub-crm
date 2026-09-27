"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractStringField } from "./partialJson";
import { isLongFeature } from "./featureMeta";

const CACHE_TTL_MS = 5 * 60 * 1000;
const memoryCache = new Map();

export function hasRecentSuccess() {
  for (const { at } of memoryCache.values()) {
    if (Date.now() - at < CACHE_TTL_MS) return true;
  }
  return false;
}

export function stableScope(scope) {
  const keys = Object.keys(scope || {})
    .filter((k) => scope[k] !== undefined && scope[k] !== null && scope[k] !== "")
    .sort();
  return JSON.stringify(keys.map((k) => [k, scope[k]]));
}

function cleanScope(scope) {
  const out = {};
  for (const [k, v] of Object.entries(scope || {})) {
    if (v !== undefined && v !== null && v !== "") out[k] = String(v);
  }
  return out;
}

const IDLE_STAGES = { collect: null, compute: null, analyze: null, verify: null };

function idleState() {
  return {
    status: "idle", stages: IDLE_STAGES, partial: { headline: "", summary: "" },
    result: null, entities: null, facts: null, grounding: null, meta: null,
    cached: false, stale: false, generatedAt: null, error: null,
  };
}

export function useAiInsight(feature, scope, { kind = "brief", enabled = true } = {}) {
  const scopeKey = stableScope(scope);
  const cacheKey = `${feature}|${kind}|${scopeKey}`;

  const [state, setState] = useState(() => {
    const hit = memoryCache.get(cacheKey);
    const fresh = hit && Date.now() - hit.at < CACHE_TTL_MS;
    return fresh ? { ...idleState(), status: "ready", ...hit.payload, cached: true } : idleState();
  });

  const abortRef = useRef(null);
  const forceRef = useRef(false);
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  const run = useCallback(() => {
    if (!enabled || !feature) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const force = forceRef.current;
    forceRef.current = false;

    setState((s) => ({ ...s, status: "running", stages: IDLE_STAGES, partial: { headline: "", summary: "" }, error: null }));

    const params = new URLSearchParams();
    params.set("kind", kind);
    if (force) params.set("force", "1");
    for (const [k, v] of Object.entries(cleanScope(scope))) params.set(k, v);

    let deltaBuffer = "";
    const thisKey = cacheKey;

    (async () => {
      try {
        const base = isLongFeature(feature) ? "/api/owner/ai/insight-long" : "/api/owner/ai/insight";
        const res = await fetch(`${base}/${feature}?${params.toString()}`, { signal: controller.signal });
        
        
        
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || `Request failed (HTTP ${res.status})`);
        }
        if (!res.body) throw new Error("No response stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue; 
            let event;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            handleEvent(event);
          }
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        setState((s) => ({ ...s, status: "error", error: err?.message || "AI request failed" }));
      }
    })();

    function handleEvent(event) {
      if (event.type === "status") {
        setState((s) => ({ ...s, status: event.status }));
        return;
      }
      if (event.type === "stage") {
        setState((s) => ({ ...s, stages: { ...s.stages, [event.stage]: { state: event.state, ms: event.ms } } }));
        return;
      }
      if (event.type === "delta") {
        deltaBuffer += event.text;
        const headline = extractStringField(deltaBuffer, "headline");
        const summary = extractStringField(deltaBuffer, "summary");
        setState((s) => ({ ...s, status: "running", partial: { headline: headline ?? s.partial.headline, summary: summary ?? s.partial.summary } }));
        return;
      }
      if (event.type === "error") {
        setState((s) => ({ ...s, status: event.code || "error", error: event.message }));
        return;
      }
      if (event.type === "done") {
        const generatedAt = event.generatedAt || event.meta?.generatedAt || null;
        const payload = { result: event.output, entities: event.entities, facts: event.facts, grounding: event.grounding, meta: event.meta, generatedAt };
        memoryCache.set(thisKey, { at: Date.now(), payload });
        setState((s) => ({
          ...s, status: event.status || "ready", ...payload,
          cached: !!event.cached, stale: !!event.stale, error: null,
        }));
      }
    }
    
  }, [feature, kind, scopeKey, enabled]);

  useEffect(() => {
    if (!enabled || !feature) return;
    const hit = memoryCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) setState((s) => ({ ...s, status: "ready", ...hit.payload, cached: true }));
    run();
    return () => abortRef.current?.abort();
    
  }, [feature, kind, scopeKey, enabled]);

  const refresh = useCallback(() => {
    forceRef.current = true;
    run();
  }, [run]);

  const vote = useCallback(
    async (dir) => {
      if (!feature) return;
      try {
        await fetch(`/api/owner/ai/insight/${feature}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, scope: cleanScope(scope), vote: dir }),
        });
      } catch {
        
      }
    },
    [feature, kind, scope],
  );

  
  
  
  
  const poll = useCallback(() => run(), [run]);

  return { ...state, refresh, poll, vote };
}
