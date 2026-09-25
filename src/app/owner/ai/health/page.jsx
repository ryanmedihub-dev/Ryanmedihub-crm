"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, DataTable, ErrorState, EmptyState, InlineNotice, Badge, TrendChart } from "@/components/owner";
import { AiOrb, AiScoreRing, AiBriefPanel, NeuralCoverageMap } from "@/components/owner/ai";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { relativeTime } from "@/lib/ai/client/aiLabels";
import { num, fmtDate } from "@/lib/owner/format";

// /owner/ai/health — the AI layer's own operational picture (Part 9 rebuild).
// `insights` (from src/lib/ai/health.js, shared with ai.selfDiagnosis) covers
// the AI-Everywhere insight engine; the existing top-level Sanya fields
// (summary/monthToDate/byTool/daily/recentErrors) are untouched and shown in
// section 11. Auto-refreshes sections 1-2 every 60s; everything else refreshes
// with the date filter or a manual reload.

const usd = (n) => (n == null ? "—" : `$${Number(n).toFixed(n < 1 ? 4 : 2)}`);
const ms = (n) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);

const OUTCOME_COLOR = {
  ok: "var(--pos)", error: "var(--crit)", timeout: "var(--warn)", schema_invalid: "var(--warn)",
  pii_blocked: "var(--crit)", budget_exceeded: "var(--warn)", rate_limited: "var(--warn)",
  disabled: "var(--ink-muted)", unconfigured: "var(--ink-muted)", source_error: "var(--crit)",
};
const STAGE_COLOR = { collect: "var(--info)", compute: "var(--ai-violet)", analyze: "var(--ai-cyan)", verify: "var(--pos)" };
const SENTIMENT_FOR_SCORE = (s) => (s >= 85 ? "positive" : s >= 60 ? "neutral" : s >= 40 ? "concerning" : "critical");

function ProgressWithMarker({ pct, projectedPct, kind }) {
  const width = Math.min(100, Math.max(0, pct || 0));
  const marker = Math.min(100, Math.max(0, projectedPct || 0));
  return (
    <div style={{ position: "relative" }}>
      <div className={`progress${kind ? ` ${kind}` : ""}`} style={{ width: "100%" }}>
        <span style={{ width: `${width}%` }} />
      </div>
      <div title={`Projected month-end: ${projectedPct}%`} style={{ position: "absolute", left: `${marker}%`, top: -3, width: 2, height: 14, background: "var(--ink)", transform: "translateX(-1px)" }} />
    </div>
  );
}

