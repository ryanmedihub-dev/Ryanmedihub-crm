"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, EmptyState, InlineNotice, TrendChart, Badge } from "@/components/owner";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num, fmtDate } from "@/lib/owner/format";

// /owner/ai/health — how Sanya (/owner/ai/sanya) is behaving, from its usage
// log. Built once there was a real assistant to monitor; every figure here is
// a count/sum over SanyaUsage, nothing is estimated.

const usd = (n) => (n == null ? "—" : `$${Number(n).toFixed(n < 1 ? 4 : 2)}`);
const ms = (n) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);

export default function AiHealthPage() {
  const [filterState, setFilterState] = useState(null);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    return `/api/owner/ai/health?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);

  const s = data?.summary;
  const mtd = data?.monthToDate;
  const budgetKind = !mtd ? "info" : mtd.budgetUsedPct >= 90 ? "bad" : mtd.budgetUsedPct >= 60 ? "warn" : "good";

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="AI Health & Audit"
          subtitle="Sanya's tool-call volume, latency, error and refusal rates, and cost — from its usage log"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date"]} defaults={{ range: "Last 30 Days" }} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Month-to-date cost", value: usd(mtd?.costUsd), sub: `${mtd?.budgetUsedPct ?? 0}% of $${data?.config?.monthlyBudgetUsd ?? "—"} ceiling · ${num(mtd?.turns)} turns`, kind: budgetKind },
                  { label: "Questions", value: num(s?.turns), sub: `${num(s?.users)} user${s?.users === 1 ? "" : "s"} in period`, kind: "info" },
                  { label: "Tool calls", value: num(s?.toolCalls), sub: `${s?.toolCallsPerTurn ?? 0} per question`, kind: "info" },
                  { label: "Latency p50 / p95", value: s ? `${ms(s.latencyP50Ms)} / ${ms(s.latencyP95Ms)}` : "—", sub: `max ${ms(s?.latencyMaxMs)}`, kind: "info" },
                  { label: "Error rate", value: s ? `${s.errorRatePct}%` : "—", sub: `${num(s?.piiBlocked)} PII-blocked · ${num(s?.rateLimited)} rate-limited`, kind: s?.errorRatePct > 5 ? "bad" : "good" },
                  { label: "Refusal rate", value: s ? `${s.refusalRatePct}%` : "—", sub: "\"I don't have that data\" answers", kind: "neutral" },
                  { label: "Tokens", value: s ? num(s.promptTokens + s.completionTokens) : "—", sub: `${num(s?.promptTokens)} in · ${num(s?.completionTokens)} out · ${usd(s?.costUsd)}`, kind: "info" },
                ]}
              />

              <InlineNotice kind="info" title="What this measures">
                One log row per question to <Link href="/owner/ai/sanya">Sanya</Link> (model <code>{data?.config?.model || "…"}</code>):
                which tools it called and how long they took, tokens and cost, outcome (ok / error / rate-limited / budget /
                PII-blocked) and whether it refused for lack of data. Question and answer text are never stored. A
                PII-blocked turn means the guard found something personal in a tool result and refused to send it —
                that is a bug to fix in the tool, not a model problem.
              </InlineNotice>

              <div className="grid cols-2">
                <Card title="Questions per day" subtitle="Turns, all outcomes">
                  {data && !data.daily.length ? (
                    <EmptyState icon="◆" title="No usage in this period" message="Ask Sanya something and it will show up here." />
                  ) : (
                    <TrendChart data={(data?.daily || []).map((d) => ({ date: d.date, value: d.turns }))} label="Questions" />
                  )}
                </Card>
                <Card title="Cost per day" subtitle="USD, from token usage × model price">
                  <TrendChart data={(data?.daily || []).map((d) => ({ date: d.date, value: Math.round(d.costUsd * 10000) / 10000 }))} label="USD" />
                </Card>
              </div>

              <div className="grid cols-2">
                <Card title="By tool" subtitle="Calls, failures and latency per tool">
                  <DataTable
                    loading={loading}
                    emptyMessage="No tool calls yet"
                    columns={[
                      { key: "tool", label: "Tool", render: (r) => <code>{r.tool}</code> },
                      { key: "calls", label: "Calls", align: "right", render: (r) => num(r.calls) },
                      { key: "failed", label: "Failed", align: "right", render: (r) => (r.failed ? <Badge kind="bad">{r.failed}</Badge> : "0") },
                      { key: "avgMs", label: "Avg", align: "right", render: (r) => ms(r.avgMs) },
                      { key: "maxMs", label: "Max", align: "right", render: (r) => ms(r.maxMs) },
                    ]}
                    rows={(data?.byTool || []).map((r) => ({ ...r, id: r.tool }))}
                  />
                </Card>
                <Card title="Recent errors" subtitle="Last 10 failed or blocked turns">
                  <DataTable
                    loading={loading}
                    emptyMessage="No errors in this period"
                    columns={[
                      { key: "createdAt", label: "When", render: (r) => fmtDate(r.createdAt) },
                      { key: "outcome", label: "Outcome", render: (r) => <Badge kind={r.outcome === "pii_blocked" ? "bad" : "warn"}>{r.outcome}</Badge> },
                      { key: "errorMessage", label: "Detail", render: (r) => <span style={{ fontSize: "var(--fs-12)" }}>{(r.errorMessage || "—").slice(0, 160)}</span> },
                      { key: "latencyMs", label: "Latency", align: "right", render: (r) => ms(r.latencyMs) },
                    ]}
                    rows={(data?.recentErrors || []).map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
