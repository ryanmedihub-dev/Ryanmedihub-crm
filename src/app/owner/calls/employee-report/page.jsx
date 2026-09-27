"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, DataTable, KpiRow, ErrorState, ProgressBar, Badge } from "@/components/owner";
import { AiBriefPanel, AiScanOverlay, aiVerdictColumn } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useAiVerdicts } from "@/lib/ai/client/useAiVerdicts";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num, fmtDateTime } from "@/lib/owner/format";

export default function CallsEmployeeReportPage() {
  const [filterState, setFilterState] = useState(null);
  const [sortKey, setSortKey] = useState("totalCalls");
  const [sortDir, setSortDir] = useState("desc");

  const aiScope = useMemo(() => (filterState ? { dateFrom: filterState.range.from, dateTo: filterState.range.to } : {}), [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    return `/api/owner/calls/employee-report?${new URLSearchParams(aiScope).toString()}`;
  }, [filterState, aiScope]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const rows = data?.rows || [];

  const reportAi = useAiInsight("calls.employeeReport", aiScope, { kind: "brief", enabled: !!filterState });
  const verdicts = useAiVerdicts("calls.employeeReport", aiScope, { enabled: !!filterState });

  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return dir * av.localeCompare(bv || "");
    return dir * ((av ?? -1) - (bv ?? -1));
  });

  const totalCalls = rows.reduce((s, r) => s + (r.totalCalls || 0), 0);
  const avgAttainment = rows.length
    ? Math.round(rows.filter((r) => r.targetAttainment != null).reduce((s, r) => s + r.targetAttainment, 0) / (rows.filter((r) => r.targetAttainment != null).length || 1))
    : 0;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Employee Call Report"
          subtitle="Per-agent call summary, connect rate, and target attainment"
          aiState={reportAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          <AiBriefPanel feature="calls.employeeReport" scope={aiScope} title="Employee Call Report" enabled={!!filterState} aiState={reportAi} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading}
                primaryIndex={0}
                items={[
                  { label: "Agents", value: loading ? "—" : rows.length, sub: "In roster", kind: "info" },
                  { label: "Total Calls", value: loading ? "—" : num(totalCalls), sub: "This period", kind: "info" },
                  { label: "Avg. Target Attainment", value: loading ? "—" : `${avgAttainment}%`, sub: "Against each agent's own dailyTarget", kind: avgAttainment >= 100 ? "good" : "warn" },
                ]}
              />

              <Card title="Employees" subtitle={loading ? "Loading…" : `${rows.length} agents`}>
                <AiScanOverlay active={verdicts.loading}>
                <DataTable
                  tall
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  emptyMessage="No call activity in this range."
                  columns={[
                    {
                      key: "name", label: "Agent", sortable: true,
                      render: (r) => (
                        <span>
                          {r.name}
                          {r.tlName && <span className="muted" style={{ display: "block", fontSize: "var(--fs-12)" }}>TL: {r.tlName}</span>}
                        </span>
                      ),
                    },
                    aiVerdictColumn({ byId: verdicts.byId, loading: verdicts.loading }),
                    { key: "totalCalls", label: "Total Calls", align: "right", sortable: true, render: (r) => num(r.totalCalls) },
                    { key: "connectedCalls", label: "Connected", align: "right", sortable: true, render: (r) => num(r.connectedCalls) },
                    { key: "connectRate", label: "Connect Rate", align: "right", sortable: true, render: (r) => `${r.connectRate || 0}%` },
                    {
                      key: "firstCallAt", label: "Active Call Window", render: (r) => (
                        r.firstCallAt
                          ? <span>{fmtDateTime(r.firstCallAt)} → {fmtDateTime(r.lastCallAt)}</span>
                          : <span className="muted">No calls</span>
                      ),
                    },
                    {
                      key: "targetAttainment", label: "Target Attainment", sortable: true, render: (r) => (
                        r.targetAttainment == null ? (
                          <span className="muted">No target set</span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ minWidth: 220 }}><ProgressBar value={r.targetAttainment} kind={r.targetAttainment >= 100 ? "good" : r.targetAttainment >= 50 ? "warn" : "bad"} /></span>
                            <span>{r.targetAttainment}%</span>
                          </span>
                        )
                      ),
                    },
                    { key: "dailyTarget", label: "Daily Target", align: "right", defaultHidden: true, render: (r) => num(r.dailyTarget) },
                  ]}
                  rows={sorted.map((r) => ({ ...r, id: r.employeeId }))}
                />
                </AiScanOverlay>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