export default function AiHealthPage() {
  const [filterState, setFilterState] = useState(null);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    return `/api/owner/ai/health?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url, { refreshInterval: 60_000 });

  const ins = data?.insights;
  const conn = data?.connectivity;
  const aiScope = useMemo(() => (filterState ? { from: filterState.range.from, to: filterState.range.to } : {}), [filterState]);

  // ---- Sanya (section 11, existing fields, unchanged) ----------------------
  const s = data?.summary;
  const mtd = data?.monthToDate;
  const budgetKind = !mtd ? "info" : mtd.budgetUsedPct >= 90 ? "bad" : mtd.budgetUsedPct >= 60 ? "warn" : "good";

  const outcomeRows = ins ? Object.entries(ins.totals.byOutcome).map(([outcome, count]) => ({ outcome, count, id: outcome })) : [];
  const confidenceRows = ins ? Object.entries(ins.quality.confidenceDistribution).map(([k, v]) => ({ name: k, value: v })) : [];
  const stageRows = ins ? [{ name: "Avg per run", collect: ins.stageMs.collect, compute: ins.stageMs.compute, analyze: ins.stageMs.analyze, verify: ins.stageMs.verify }] : [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="AI System Health"
          subtitle="How the AI layer itself is doing — reliability, cost, latency, grounding, coverage. Everything here is measured, nothing is a claim."
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date"]} defaults={{ range: "Last 7 Days" }} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !ins ? (
            <Card title={loading ? "Loading…" : "No data yet"}>
              <div className="muted">{loading ? "Computing…" : "Pick a date range above."}</div>
            </Card>
          ) : (
            <>
              {/* 1. Hero — AI Health Score */}
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
                  <AiOrb state={!ins.config.aiEnabled ? "paused" : !ins.config.keyConfigured || ins.healthScore < 60 ? "error" : "idle"} size={72} />
                  <AiScoreRing value={ins.healthScore} sentiment={SENTIMENT_FOR_SCORE(ins.healthScore)} size={120} label="AI Health Score" />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <h2 style={{ margin: "0 0 6px" }}>{ins.healthHeadline}</h2>
                    <p
                      className="muted"
                      style={{ margin: 0, fontSize: "var(--fs-12)" }}
                      title={`Success ${ins.healthBreakdown.successPct}% ×35% + Latency ${ins.healthBreakdown.latencyScore} ×20% + Grounding ${ins.healthBreakdown.groundingPct ?? "—"} ×20% + Budget headroom ${ins.healthBreakdown.budgetHeadroom} ×15% + Feedback ${ins.healthBreakdown.feedbackScore} ×10%`}
                    >
                      Composite score — hover for the formula. Deterministic, not AI-generated: 35% success rate, 20% latency, 20% grounding, 15% budget headroom, 10% feedback.
                    </p>
                  </div>
                </div>
              </Card>

              {/* 2. Live status strip */}
              <Card title="Live status">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge kind={conn?.ok ? "good" : "bad"} dot>OpenAI {conn?.ok ? `reachable · ${ms(conn.ms)}` : "unreachable"}</Badge>
                  <Badge kind={ins.config.keyConfigured ? "good" : "bad"}>Key {ins.config.keyConfigured ? "configured" : "missing"}</Badge>
                  <Badge kind={ins.config.aiEnabled ? "good" : "neutral"}>{ins.config.aiEnabled ? "AI enabled" : "AI disabled"}</Badge>
                  <Badge kind="info">brief: {ins.config.models.brief}</Badge>
                  <Badge kind="info">deep: {ins.config.models.deep}</Badge>
                  <Badge kind="info">sanya: {ins.config.models.sanya}</Badge>
                  <span className="muted" style={{ fontSize: "var(--fs-12)" }}>
                    Last successful analysis: {(() => {
                      const latest = ins.byFeature.filter((f) => f.lastOutcome === "ok").sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt))[0];
                      return latest ? `${relativeTime(latest.lastRunAt)} (${latest.title})` : "never";
                    })()}
                  </span>
                </div>
              </Card>

              {/* 3. Budget & cost */}
              <Card title="Budget & cost" subtitle="Progress bar fill = month-to-date · tick = projected month-end">
                <div className="grid cols-equal">
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-13)", marginBottom: 4 }}>
                      <span>Insights engine</span>
                      <span>{usd(ins.budget.insights.mtdUsd)} / {usd(ins.budget.insights.ceilingUsd)} · projected {usd(ins.budget.insights.projectedUsd)}</span>
                    </div>
                    <ProgressWithMarker pct={ins.budget.insights.usedPct} projectedPct={ins.budget.insights.projectedPct} kind={ins.budget.insights.projectedPct >= 100 ? "bad" : ins.budget.insights.projectedPct >= 70 ? "warn" : "good"} />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-13)", marginBottom: 4 }}>
                      <span>Sanya</span>
                      <span>{usd(ins.budget.sanya.mtdUsd)} / {usd(ins.budget.sanya.ceilingUsd)} · projected {usd(ins.budget.sanya.projectedUsd)}</span>
                    </div>
                    <ProgressWithMarker pct={ins.budget.sanya.usedPct} projectedPct={ins.budget.sanya.projectedPct} kind={ins.budget.sanya.projectedPct >= 100 ? "bad" : ins.budget.sanya.projectedPct >= 70 ? "warn" : "good"} />
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  {ins.dailyCost.length === 0 ? (
                    <EmptyState icon="◆" title="No spend in this period" />
                  ) : (
                    <div style={{ width: "100%", height: 220 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ins.dailyCost} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                          <XAxis dataKey="date" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                          <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--ink)" }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Area type="monotone" dataKey="insightsCost" name="Insights" stackId="1" stroke="var(--ai-violet)" fill="var(--ai-violet)" fillOpacity={0.35} />
                          <Area type="monotone" dataKey="sanyaCost" name="Sanya" stackId="1" stroke="var(--ai-cyan)" fill="var(--ai-cyan)" fillOpacity={0.35} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <DataTable
                    emptyMessage="No runs in this period"
                    columns={[
                      { key: "title", label: "Feature", render: (r) => <Link href={r.page || "#"}>{r.title}</Link> },
                      { key: "costUsd", label: "Cost", align: "right", render: (r) => usd(r.costUsd) },
                      { key: "runs", label: "Runs", align: "right", render: (r) => num(r.runs) },
                    ]}
                    rows={[...ins.byFeature].sort((a, b) => b.costUsd - a.costUsd).map((r) => ({ ...r, id: r.feature }))}
                  />
                </div>
              </Card>

              {/* 4. Performance */}
              <Card title="Performance" subtitle="Latency per feature (non-cache-hit runs) and where time goes within a run">
                <div className="grid cols-equal">
                  <div>
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 6 }}>p95 latency by feature</div>
                    {ins.byFeature.length === 0 ? <EmptyState icon="⏱" title="No runs yet" /> : (
                      <div style={{ width: "100%", height: Math.max(120, ins.byFeature.length * 32) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[...ins.byFeature].sort((a, b) => b.p95 - a.p95)} layout="vertical" margin={{ left: 8, right: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                            <XAxis type="number" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                            <YAxis type="category" dataKey="title" width={140} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12 }} formatter={(v) => ms(v)} />
                            <Bar dataKey="p95" fill="var(--ai-violet)" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 6 }}>Stage breakdown (avg ms/run) — DB work vs OpenAI</div>
                    <div style={{ width: "100%", height: 120 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stageRows} layout="vertical" margin={{ left: 8, right: 12 }}>
                          <XAxis type="number" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
                          <YAxis type="category" dataKey="name" width={80} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12 }} formatter={(v) => ms(v)} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          {Object.keys(STAGE_COLOR).map((k) => (
                            <Bar key={k} dataKey={k} stackId="s" fill={STAGE_COLOR[k]} name={k} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 8 }}>
                      collect = DB queries · compute = aggregation in Node · analyze = OpenAI round trip · verify = schema check + grounding
                    </div>
                  </div>
                </div>
              </Card>

              {/* 5. Reliability */}
              <Card title="Reliability" subtitle="Every run outcome this period, and the last 20 that weren't ok">
                <div className="grid cols-equal">
                  <div style={{ width: "100%", height: 220 }}>
                    {outcomeRows.length === 0 ? <EmptyState icon="✓" title="No runs in this period" /> : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={outcomeRows} dataKey="count" nameKey="outcome" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.outcome} (${e.count})`}>
                            {outcomeRows.map((r) => <Cell key={r.outcome} fill={OUTCOME_COLOR[r.outcome] || "var(--ink-muted)"} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <DataTable
                    tall={ins.recentErrors.length > 8}
                    emptyMessage="No errors in this period"
                    columns={[
                      { key: "createdAt", label: "When", render: (r) => fmtDate(r.createdAt) },
                      { key: "feature", label: "Feature" },
                      { key: "outcome", label: "Outcome", render: (r) => <Badge kind={r.outcome === "pii_blocked" ? "bad" : "warn"}>{r.outcome}</Badge> },
                      { key: "errorMessage", label: "Detail", render: (r) => <span style={{ fontSize: "var(--fs-12)" }}>{r.errorMessage || "—"}</span> },
                    ]}
                    rows={ins.recentErrors.map((r, i) => ({ ...r, id: i }))}
                  />
                </div>
              </Card>

              {/* 6. Quality */}
              <Card title="Quality" subtitle="Grounding = every number the model wrote traced back to FACTS">
                <div className="grid cols-3">
                  <div style={{ textAlign: "center" }}>
                    <AiScoreRing value={ins.quality.groundedRate ?? 100} sentiment={ins.quality.groundedRate == null || ins.quality.groundedRate >= 90 ? "positive" : ins.quality.groundedRate >= 70 ? "neutral" : "critical"} size={96} label="Grounded rate" />
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 6 }}>
                      {ins.quality.groundedChecked} checked · avg {ins.quality.avgUngroundedPerRun} ungrounded value/run
                    </div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 6 }}>Confidence distribution</div>
                    {confidenceRows.length === 0 ? <EmptyState icon="◆" title="No runs yet" /> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {confidenceRows.map((c) => (
                          <div key={c.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-13)" }}>
                            <Badge kind={c.name === "high" ? "good" : c.name === "medium" ? "info" : "warn"}>{c.name}</Badge>
                            <span>{num(c.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 6 }}>Feedback per feature (👍/👎 — resets each time an insight regenerates)</div>
                    <DataTable
                      emptyMessage="No votes yet"
                      columns={[
                        { key: "title", label: "Feature" },
                        { key: "feedbackUp", label: "👍", align: "right" },
                        { key: "feedbackDown", label: "👎", align: "right" },
                      ]}
                      rows={ins.byFeature.filter((f) => f.feedbackUp || f.feedbackDown).map((f) => ({ ...f, id: f.feature }))}
                    />
                  </div>
                </div>
              </Card>

              {/* 7. Efficiency */}
              <Card title="Efficiency" subtitle="Cache hits are OpenAI calls avoided entirely — same answer, zero tokens">
                <div className="grid cols-equal">
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>Cache hit rate</div>
                      <div style={{ fontSize: "var(--fs-24)", fontWeight: 700 }}>{ins.totals.runs ? Math.round((ins.totals.byCache.HIT / ins.totals.runs) * 100) : 0}%</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>Calls avoided (HIT)</div>
                      <div style={{ fontSize: "var(--fs-24)", fontWeight: 700 }}>{num(ins.totals.byCache.HIT)}</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>MISS / FORCED</div>
                      <div style={{ fontSize: "var(--fs-24)", fontWeight: 700 }}>{num(ins.totals.byCache.MISS)} / {num(ins.totals.byCache.FORCED)}</div>
                    </div>
                  </div>
                  <DataTable
                    emptyMessage="No runs in this period"
                    columns={[
                      { key: "title", label: "Feature" },
                      { key: "hitRate", label: "Hit rate", align: "right", render: (r) => `${r.hitRate}%` },
                      { key: "tokens", label: "Tokens", align: "right", render: (r) => num(r.promptTokens + r.completionTokens) },
                    ]}
                    rows={[...ins.byFeature].sort((a, b) => (b.promptTokens + b.completionTokens) - (a.promptTokens + a.completionTokens)).map((r) => ({ ...r, id: r.feature }))}
                  />
                </div>
              </Card>

              {/* 8. Neural Coverage Map */}
              <Card title="Neural Coverage Map" subtitle="Every registered feature — green fresh, amber stale, red failing, grey never run">
                <NeuralCoverageMap coverage={ins.coverage} />
              </Card>

              {/* 9. Privacy */}
              <Card title="Privacy">
                <div className="grid cols-equal">
                  <div>
                    <KpiPair label="PII-guard blocks this period" value={num(ins.privacy.piiBlockedCount)} sub={ins.privacy.lastBlockedAt ? `last: ${relativeTime(ins.privacy.lastBlockedAt)}` : "none"} kind={ins.privacy.piiBlockedCount > 0 ? "warn" : "good"} />
                    <p className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 8 }}>
                      A block means the guard found something personal-looking in an outgoing payload and refused to send it — that is a bug to fix in the feature that built the payload, never a model problem.
                    </p>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: "var(--fs-12)", marginBottom: 6 }}>What the AI never receives</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-13)", lineHeight: 1.6 }}>
                      <li>Names, phones, emails, addresses</li>
                      <li>Free-text notes, remarks, CVs</li>
                      <li>Medical details</li>
                      <li>Any single person&apos;s salary/incentive figures</li>
                    </ul>
                    <p className="muted" style={{ fontSize: "var(--fs-12)", marginTop: 8 }}>
                      People are sent as aliases like <code>E07</code> or <code>P12</code> and re-labelled back to real names only inside our own server, after the model responds.
                    </p>
                  </div>
                </div>
              </Card>

              {/* 10. AI self-diagnosis */}
              <AiBriefPanel feature="ai.selfDiagnosis" scope={aiScope} title="AI Health" enabled={!!filterState} />

              {/* 11. Sanya block — existing content, unchanged data */}
              <h2 style={{ fontSize: "var(--fs-18)", margin: "12px 0 0" }}>Sanya Assistant</h2>
              {!s ? (
                <Card title="No Sanya usage in this period"><EmptyState icon="◆" title="Nothing yet" hint="Ask Sanya something and it will show up here." /></Card>
              ) : (
                <>
                  <InlineNotice kind="info" title="What this measures">
                    One log row per question to <Link href="/owner/ai/sanya">Sanya</Link> (model <code>{data?.config?.model || "…"}</code>): which
                    tools it called and how long they took, tokens and cost, outcome, and whether it refused for lack of data. Question and answer
                    text are never stored.
                  </InlineNotice>
                  <div className="grid cols-3">
                    <KpiPair label="Month-to-date cost" value={usd(mtd?.costUsd)} sub={`${mtd?.budgetUsedPct ?? 0}% of ${usd(data?.config?.monthlyBudgetUsd)} · ${num(mtd?.turns)} turns`} kind={budgetKind} />
                    <KpiPair label="Questions" value={num(s.turns)} sub={`${num(s.users)} user${s.users === 1 ? "" : "s"}`} kind="info" />
                    <KpiPair label="Latency p50/p95" value={`${ms(s.latencyP50Ms)} / ${ms(s.latencyP95Ms)}`} sub={`max ${ms(s.latencyMaxMs)}`} kind="info" />
                    <KpiPair label="Error rate" value={`${s.errorRatePct}%`} sub={`${num(s.piiBlocked)} PII-blocked · ${num(s.rateLimited)} rate-limited`} kind={s.errorRatePct > 5 ? "bad" : "good"} />
                    <KpiPair label="Refusal rate" value={`${s.refusalRatePct}%`} sub={'"I don\'t have that data"'} kind="neutral" />
                    <KpiPair label="Tokens" value={num(s.promptTokens + s.completionTokens)} sub={usd(s.costUsd)} kind="info" />
                  </div>
                  <div className="grid cols-2">
                    <Card title="Questions per day"><TrendChart data={(data?.daily || []).map((d) => ({ date: d.date, value: d.turns }))} label="Questions" /></Card>
                    <Card title="Cost per day"><TrendChart data={(data?.daily || []).map((d) => ({ date: d.date, value: Math.round(d.costUsd * 10000) / 10000 }))} label="USD" /></Card>
                  </div>
                  <div className="grid cols-2">
                    <Card title="By tool">
                      <DataTable
                        emptyMessage="No tool calls yet"
                        columns={[
                          { key: "tool", label: "Tool", render: (r) => <code>{r.tool}</code> },
                          { key: "calls", label: "Calls", align: "right", render: (r) => num(r.calls) },
                          { key: "failed", label: "Failed", align: "right", render: (r) => (r.failed ? <Badge kind="bad">{r.failed}</Badge> : "0") },
                          { key: "avgMs", label: "Avg", align: "right", render: (r) => ms(r.avgMs) },
                        ]}
                        rows={(data?.byTool || []).map((r) => ({ ...r, id: r.tool }))}
                      />
                    </Card>
                    <Card title="Recent errors">
                      <DataTable
                        emptyMessage="No errors in this period"
                        columns={[
                          { key: "createdAt", label: "When", render: (r) => fmtDate(r.createdAt) },
                          { key: "outcome", label: "Outcome", render: (r) => <Badge kind={r.outcome === "pii_blocked" ? "bad" : "warn"}>{r.outcome}</Badge> },
                          { key: "errorMessage", label: "Detail", render: (r) => <span style={{ fontSize: "var(--fs-12)" }}>{(r.errorMessage || "—").slice(0, 160)}</span> },
                        ]}
                        rows={(data?.recentErrors || []).map((r, i) => ({ ...r, id: i }))}
                      />
                    </Card>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiPair({ label, value, sub, kind }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub != null && <span className={`sub${kind ? ` ${kind}` : ""}`}>{sub}</span>}
    </div>
  );
}
