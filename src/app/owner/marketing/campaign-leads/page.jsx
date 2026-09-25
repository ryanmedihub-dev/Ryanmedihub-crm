"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload, Download, FileSpreadsheet, Loader2, ArrowLeft, Undo2, RefreshCw } from "lucide-react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useToast } from "@/components/Toast";
import { ownerFetch } from "@/lib/ownerFetch";
import UploadDropzone from "@/components/uploads/UploadDropzone";
import CampaignLeadPreviewTable from "@/components/uploads/CampaignLeadPreviewTable";
import CampaignLeadBatchResultPanel from "@/components/uploads/CampaignLeadBatchResultPanel";
import { readCampaignLeadWorkbook, buildCampaignLeadTemplateBytes, downloadBytes } from "@/lib/uploads/campaignLeadExcel";
import { MAX_ROWS } from "@/lib/uploads/campaignLeadRowMapper";
import { ALL_BRANCHES } from "@/lib/branches";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export default function CampaignLeadsPage() {
  const toast = useToast();
  const [phase, setPhase] = useState("idle"); // idle | parsing | preview | committing | done

  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("");
  const [campaignId, setCampaignId] = useState("");

  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [skipErrors, setSkipErrors] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [commitResult, setCommitResult] = useState(null);
  const [reverting, setReverting] = useState(false);

  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);

  // No AI anywhere in the validate/commit path itself — only a brief that
  // reads the batch history, re-checked after a successful import.
  const campaignLeadsAi = useAiInsight("marketing.campaignLeads", {}, { kind: "brief" });

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    const r = await ownerFetch("/api/owner/marketing/campaign-leads/batches");
    if (r.ok) setBatches(r.data?.batches || []);
    setBatchesLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setCampaignsLoading(true);
      const r = await ownerFetch("/api/owner/marketing/campaign-leads/template");
      if (r.ok) setCampaigns(r.data?.campaigns || []);
      else toast.error(r.error);
      setCampaignsLoading(false);
    })();
    loadBatches();
  }, [loadBatches, toast]);

  const visibleCampaigns = branchFilter ? campaigns.filter((c) => c.branch === branchFilter) : campaigns;
  const selectedCampaign = campaigns.find((c) => c.id === campaignId) || null;

  const reset = () => {
    setPhase("idle");
    setFile(null);
    setRawRows([]);
    setValidation(null);
    setSkipErrors(false);
    setBatchLabel("");
    setCommitResult(null);
  };

  const downloadTemplate = async () => {
    try {
      downloadBytes(await buildCampaignLeadTemplateBytes({ withExamples: true }), "campaign-leads-template.xlsx");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't build the template.");
    }
  };

  const handleFile = async (f) => {
    if (!campaignId) {
      toast.error("Pick a campaign first.");
      return;
    }
    setFile(f);
    setPhase("parsing");
    setValidation(null);
    setCommitResult(null);
    try {
      const { rows, missingHeaders } = await readCampaignLeadWorkbook(f);
      if (missingHeaders.length > 0) {
        toast.error(`The header row is missing: ${missingHeaders.join(", ")}. Start from a fresh template.`);
        setPhase("idle");
        return;
      }
      if (rows.length === 0) {
        toast.error("No data rows found.");
        setPhase("idle");
        return;
      }
      if (rows.length > MAX_ROWS) {
        toast.error(`${rows.length} rows — the limit is ${MAX_ROWS}. Split the file.`);
        setPhase("idle");
        return;
      }
      setRawRows(rows);
      const r = await ownerFetch("/api/owner/marketing/campaign-leads/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, campaignId }),
      });
      if (!r.ok) {
        toast.error(r.error || "Validation failed");
        setPhase("idle");
        return;
      }
      setValidation(r.data);
      setSkipErrors(false);
      setPhase("preview");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't read that file.");
      setPhase("idle");
    }
  };

  const commit = async () => {
    if (!validation) return;
    const confirmedHashes = validation.results
      .filter((r) => (r.status === "ok" || r.status === "warning") && r.rowHash)
      .map((r) => r.rowHash);
    if (confirmedHashes.length === 0) {
      toast.error("Nothing ready to import.");
      return;
    }
    setPhase("committing");
    const r = await ownerFetch("/api/owner/marketing/campaign-leads/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, batchLabel, fileName: file?.name || "", rows: rawRows, confirmedHashes, skipErrors }),
    });
    if (r.status === 409) {
      toast.error(r.error || "Something changed — review the refreshed preview.");
      if (r.data?.results) setValidation({ summary: r.data.summary, results: r.data.results });
      setPhase("preview");
      return;
    }
    if (!r.ok) {
      toast.error(r.error || "Import failed");
      setPhase("preview");
      return;
    }
    setCommitResult(r.data);
    setPhase("done");
    toast.success(`Imported ${r.data.created} lead(s).`);
    loadBatches();
    campaignLeadsAi.refresh(); // re-analyse now that a new batch exists — not part of the commit itself
  };

  const revertBatch = async () => {
    if (!commitResult?.batchId) return;
    if (
      !window.confirm(
        `Revert batch #${commitResult.batchNo}? This permanently deletes the ${commitResult.docsCreated} campaign lead(s) it created.\n\nSource labels already written to callby are not reverted. To correct them, upload the list against the right campaign.`,
      )
    )
      return;
    setReverting(true);
    const r = await ownerFetch(`/api/owner/marketing/campaign-leads/${commitResult.batchId}/revert`, { method: "POST" });
    setReverting(false);
    if (!r.ok) {
      toast.error(r.error || "Revert failed");
      return;
    }
    toast.success(r.data?.message || "Batch reverted");
    setCommitResult((prev) => ({ ...prev, reverted: true, revertInfo: r.data }));
    loadBatches();
  };

  const revertHistoryBatch = async (batch) => {
    if (
      !window.confirm(
        `Revert batch #${batch.batchNo}? This permanently deletes the ${batch.created} campaign lead(s) it created.\n\nSource labels already written to callby are not reverted. To correct them, upload the list against the right campaign.`,
      )
    )
      return;
    const r = await ownerFetch(`/api/owner/marketing/campaign-leads/${batch.id}/revert`, { method: "POST" });
    if (!r.ok) {
      toast.error(r.error || "Revert failed");
      return;
    }
    toast.success(r.data?.message || "Batch reverted");
    loadBatches();
  };

  const [retryingId, setRetryingId] = useState(null);
  const retrySourceSync = async (batch) => {
    setRetryingId(batch.id);
    const r = await ownerFetch(`/api/owner/marketing/campaign-leads/${batch.id}/sync-source`, { method: "POST" });
    setRetryingId(null);
    if (!r.ok) {
      toast.error(r.error || "Source sync failed");
      return;
    }
    toast.success(`Source sync: ${r.data?.sourceSync?.status}`);
    loadBatches();
  };

  const busy = phase === "parsing" || phase === "committing";
  const summary = validation?.summary;
  const canCommit = summary && summary.ok + summary.warning > 0 && (summary.error === 0 || skipErrors);

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Campaign Leads" subtitle="Upload each morning's ad-platform lead export against a campaign" aiState={campaignLeadsAi} />

        <div className="content">
          <AiBriefPanel feature="marketing.campaignLeads" scope={{}} title="Campaign Leads" aiState={campaignLeadsAi} />

          <div className="card">
            <div className="mx-auto max-w-6xl space-y-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                  <Upload className="h-5 w-5" />
                </div>
                {phase !== "idle" && (
                  <button
                    onClick={reset}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Start over
                  </button>
                )}
              </div>

              {phase === "idle" && (
                <section className="space-y-6">
                  <div>
                    <h2 className="mb-3 text-sm font-bold text-slate-900">1. Pick a campaign</h2>
                    <div className="flex flex-wrap gap-3">
                      <select className={`${inputClass} w-48`} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                        <option value="">All branches</option>
                        {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <select className={`${inputClass} w-80`} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} disabled={campaignsLoading}>
                        <option value="">{campaignsLoading ? "Loading campaigns…" : "Select a campaign"}</option>
                        {visibleCampaigns.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} — {c.platform} · {c.branch} · {c.status}</option>
                        ))}
                      </select>
                    </div>
                    {selectedCampaign && (
                      <p className="mt-2 text-xs text-slate-500">
                        Leads uploaded here inherit <strong>{selectedCampaign.platform}</strong> / <strong>{selectedCampaign.branch}</strong> from the campaign — not re-entered per row.
                      </p>
                    )}
                  </div>

                  <div>
                    <h2 className="mb-3 text-sm font-bold text-slate-900">2. Download the template</h2>
                    <button
                      onClick={downloadTemplate}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      <Download className="h-4 w-4" /> Template with examples
                    </button>
                    <p className="mt-2 text-xs text-slate-500">
                      Name, Phone, Email, City, Lead Date are the fixed columns. Any other column (e.g. &quot;Interested In&quot;) is kept as a per-lead answer.
                    </p>
                  </div>

                  <div>
                    <h2 className="mb-3 text-sm font-bold text-slate-900">3. Upload the filled file</h2>
                    <UploadDropzone onFile={handleFile} fileName={file?.name} disabled={busy || !campaignId} />
                    {!campaignId && <p className="mt-2 text-xs text-amber-600">Pick a campaign above first.</p>}
                  </div>
                </section>
              )}

              {phase === "parsing" && (
                <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" /> Reading &amp; validating…
                </div>
              )}

              {(phase === "preview" || phase === "committing") && validation && (
                <section className="space-y-4">
                  {validation.sourcePreview && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                      {validation.sourcePreview.status === "failed" ? (
                        <p className="text-slate-500">Couldn&apos;t check callby — the upload will still work; the source sync can be retried after.</p>
                      ) : (
                        <p className="text-slate-700">
                          <strong>{validation.sourcePreview.matched}</strong> of {validation.summary.total} leads found in callby — source will change for{" "}
                          <strong>{validation.sourcePreview.wouldUpdate}</strong>, <strong>{validation.sourcePreview.alreadySet}</strong> already set,{" "}
                          <strong>{validation.sourcePreview.unmatched}</strong> not in callby.
                        </p>
                      )}
                    </div>
                  )}
                  <CampaignLeadPreviewTable summary={validation.summary} results={validation.results} />

                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    {validation.summary.error > 0 && (
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                        Skip the {validation.summary.error} error row(s) and import the rest
                      </label>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      <input
                        value={batchLabel}
                        onChange={(e) => setBatchLabel(e.target.value)}
                        placeholder="Batch label (e.g. Meta export 14 Sep)"
                        className={`${inputClass} w-64`}
                      />
                      <button
                        onClick={commit}
                        disabled={!canCommit || phase === "committing"}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {phase === "committing" ? (<><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>) : (<>Import {validation.summary.willCreateDocs} leads</>)}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {phase === "done" && commitResult && (
                <CampaignLeadBatchResultPanel result={commitResult} reverting={reverting} onRevert={revertBatch} onStartOver={reset} />
              )}

              <section className="space-y-3 border-t border-slate-200 pt-6">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Upload history
                </h2>
                {batchesLoading ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : batches.length === 0 ? (
                  <p className="text-sm text-slate-400">No uploads yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Batch</th>
                          <th className="px-3 py-2">Label</th>
                          <th className="px-3 py-2 text-right">Created</th>
                          <th className="px-3 py-2 text-right">Failed</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Source Sync</th>
                          <th className="px-3 py-2">By</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {batches.map((b) => (
                          <tr key={b.id}>
                            <td className="px-3 py-2 text-slate-500">#{b.batchNo}</td>
                            <td className="px-3 py-2 text-slate-800">{b.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{b.created}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{b.failed}</td>
                            <td className="px-3 py-2 text-slate-600">{b.status}</td>
                            <td className="px-3 py-2">
                              {b.sourceSync ? (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    title={`matched ${b.sourceSync.matched} · updated ${b.sourceSync.updated} · already set ${b.sourceSync.alreadySet} · unmatched ${b.sourceSync.unmatched}${b.sourceSync.error ? ` · ${b.sourceSync.error}` : ""}`}
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      b.sourceSync.status === "done"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : b.sourceSync.status === "partial"
                                          ? "bg-amber-100 text-amber-700"
                                          : b.sourceSync.status === "failed"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {b.sourceSync.status === "done" ? "Done" : b.sourceSync.status === "partial" ? "Partial" : b.sourceSync.status === "failed" ? "Failed" : "Pending"}
                                  </span>
                                  {(b.sourceSync.status === "failed" || b.sourceSync.status === "partial") && b.status !== "reverted" && (
                                    <button
                                      onClick={() => retrySourceSync(b)}
                                      disabled={retryingId === b.id}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      {retryingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Retry
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-500">{b.createdBy}</td>
                            <td className="px-3 py-2 text-right">
                              {b.status !== "reverted" && b.created > 0 && (
                                <button
                                  onClick={() => revertHistoryBatch(b)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  <Undo2 className="h-3 w-3" /> Revert
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
