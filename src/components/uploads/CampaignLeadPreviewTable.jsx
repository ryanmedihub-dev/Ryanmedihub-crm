"use client";

import { useMemo, useState } from "react";
import RowStatusPill from "@/components/uploads/RowStatusPill";

export default function CampaignLeadPreviewTable({ summary, results }) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(
    () => ({
      all: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      warning: results.filter((r) => r.status === "warning").length,
      error: results.filter((r) => r.status === "error").length,
    }),
    [results],
  );

  const shown = useMemo(() => {
    if (filter === "all") return results;
    if (filter === "ready") return results.filter((r) => r.status === "ok");
    if (filter === "warnings") return results.filter((r) => r.status === "warning");
    return results.filter((r) => r.status === "error");
  }, [results, filter]);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-sm backdrop-blur">
        <span className="font-bold text-slate-900">{summary.total} rows</span>
        <span className="text-emerald-700">{summary.ok} ready</span>
        <span className="text-amber-700">{summary.warning} warnings</span>
        <span className="text-rose-700">{summary.error} errors</span>
        <span className="text-slate-600">will create {summary.willCreateDocs} leads</span>
        {summary.alreadyInCampaign > 0 && <span className="text-slate-500">{summary.alreadyInCampaign} already in this campaign</span>}
        {summary.duplicateInFile > 0 && <span className="text-slate-500">{summary.duplicateInFile} repeated in this file</span>}
        {summary.overlapWithOtherCampaigns > 0 && (
          <span className="text-indigo-600">{summary.overlapWithOtherCampaigns} also in another campaign</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["all", `All ${counts.all}`],
          ["ready", `Ready ${counts.ok}`],
          ["warnings", `Warnings ${counts.warning}`],
          ["errors", `Errors ${counts.error}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === key ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-175 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">Lead Date</th>
              <th className="px-3 py-2">Messages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => {
              const p = r.preview || {};
              const tint = r.status === "error" ? "bg-rose-50/60" : r.status === "warning" ? "bg-amber-50/50" : "";
              return (
                <tr key={r.rowNumber} className={tint}>
                  <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                  <td className="px-3 py-2"><RowStatusPill status={r.status} /></td>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.name || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.phone || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.city || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.leadDate || "—"}</td>
                  <td className="px-3 py-2">
                    {r.errors?.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-rose-700">
                        {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                    {r.warnings?.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-amber-700">
                        {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    )}
                    {!r.errors?.length && !r.warnings?.length && <span className="text-[12px] text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">No rows in this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
