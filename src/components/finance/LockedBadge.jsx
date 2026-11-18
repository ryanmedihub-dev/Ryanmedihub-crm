"use client";

import { Lock } from "lucide-react";

export default function LockedBadge({ reason }) {
  return (
    <span
      title={reason || "This period is closed"}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
    >
      <Lock className="w-3 h-3" /> Locked
    </span>
  );
}
