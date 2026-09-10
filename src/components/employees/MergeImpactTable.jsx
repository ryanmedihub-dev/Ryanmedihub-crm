"use client";

import { formatCurrency } from "@/lib/financeUI";

/** The reference-repoint table + finance before/after for the merge impact step. */
export default function MergeImpactTable({ references = [], totalReferences = 0, finance }) {
  const nonZero = references.filter((r) => r.count > 0);
  const zero = references.filter((r) => r.count === 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-2xl font-bold text-gray-900">
          {totalReferences} reference{totalReferences === 1 ? "" : "s"} will be repointed
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Every document below stops pointing at the duplicate and points at the survivor. Denormalised
          names refresh to the survivor&apos;s.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Path</th>
                <th className="py-2 pr-4 text-right">Count</th>
                <th className="py-2">Sample</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {nonZero.map((r) => (
                <tr key={`${r.model}.${r.path}`}>
                  <td className="py-2 pr-4 font-medium text-gray-800">{r.model}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">{r.path}</td>
                  <td className="py-2 pr-4 text-right font-semibold tabular-nums">{r.count}</td>
                  <td className="py-2 text-xs text-gray-500 truncate max-w-xs">
                    {(r.sample || []).slice(0, 2).map((s) => s.label).filter(Boolean).join(", ")}
                    {r.count > 2 ? ` +${r.count - 2}` : ""}
                  </td>
                </tr>
              ))}
              {nonZero.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-sm text-gray-400">
                    The duplicate has no references — a clean merge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {zero.length > 0 && (
          <p className="mt-2 text-[11px] text-gray-400">
            No references on: {zero.map((r) => `${r.model}.${r.path}`).join(" · ")}
          </p>
        )}
      </div>

      {finance && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Finance impact</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="py-2 pr-4">Figure</th>
                  <th className="py-2 pr-4 text-right">Survivor</th>
                  <th className="py-2 pr-4 text-right">Duplicate</th>
                  <th className="py-2 text-right">After merge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  ["Total payable", "totalPayable"],
                  ["Paid", "paid"],
                  ["Pending", "pending"],
                  ["Salary payable", "salaryPayable"],
                  ["Incentive payable", "incentivePayable"],
                  ["Advances outstanding", "advancesOutstanding"],
                ].map(([label, key]) => (
                  <tr key={key}>
                    <td className="py-2 pr-4 text-gray-700">{label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(finance.survivor[key])}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(finance.duplicate[key])}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{formatCurrency(finance.merged[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
