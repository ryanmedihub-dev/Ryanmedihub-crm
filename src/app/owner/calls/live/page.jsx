"use client";

import { useEffect } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Badge, KpiRow, ErrorState, EmptyState } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";

const POLL_MS = 60_000; // page data
const AI_POLL_MS = 180_000; // brief re-check — server HIT if nothing changed

// Agent-status half of the old combined "Live Workforce & Queue" page — the
// P0-P4 retry lanes moved to /owner/leads/retry (Owner Panel v2, Part 2),
// since they're lead-priority queues, not call/agent data. Each page now
// fetches only what it renders.
export default function LiveAgentStatusPage() {
  const { data, loading, error, mutate: refresh } = useOwnerData("/api/owner/calls/live", { refreshInterval: POLL_MS });
  const agents = data?.agents || [];

  const liveAi = useAiInsight("calls.live", {}, { kind: "brief" });
  useEffect(() => {
    const id = setInterval(() => liveAi.poll(), AI_POLL_MS);
    return () => clearInterval(id);
  }, [liveAi.poll]);

  const totalCalls = agents.reduce((s, a) => s + (a.calls?.total || 0), 0);
  const totalConnected = agents.reduce((s, a) => s + (a.calls?.connected || 0), 0);

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Live Agent Status"
          subtitle="Per-agent call activity, live from callby"
          aiState={liveAi}
          controls={
            <button className="icon-btn" onClick={refresh} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="calls.live" scope={{}} title="Live Agent Status" compact aiState={liveAi} />
          <p className="muted" style={{ fontSize: "var(--fs-12)", marginTop: -8 }}>Live · re-analyses every 3 min when data changes</p>

          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <>
              <KpiRow
                primaryIndex={2}
                loading={loading}
                items={[
                  { label: "Total Agents", value: loading ? "—" : agents.length, sub: "In roster", kind: "info" },
                  { label: "Active", value: loading ? "—" : agents.filter((a) => a.isActive).length, sub: "Currently active", kind: "good" },
                  { label: "Total Calls", value: loading ? "—" : totalCalls, sub: "This range", kind: "info" },
                  {
                    label: "Blended Connect Rate",
                    value: loading ? "—" : totalCalls > 0 ? `${Math.round((totalConnected / totalCalls) * 100)}%` : "—",
                    sub: "Calls connected",
                    kind: "good",
                  },
                ]}
              />

              <Card title="Agent Status" subtitle={loading ? "Loading…" : `${agents.length} agents`}>
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage={<EmptyState icon="☏" title="No agent data" hint="Agent status arrives from callby once agents start dialling." />}
                  columns={[
                    { key: "name", label: "Agent" },
                    { key: "tlName", label: "Team", render: (a) => a.tlName || "Unassigned" },
                    {
                      key: "isActive",
                      label: "Status",
                      render: (a) => <Badge kind={a.isActive ? "good" : "neutral"} glyph>{a.isActive ? "Active" : "Inactive"}</Badge>,
                    },
                    { key: "calls", label: "Calls", align: "right", render: (a) => a.calls?.total ?? "—" },
                    { key: "connected", label: "Connected", align: "right", render: (a) => a.calls?.connected ?? "—" },
                    { key: "connectRate", label: "Connect Rate", align: "right", render: (a) => a.calls ? `${Math.round((a.calls.connectRate || 0) * 100)}%` : "—" },
                    { key: "leadsAssigned", label: "Leads Assigned", align: "right", render: (a) => a.leads?.assigned ?? "—" },
                  ]}
                  rows={loading ? [] : agents.map((a, i) => ({ ...a, id: a.employeeId || i }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
