"use client";

import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";

const RES_LABEL = {
  KEEP_BOTH_RELABEL: "Keep both — relabel the duplicate's payable",
  CANCEL_DUPLICATE: "Cancel the duplicate's payable (nothing paid on it)",
  MANUAL: "I'll fix these by hand first (blocks the merge)",
};

export default function ConflictResolver({ conflicts = [], value = {}, onChange }) {
  if (conflicts.length === 0) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        No conflicts — the two records can be merged directly.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {conflicts.map((c) => (
        <div key={c.key} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">
              Both hold a {c.purpose} payable for {c.period.month}/{c.period.year}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-gray-600">
            <div className="rounded-lg bg-white border border-gray-200 p-2">
              <p className="font-semibold text-gray-500">Survivor</p>
              <p>{formatCurrency(c.survivorDoc?.totalAmount)} · paid {formatCurrency(c.survivorDoc?.paid)}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-2">
              <p className="font-semibold text-gray-500">Duplicate</p>
              <p>{formatCurrency(c.duplicateDoc?.totalAmount)} · paid {formatCurrency(c.duplicateDoc?.paid)}</p>
            </div>
          </div>
          {c.periodLocked && (
            <p className="mt-2 text-[11px] font-semibold text-rose-600">
              This period is locked — the merge is blocked until it's reopened.
            </p>
          )}
          <div className="mt-3 space-y-1.5">
            {c.resolutions.map((r) => (
              <label key={r} className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name={c.key}
                  checked={value[c.key] === r}
                  onChange={() => onChange({ ...value, [c.key]: r })}
                  className="mt-0.5"
                />
                <span>{RES_LABEL[r] || r}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
