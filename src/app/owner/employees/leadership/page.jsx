"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, DataTable, Badge, FilterBar, KpiRow, ErrorState, InlineNotice, Modal,
} from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";

const BAND_KIND = { Excellent: "good", Good: "info", Average: "warn", Bad: "bad" };

function performanceCell(perf) {
  if (!perf || perf.insufficientData) return <Badge kind="neutral">Insufficient data</Badge>;
  return <Badge kind={BAND_KIND[perf.band] || "neutral"}>{perf.band} · {perf.score}</Badge>;
}

export default function LeadershipPage() {
  const router = useRouter();
  const [filterState, setFilterState] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [callbyError, setCallbyError] = useState(null);

  const [editing, setEditing] = useState(null); // { tlNameKey, tlName, managerName }
  const [managerInput, setManagerInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      if (filterState.filters.branch && filterState.filters.branch !== "All") {
        params.set("branch", filterState.filters.branch);
      }
      const r = await ownerFetch(`/api/owner/employees/leadership?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) {
        setTeams(r.data?.teams || []);
        setCallbyError(r.data?.callbyError || null);
      } else {
        setError(r.error);
      }
      setLoading(false);
    },
    [filterState],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const openEdit = (team) => {
    setEditing(team);
    setManagerInput(team.managerName || "");
  };

  const saveManager = async () => {
    if (!editing || !managerInput.trim()) return;
    setSaving(true);
    const r = await ownerFetch("/api/owner/tl-manager-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tlName: editing.tlName, managerName: managerInput.trim() }),
    });
    setSaving(false);
    if (r.ok) {
      setEditing(null);
      load();
    }
  };

  const totalTeams = teams.length;
  const totalAgents = teams.reduce((s, t) => s + t.teamSize, 0);
  const totalCalls = teams.reduce((s, t) => s + t.teamTotalCalls, 0);
  const unmapped = teams.filter((t) => !t.managerMapped).length;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="TL & Manager"
          subtitle="Rows are teams, grouped by TL — click a row for the full roster"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading}
                primaryIndex={0}
                items={[
                  { label: "Teams", value: loading ? "—" : totalTeams, sub: "Distinct TLs", kind: "info" },
                  { label: "Agents", value: loading ? "—" : num(totalAgents), sub: "Across all teams", kind: "info" },
                  { label: "Total Calls", value: loading ? "—" : num(totalCalls), sub: "This period", kind: "info" },
                  { label: "Unmapped Managers", value: loading ? "—" : unmapped, sub: "No TlManagerMap row yet", kind: unmapped ? "warn" : "good" },
                ]}
              />

              {callbyError && (
                <InlineNotice kind="error" title="callby data may be incomplete">{callbyError}</InlineNotice>
              )}

              <Card title="Teams" subtitle={loading ? "Loading…" : `${totalTeams} teams`}>
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage="No teams in this range/branch."
                  onRowClick={(row) => router.push(`/owner/employees/leadership/${encodeURIComponent(row.tlNameKey)}`)}
                  columns={[
                    {
                      key: "tlName",
                      label: "TL",
                      render: (t) => (
                        <span title={t.distinctSpellings.length > 1 ? `Spelling variants: ${t.distinctSpellings.join(", ")}` : undefined}>
                          {t.tlName}
                          {t.distinctSpellings.length > 1 && (
                            <span style={{ marginLeft: 6 }}><Badge kind="warn">{t.distinctSpellings.length} spellings</Badge></span>
                          )}
                        </span>
                      ),
                    },
                    { key: "branch", label: "Branch", render: (t) => t.branch || "—" },
                    { key: "teamSize", label: "Team Size", align: "right", render: (t) => num(t.teamSize) },
                    { key: "teamTotalCalls", label: "Total Calls", align: "right", render: (t) => num(t.teamTotalCalls) },
                    { key: "teamTotalLeads", label: "Total Leads", align: "right", render: (t) => num(t.teamTotalLeads) },
                    { key: "teamPatientsVisited", label: "Patients Visited", align: "right", render: (t) => num(t.teamPatientsVisited) },
                    { key: "teamConverted", label: "Converted", align: "right", render: (t) => num(t.teamConverted) },
                    { key: "teamPerformance", label: "Team Performance", render: (t) => performanceCell(t.teamPerformance) },
                    {
                      key: "managerName",
                      label: "Manager",
                      render: (t) => (
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {t.managerName || <span className="muted">— (unmapped)</span>}
                          <button
                            type="button"
                            className="link-btn"
                            onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                          >
                            {t.managerName ? "Edit" : "Set"}
                          </button>
                        </span>
                      ),
                    },
                    { key: "tlSalary", label: "TL Salary", align: "right", render: (t) => (t.tlEmployeeFound ? rupee(t.tlSalary) : "—") },
                    { key: "tlIncentiveRate", label: "TL Incentive Rate", align: "right", render: (t) => (t.tlEmployeeFound ? `${t.tlIncentiveRate ?? 0} (rate)` : "—") },
                  ]}
                  rows={teams.map((t) => ({ ...t, id: t.tlNameKey }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Manager for ${editing?.tlName || ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="control"
            placeholder="Manager name"
            value={managerInput}
            onChange={(e) => setManagerInput(e.target.value)}
            autoFocus
          />
          <button className="primary" disabled={saving || !managerInput.trim()} onClick={saveManager}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
