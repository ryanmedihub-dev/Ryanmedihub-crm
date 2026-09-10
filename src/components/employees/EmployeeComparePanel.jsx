"use client";

import { formatCurrency } from "@/lib/financeUI";

const fmt = (field, v) => {
  if (v == null || v === "") return "—";
  if (field === "isactive") return v ? "Active" : "Inactive";
  if (field === "incentiveRate") return formatCurrency(v);
  if (field === "salaryStructure") return v?.baseSalary != null ? `${formatCurrency(v.baseSalary)} / ${v.salaryType || "Monthly"}` : "—";
  return String(v);
};

/**
 * Side-by-side field comparison with a radio per row to pick the survivor's value.
 * `choices` / `onChange` is the fieldChoices map ({ field: "survivor" | "duplicate" }).
 */
export default function EmployeeComparePanel({ survivor, duplicate, fieldDiff = [], choices = {}, onChange }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800">
        <span className="truncate">{survivor?.name} <span className="text-xs font-normal text-gray-400">survivor</span></span>
        <span className="text-xs font-semibold text-gray-400">keep</span>
        <span className="truncate text-right">{duplicate?.name} <span className="text-xs font-normal text-gray-400">duplicate</span></span>
      </div>
      <div className="divide-y divide-gray-50">
        {fieldDiff.map((row) => {
          const pick = choices[row.field] || (row.suggest || "survivor");
          return (
            <div
              key={row.field}
              className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-sm ${
                row.differs ? "bg-amber-50/40" : ""
              }`}
            >
              <label className="flex items-center gap-2 min-w-0">
                <input
                  type="radio"
                  name={`fc-${row.field}`}
                  checked={pick === "survivor"}
                  onChange={() => onChange({ ...choices, [row.field]: "survivor" })}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{row.field}</span>
                  <span className="block truncate text-gray-800">{fmt(row.field, row.survivor)}</span>
                </span>
              </label>
              <span className="text-[10px] text-gray-300">↔</span>
              <label className="flex items-center justify-end gap-2 min-w-0 text-right">
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{row.field}</span>
                  <span className="block truncate text-gray-800">{fmt(row.field, row.duplicate)}</span>
                </span>
                <input
                  type="radio"
                  name={`fc-${row.field}`}
                  checked={pick === "duplicate"}
                  onChange={() => onChange({ ...choices, [row.field]: "duplicate" })}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
