"use client";

import Link from "next/link";
import { useAiHealthBeacon } from "@/lib/ai/client/useAiHealthBeacon";

// Tiny topbar pill — see useAiHealthBeacon for the polling/fallback rule
// (also reused, compact, by OwnerSidebar's pinned "AI Health" nav item).
export default function AiStatusBeacon() {
  const beacon = useAiHealthBeacon();
  if (!beacon) return null;

  return (
    <Link href="/owner/ai/health" className={`ai-status-beacon ai-status-${beacon.tone}`}>
      <span className="ai-status-dot" aria-hidden="true" />
      {beacon.label}
    </Link>
  );
}
