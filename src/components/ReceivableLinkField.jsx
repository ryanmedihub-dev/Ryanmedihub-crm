"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/financeUI";

const PURPOSE_LABELS = {
  PATIENT_DUE: "Patient Due",
  COLLAB_SETTLEMENT: "Collab Settlement",
  REFUND_DUE: "Refund Due",
  ADVANCE_RECOVERY: "Advance Recovery",
  OTHER: "Other",
};

function previewFifo(receivables, amount) {
  let remaining = Number(amount) || 0;
  const allocations = [];
  for (const r of receivables) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, r.pending);
    if (take <= 0) continue;
    allocations.push({ receivable: r, amount: take });
    remaining -= take;
  }
  return { allocations, unallocated: Math.max(0, remaining) };
}

export default function ReceivableLinkField({ patientId, amount, method, value, onChange }) {
  const [receivables, setReceivables] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId) {
      setReceivables([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ patientId });
    fetch(`/api/receivables/open?${params}`)
      .then((res) => res.json())
      .then((data) => setReceivables(data.receivables || []))
      .catch((error) => console.error("Error fetching open receivables for patient:", error))
      .finally(() => setLoading(false));
  }, [patientId]);

  const mode = value?.mode || "auto";
  const chosenId = value?.allocations?.[0]?.receivableId || "";

  useEffect(() => {
    if (mode === "manual" && chosenId) {
      onChange({ mode: "manual", allocations: [{ receivableId: chosenId, amount }] });
    }
  }, [amount]);

  if (method === "paid_to_external") return null;
  if (!patientId) return null;
  if (!loading && receivables.length === 0) return null;

  const { allocations: previewAllocations, unallocated } = previewFifo(receivables, amount);

  const setMode = (nextMode) => {
    if (nextMode === "auto") onChange(undefined);
    else if (nextMode === "none") onChange({ mode: "none" });
    else onChange({ mode: "manual", allocations: chosenId ? [{ receivableId: chosenId, amount }] : [] });
  };

  const setChosenReceivable = (receivableId) => {
    onChange(
      receivableId
        ? { mode: "manual", allocations: [{ receivableId, amount }] }
        : { mode: "manual", allocations: [] },
    );
  };

  return (
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Receivable Allocation{" "}
        <span className="text-gray-400 font-normal">
          ({loading ? "loading…" : `${receivables.length} open`})
        </span>
      </label>

      <div className="flex flex-wrap gap-4 mb-2 text-sm text-gray-700">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "auto"} onChange={() => setMode("auto")} />
          Auto (oldest first)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />
          Specific receivable
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "none"} onChange={() => setMode("none")} />
          Don&apos;t allocate
        </label>
      </div>

      {mode === "manual" && (
        <select
          value={chosenId}
          onChange={(e) => setChosenReceivable(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
        >
          <option value="">Select a receivable…</option>
          {receivables.map((r) => (
            <option key={r._id} value={r._id}>
              {PURPOSE_LABELS[r.purpose] || r.purpose} — {formatCurrency(r.pending)} pending
            </option>
          ))}
        </select>
      )}

      {mode === "auto" && previewAllocations.length > 0 && (
        <p className="text-xs text-gray-500 px-3 py-2 border border-dashed border-gray-200 rounded-lg">
          Will allocate{" "}
          {previewAllocations
            .map(
              (a) =>
                `${formatCurrency(a.amount)} → ${PURPOSE_LABELS[a.receivable.purpose] || a.receivable.purpose}`,
            )
            .join(", ")}
          {unallocated > 0 && ` — ${formatCurrency(unallocated)} left unallocated`}
        </p>
      )}
      {mode === "none" && (
        <p className="text-xs text-gray-400 px-3 py-2 border border-dashed border-gray-200 rounded-lg">
          This payment will not be linked to any receivable.
        </p>
      )}
    </div>
  );
}
