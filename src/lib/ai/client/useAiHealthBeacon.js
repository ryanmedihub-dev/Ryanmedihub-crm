"use client";

import { useEffect, useState } from "react";
import { hasRecentSuccess } from "./useAiInsight";

// Shared by AiStatusBeacon (topbar) and OwnerSidebar's pinned "AI Health" nav
// item — one poll, one fallback rule, instead of two copies drifting apart.
// `/api/owner/ai/health?lite=1` (Part 9, src/lib/ai/health.js computeLiteHealth)
// returns { status, lastOkAt, p50LatencyMs, budgetUsedPct }; status is one of
// online/degraded/paused/offline/disabled/unconfigured — used directly as the
// CSS tone suffix (.ai-status-<tone>).
const STATUS_LABEL = {
  online: "AI Online", degraded: "AI Degraded", paused: "AI Paused (budget)",
  offline: "AI Offline", disabled: "AI Disabled", unconfigured: "AI Not Configured",
};

export function useAiHealthBeacon() {
  const [beacon, setBeacon] = useState(null); // { label, tone } | null

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/owner/ai/health?lite=1");
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.success && !cancelled) {
            const p50s = data.p50LatencyMs ? ` · ${(data.p50LatencyMs / 1000).toFixed(1)}s` : "";
            const label = `${STATUS_LABEL[data.status] || "AI Offline"}${data.status === "online" ? p50s : ""}`;
            setBeacon({ label, tone: data.status || "offline" });
            return;
          }
        }
      } catch {
        /* health route unreachable — fall through to the local signal */
      }
      if (!cancelled) setBeacon(hasRecentSuccess() ? { label: "AI Online", tone: "online" } : null);
    }

    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return beacon;
}
