"use client";

import { useMemo, useState } from "react";
// Owner-only: these primitives are styled by owner-theme.css, which is scoped
// under .owner-app. Rendering this outside /owner gives unstyled markup.
import { Card, DataTable, Badge, EmptyState } from "@/components/owner";

const STATUS_KIND = { ok: "good", warning: "warn", error: "bad" };
const STATUS_LABEL = { ok: "Ready", warning: "Warning", error: "Error" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "warnings", label: "Warnings" },
  { key: "errors", label: "Errors" },
];

const MATCHES = {
  all: () => true,
  ready: (r) => r.status === "ok",
  warnings: (r) => r.status === "warning",
  errors: (r) => r.status === "error",
};

export default function CampaignLeadPreviewTable({ summary, results }) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(
    () => ({
      all: results.length,
      ready: results.filter(MATCHES.ready).length,
      warnings: results.filter(MATCHES.warnings).length,
      errors: results.filter(MATCHES.errors).length,
    }),
    [results],
  );

  const shown = useMemo(() => results.filter(MATCHES[filter]), [results, filter]);

  return (
    <Card
      title={`${summary.total} rows read`}
      subtitle={`${summary.ok} ready · ${summary.warning} warnings · ${summary.error} errors — will create ${summary.willCreateDocs} leads`}
      actions={
        <div className="filter-pills">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="filter-pill"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
      }
    >
      {(summary.alreadyInCampaign > 0 ||
        summary.duplicateInFile > 0 ||
        summary.overlapWithOtherCampaigns > 0) && (
        <p className="muted note-line">
          {summary.alreadyInCampaign > 0 && `${summary.alreadyInCampaign} already in this campaign. `}
          {summary.duplicateInFile > 0 && `${summary.duplicateInFile} repeated in this file. `}
          {summary.overlapWithOtherCampaigns > 0 &&
            `${summary.overlapWithOtherCampaigns} also appear in another campaign.`}
        </p>
      )}

      <DataTable
        tall
        emptyMessage={<EmptyState icon="⌕" title="No rows in this filter" hint="Switch to All to see every row read from the file." />}
        columns={[
          { key: "rowNumber", label: "#", render: (r) => <span className="muted">{r.rowNumber}</span> },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <Badge kind={STATUS_KIND[r.status] || "neutral"} dot>
                {STATUS_LABEL[r.status] || r.status}
              </Badge>
            ),
          },
          { key: "name", label: "Name", render: (r) => r.preview?.name || "—" },
          { key: "phone", label: "Phone", render: (r) => r.preview?.phone || "—" },
          { key: "city", label: "City", render: (r) => r.preview?.city || "—" },
          { key: "leadDate", label: "Lead Date", render: (r) => r.preview?.leadDate || "—" },
          {
            key: "messages",
            label: "Messages",
            render: (r) =>
              r.errors?.length || r.warnings?.length ? (
                <ul className="row-messages">
                  {(r.errors || []).map((e, i) => (
                    <li key={`e-${i}`} className="bad">{e}</li>
                  ))}
                  {(r.warnings || []).map((w, i) => (
                    <li key={`w-${i}`} className="warn">{w}</li>
                  ))}
                </ul>
              ) : (
                <span className="muted">—</span>
              ),
          },
        ]}
        rows={shown.map((r) => ({ ...r, id: r.rowNumber, _rowKind: r.status }))}
      />
    </Card>
  );
}
