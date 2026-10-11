"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ArrowLeft, Undo2, RefreshCw } from "lucide-react";
import { OwnerPage, Card, DataTable, Badge, EmptyState, InlineNotice } from "@/components/owner";
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

const SYNC_KIND = { done: "good", partial: "warn", failed: "bad" };
const SYNC_LABEL = { done: "Done", partial: "Partial", failed: "Failed" };

export default function CampaignLeadsPage() {
  const toast = useToast();
  const [phase, setPhase] = useState("idle"); 

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
    campaignLeadsAi.refresh(); 
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
    <OwnerPage title="Campaign Leads" subtitle="Upload each morning's ad-platform lead export against a campaign" aiState={campaignLeadsAi}>
      <AiBriefPanel feature="marketing.campaignLeads" scope={{}} title="Campaign Leads" aiState={campaignLeadsAi} />

      {phase === "idle" && (
        <>
          <Card title="1. Pick a campaign" subtitle="Platform and branch are inherited from the campaign, not re-entered per row">
            <div className="form-row">
              <label className="filter-field">
                <span>Branch</span>
                <select className="control" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  <option value="">All branches</option>
                  {ALL_BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="filter-field grow">
                <span>Campaign</span>
                <select className="control" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} disabled={campaignsLoading}>
                  <option value="">{campaignsLoading ? "Loading campaigns…" : "Select a campaign"}</option>
                  {visibleCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.platform} · {c.branch} · {c.status}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedCampaign && (
              <p className="muted note-line">
                These leads will inherit <strong>{selectedCampaign.platform}</strong> / <strong>{selectedCampaign.branch}</strong> from the campaign.
              </p>
            )}
          </Card>

          <Card title="2. Download the template" subtitle="Name, Phone, Email, City and Lead Date are the fixed columns">
            <button type="button" className="primary" onClick={downloadTemplate}>
              <Download size={15} /> Template with examples
            </button>
            <p className="muted note-line">
              Any other column (e.g. &quot;Interested In&quot;) is kept as a per-lead answer.
            </p>
          </Card>

          <Card title="3. Upload the filled file">
            <UploadDropzone onFile={handleFile} fileName={file?.name} disabled={busy || !campaignId} />
            {!campaignId && (
              <InlineNotice kind="warn" title="Pick a campaign above first">
                Every uploaded lead is attributed to one campaign, so the file can&apos;t be read until one is chosen.
              </InlineNotice>
            )}
          </Card>
        </>
      )}

      {phase === "parsing" && (
        <Card>
          <EmptyState icon="⟳" title="Reading & validating…" hint="Checking each row against the campaign and for duplicates." />
        </Card>
      )}

      {(phase === "preview" || phase === "committing") && validation && (
        <>
          {validation.sourcePreview && (
            <InlineNotice
              kind={validation.sourcePreview.status === "failed" ? "warn" : "info"}
              title={validation.sourcePreview.status === "failed" ? "Couldn't check callby" : "callby source preview"}
            >
              {validation.sourcePreview.status === "failed" ? (
                "The upload will still work — the source sync can be retried after importing."
              ) : (
                <>
                  <strong>{validation.sourcePreview.matched}</strong> of {validation.summary.total} leads found in callby — source
                  will change for <strong>{validation.sourcePreview.wouldUpdate}</strong>,{" "}
                  <strong>{validation.sourcePreview.alreadySet}</strong> already set,{" "}
                  <strong>{validation.sourcePreview.unmatched}</strong> not in callby.
                </>
              )}
            </InlineNotice>
          )}

          <CampaignLeadPreviewTable summary={validation.summary} results={validation.results} />

          <Card>
            <div className="form-row">
              {validation.summary.error > 0 && (
                <label className="check-field">
                  <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} />
                  Skip the {validation.summary.error} error row(s) and import the rest
                </label>
              )}
              <div className="form-row-end">
                <input
                  className="control"
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="Batch label (e.g. Meta export 14 Sep)"
                  aria-label="Batch label"
                />
                <button type="button" className="primary" onClick={commit} disabled={!canCommit || phase === "committing"}>
                  {phase === "committing" ? "Importing…" : `Import ${validation.summary.willCreateDocs} leads`}
                </button>
              </div>
            </div>
          </Card>
        </>
      )}

      {phase === "done" && commitResult && (
        <CampaignLeadBatchResultPanel result={commitResult} reverting={reverting} onRevert={revertBatch} onStartOver={reset} />
      )}

      <Card
        title="Upload history"
        subtitle={batchesLoading ? "Loading…" : `${batches.length} batch${batches.length === 1 ? "" : "es"}`}
        actions={
          phase !== "idle" ? (
            <button type="button" className="btn" onClick={reset}>
              <ArrowLeft size={14} /> Start over
            </button>
          ) : null
        }
      >
        <DataTable
          loading={batchesLoading}
          emptyMessage={<EmptyState icon="⬆" title="No uploads yet" hint="Imported batches and their callby sync status appear here." />}
          columns={[
            { key: "batchNo", label: "Batch", render: (b) => <span className="muted">#{b.batchNo}</span> },
            { key: "label", label: "Label" },
            { key: "created", label: "Created", align: "right" },
            { key: "failed", label: "Failed", align: "right", render: (b) => <span className="muted">{b.failed}</span> },
            { key: "status", label: "Status" },
            {
              key: "sourceSync",
              label: "Source Sync",
              render: (b) =>
                b.sourceSync ? (
                  <span className="cell-actions">
                    <span
                      title={`matched ${b.sourceSync.matched} · updated ${b.sourceSync.updated} · already set ${b.sourceSync.alreadySet} · unmatched ${b.sourceSync.unmatched}${b.sourceSync.error ? ` · ${b.sourceSync.error}` : ""}`}
                    >
                      <Badge kind={SYNC_KIND[b.sourceSync.status] || "neutral"} dot>
                        {SYNC_LABEL[b.sourceSync.status] || "Pending"}
                      </Badge>
                    </span>
                    {(b.sourceSync.status === "failed" || b.sourceSync.status === "partial") && b.status !== "reverted" && (
                      <button type="button" className="btn" onClick={() => retrySourceSync(b)} disabled={retryingId === b.id}>
                        <RefreshCw size={12} /> {retryingId === b.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            { key: "createdBy", label: "By", render: (b) => <span className="muted">{b.createdBy}</span> },
            {
              key: "actions",
              label: "",
              align: "right",
              render: (b) =>
                b.status !== "reverted" && b.created > 0 ? (
                  <button type="button" className="danger-btn" onClick={() => revertHistoryBatch(b)}>
                    <Undo2 size={12} /> Revert
                  </button>
                ) : null,
            },
          ]}
          rows={batches}
        />
      </Card>
    </OwnerPage>
  );
}
