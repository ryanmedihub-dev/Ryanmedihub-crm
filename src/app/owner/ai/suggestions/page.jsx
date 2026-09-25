"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, ErrorState, EmptyState, InlineNotice, Badge } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { ownerFetch } from "@/lib/ownerFetch";
import { fmtDate } from "@/lib/owner/format";

const CATEGORY_KIND = {
  Funnel: "info",
  Sources: "purple",
  Marketing: "warn",
  Attention: "bad",
  Employees: "neutral",
};

export default function SuggestionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    const r = await ownerFetch("/api/owner/ai/suggestions", { signal });
    if (r.aborted) return;
    if (r.ok) setData(r.data);
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const observations = data?.observations || [];
  const suggestionsAi = useAiInsight("ai.suggestions", {}, { kind: "brief" });

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Suggestions"
          subtitle="Rules-based observations, not an LLM — every line here cites a number computed fresh, never a recommendation"
          aiState={suggestionsAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="ai.suggestions" scope={{}} title="Suggestions" aiState={suggestionsAi} />

          <InlineNotice kind="info" title="Rule-based observations below — the AI strategist above reads them">
            Every observation below is a plain comparison over the same aggregates Statistics, Attention,
            Marketing, and Employees already compute, phrased as facts with numbers, never as directives — no
            model call, no cost. The brief above is the one AI layer here: it reads these same facts and turns
            the most relevant ones into prioritised, concrete actions.
          </InlineNotice>

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : loading ? (
            <Card title="Loading…">
              <div className="muted">Computing observations from the last 30 days…</div>
            </Card>
          ) : observations.length === 0 ? (
            <Card title="No notable observations">
              <EmptyState icon="✓" title="Nothing stood out" hint="Every comparison this page checks was within its normal range this period." />
            </Card>
          ) : (
            <>
              <h2 style={{ fontSize: "var(--fs-16)", margin: "4px 0 0" }}>Rule-based observations</h2>
              {data?.period && (
                <div className="muted" style={{ marginBottom: 8 }}>
                  Period: {fmtDate(data.period.from)} – {fmtDate(data.period.to)} · compared against {fmtDate(data.previousPeriod.from)} – {fmtDate(data.previousPeriod.to)}
                </div>
              )}
              {observations.map((o) => (
                <Card
                  key={o.id}
                  title={o.headline}
                  subtitle={o.detail}
                  actions={<Badge kind={CATEGORY_KIND[o.category] || "neutral"}>{o.category}</Badge>}
                >
                  {o.drillHref && (
                    <Link href={o.drillHref} className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
                      View the underlying data →
                    </Link>
                  )}
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
