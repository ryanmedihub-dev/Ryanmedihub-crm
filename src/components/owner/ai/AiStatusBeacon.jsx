"use client";

import Link from "next/link";
import { useAiHealthBeacon } from "@/lib/ai/client/useAiHealthBeacon";

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
