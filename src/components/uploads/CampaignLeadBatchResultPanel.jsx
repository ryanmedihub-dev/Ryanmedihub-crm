"use client";

import Link from "next/link";
import { Undo2, Upload, ExternalLink } from "lucide-react";
// Owner-only: styled by owner-theme.css, which is scoped under .owner-app.
import { Card, DataTable, InlineNotice } from "@/components/owner";

export default function CampaignLeadBatchResultPanel({ result, reverting, onRevert, onStartOver }) {
  const reverted = !!result.reverted;

  return (
    <>
      <InlineNotice
        kind={reverted ? "error" : "success"}
        title={`Batch #${result.batchNo} — ${result.created} lead(s) imported${
          result.failed > 0 ? `, ${result.failed} skipped/failed` : ""
        }`}
      >
        {reverted ? `Reverted — ${result.revertInfo?.message}` : "The leads are now attributed to this campaign."}
      </InlineNotice>

      <Card
        title="Row results"
        subtitle={`${result.results.length} row${result.results.length === 1 ? "" : "s"} processed`}
        actions={
          <div className="cell-actions">
            <Link href="/owner/marketing/performance" className="btn">
              <ExternalLink size={14} /> Campaign performance
            </Link>
            {!reverted && result.docsCreated > 0 && (
              <button type="button" className="danger-btn" onClick={onRevert} disabled={reverting}>
                <Undo2 size={14} /> {reverting ? "Reverting…" : "Revert this batch"}
              </button>
            )}
          </div>
        }
      >
        <DataTable
          tall
          columns={[
            { key: "rowNumber", label: "Row", render: (o) => <span className="muted">{o.rowNumber}</span> },
            {
              key: "result",
              label: "Result",
              render: (o) =>
                o.campaignLeadId ? (
                  <span>campaign lead {o.campaignLeadId}</span>
                ) : o.skipped ? (
                  <span className="muted">skipped — {o.error}</span>
                ) : (
                  <span className="tone-crit">{o.error}</span>
                ),
            },
          ]}
          rows={result.results.map((o, i) => ({
            ...o,
            id: o.rowNumber ?? i,
            _rowKind: o.error && !o.skipped ? "error" : undefined,
          }))}
        />
      </Card>

      <div>
        <button type="button" className="primary" onClick={onStartOver}>
          <Upload size={15} /> Upload another file
        </button>
      </div>
    </>
  );
}
