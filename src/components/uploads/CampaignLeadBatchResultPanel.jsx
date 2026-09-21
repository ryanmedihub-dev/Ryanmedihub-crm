"use client";

import Link from "next/link";
import { CheckCircle2, Undo2, Loader2, Upload, ExternalLink } from "lucide-react";

export default function CampaignLeadBatchResultPanel({ result, reverting, onRevert, onStartOver }) {
  const reverted = !!result.reverted;

  return (
    <section className="space-y-4">
      <div className={`rounded-2xl border p-5 ${reverted ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 className={`h-6 w-6 ${reverted ? "text-rose-500" : "text-emerald-600"}`} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">
              Batch #{result.batchNo} — {result.created} lead(s) imported
              {result.failed > 0 && `, ${result.failed} skipped/failed`}
            </p>
            {reverted && <p className="text-sm font-semibold text-rose-700">Reverted — {result.revertInfo?.message}</p>}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/owner/marketing/performance"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" /> View campaign performance
            </Link>
            {!reverted && result.docsCreated > 0 && (
              <button
                onClick={onRevert}
                disabled={reverting}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {reverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Revert this batch
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.results.map((o, i) => (
              <tr key={i} className={o.error && !o.skipped ? "bg-rose-50/60" : ""}>
                <td className="px-3 py-2 text-slate-500">{o.rowNumber}</td>
                <td className="px-3 py-2">
                  {o.campaignLeadId ? (
                    <span className="text-emerald-700">campaign lead {o.campaignLeadId}</span>
                  ) : o.skipped ? (
                    <span className="text-slate-500">skipped — {o.error}</span>
                  ) : (
                    <span className="text-rose-700">{o.error}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={onStartOver}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        <Upload className="h-4 w-4" /> Upload another file
      </button>
    </section>
  );
}
