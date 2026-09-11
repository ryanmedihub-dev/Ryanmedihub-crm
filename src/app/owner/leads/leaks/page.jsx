"use client";

import { useEffect, useState, useCallback } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, KpiRow, ErrorState, EmptyState, InlineNotice, AttentionRamp } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee } from "@/lib/owner/format";
import { OWNER_BRANCHES as BRANCHES } from "@/lib/owner/filters";

const ageCol = { key: "age", label: "Age", render: (r) => (r.age != null ? `${r.age}d` : "—") };

export default function LeakControlRoomPage() {
  const [branch, setBranch] = useState("All");
  const [staleLeads, setStaleLeads] = useState([]);
  const [staleLeadsError, setStaleLeadsError] = useState(null);
  const [readyNoSurgery, setReadyNoSurgery] = useState([]);
  const [pendingNoActivity, setPendingNoActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchData = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    const r = await ownerFetch("/api/owner/leaks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
      signal,
    });
    if (r.aborted) return;
    if (r.ok) {
      setStaleLeads(r.data?.staleNewLeads || []);
      setStaleLeadsError(r.data?.staleNewLeadsError || null);
      setReadyNoSurgery(r.data?.readyWithNoSurgeryDate || []);
      setPendingNoActivity(r.data?.pendingWithNoRecentActivity || []);
    } else {
      setError(r.error);
    }
    setLoading(false);
  }, [branch]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchData({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [fetchData]);

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Leak Control Room"
          subtitle="Rule-based checks against real data — no AI scoring, no confidence percentages"
          controls={
            <>
              <select className="control" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
                {loading ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <>
              <KpiRow
                primaryIndex={4}
                loading={loading}
                items={[
                  {
                    label: "Total Flagged",
                    value: loading ? "—" : staleLeads.length + readyNoSurgery.length + pendingNoActivity.length,
                    sub: "Across all 3 rules",
                    kind: "bad",
                  },
                  { label: "Stale New Leads", value: loading ? "—" : staleLeads.length, sub: "24h+ untouched", kind: staleLeadsError ? "neutral" : "warn" },
                  { label: "Ready, No Surgery Date", value: loading ? "—" : readyNoSurgery.length, sub: "Patients", kind: "warn" },
                  { label: "Pending, No Activity", value: loading ? "—" : pendingNoActivity.length, sub: "30d+ no transaction", kind: "warn" },
                  {
                    label: "Pending Amount at Risk",
                    value: loading ? "—" : rupee(pendingNoActivity.reduce((s, r) => s + (r.pendingAmount || 0), 0)),
                    sub: "Stale collections",
                    kind: "bad",
                  },
                  { label: "Branch", value: branch, sub: "Current scope", kind: "info" },
                ]}
              />
              <Card
                title="Stale new leads"
                subtitle={loading ? "Loading…" : `${staleLeads.length} leads · status "new" for 24h+`}
                actions={<AttentionRamp level={2} label="Attention" />}
              >
                {staleLeadsError && (
                  <InlineNotice kind="error" title="Couldn't load live lead data">{staleLeadsError}</InlineNotice>
                )}
                <DataTable
                  loading={loading}
                  emptyMessage={<EmptyState icon="✓" title={staleLeadsError ? "Unavailable" : "None flagged"} hint={staleLeadsError ? "Live lead data is temporarily unreachable." : "No new lead has sat untouched past 24h."} />}
                  columns={[
                    { key: "name", label: "Lead" },
                    { key: "phone", label: "Phone" },
                    { ...ageCol, align: "right" },
                  ]}
                  rows={loading ? [] : staleLeads}
                />
              </Card>

              <Card
                title="Ready for surgery, no date set"
                subtitle={loading ? "Loading…" : `${readyNoSurgery.length} patients`}
                actions={<AttentionRamp level={3} label="High" />}
              >
                <DataTable
                  loading={loading}
                  emptyMessage={<EmptyState icon="✓" title="None flagged" hint="Every surgery-ready patient has a date." />}
                  columns={[
                    { key: "name", label: "Patient" },
                    { key: "phone", label: "Phone" },
                    { key: "branch", label: "Branch" },
                    { ...ageCol, align: "right" },
                  ]}
                  rows={loading ? [] : readyNoSurgery}
                />
              </Card>

              <Card
                title="Pending payment, no recent activity"
                subtitle={loading ? "Loading…" : `${pendingNoActivity.length} patients · no transaction in 30 days`}
                actions={<AttentionRamp level={4} label="Critical" />}
              >
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage={<EmptyState icon="✓" title="None flagged" hint="No stale collections older than 30 days." />}
                  columns={[
                    { key: "name", label: "Patient" },
                    { key: "phone", label: "Phone" },
                    { key: "branch", label: "Branch" },
                    { key: "pendingAmount", label: "Pending", align: "right", render: (r) => rupee(r.pendingAmount) },
                    { ...ageCol, align: "right" },
                  ]}
                  rows={loading ? [] : pendingNoActivity}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
