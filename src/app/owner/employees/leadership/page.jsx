"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, ReportTable, Badge, FilterBar, KpiRow, ErrorState, InlineNotice, Modal,
} from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";

const BAND_KIND = { Excellent: "good", Good: "info", Average: "warn", Bad: "bad" };

function performanceCell(perf) {
  if (!perf || perf.insufficientData) return <Badge kind="neutral">Insufficient data</Badge>;
  return (
    <span title={`${perf.scoredCount} of ${perf.totalCount} members scored`}>
      <Badge kind={BAND_KIND[perf.band] || "neutral"}>{perf.band} · {perf.score}</Badge>
    </span>
  );
}

const STATUS_OPTIONS = [
  { value: "true", label: "Active agents" },
  { value: "false", label: "Inactive agents" },
];

const partialTitle = (t) =>
  t.teamLinkedCount < t.teamSize ? `Partial — only ${t.teamLinkedCount} of ${t.teamSize} team members are linked to callby` : undefined;

export default function LeadershipPage() {
  const router = useRouter();
  const [filterState, setFilterState] = useState(null);

  const [editing, setEditing] = useState(null); // { tlNameKey, tlName, managerName }
  const [managerInput, setManagerInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null); // { kind, title, text }

  const [sortKey, setSortKey] = useState("teamTotalCalls");
  const [sortDir, setSortDir] = useState("desc");

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    if (filterState.filters.branch && filterState.filters.branch !== "All") {
      params.set("branch", filterState.filters.branch);
    }
    if (filterState.filters.isactive) params.set("isactive", filterState.filters.isactive);
    return `/api/owner/employees/leadership?${params.toString()}`;
  }, [filterState]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const teams = data?.teams || [];
  const callbyError = data?.callbyError || null;

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
      setSaveNotice({
        kind: "success",
        title: `Manager set for ${editing.tlName}`,
        text: `${r.data?.employeesUpdated ?? 0} agent record(s) updated with the new manager name.`,
      });
      load();
    } else {
      setSaveNotice({ kind: "error", title: "Could not save manager", text: r.error || "Unknown error" });
    }
  };

  const onSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "tlName" || key === "managerName" || key === "branch" ? "asc" : "desc");
    }
  };

  const sortedTeams = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (t) => (sortKey === "teamPerformance" ? t.teamPerformance?.score ?? -1 : t[sortKey]);
    return [...teams]
      .sort((a, b) => {
        const av = val(a); const bv = val(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
      })
      .map((t) => ({ ...t, id: t.tlNameKey }));
  }, [teams, sortKey, sortDir]);

  const totalTeams = teams.length;
  const totalAgents = teams.reduce((s, t) => s + t.teamSize, 0);
  const totalCalls = teams.reduce((s, t) => s + t.teamTotalCalls, 0);
  const unmapped = teams.filter((t) => !t.managerMapped).length;

  const columns = [
    {
      key: "tlName",
      label: "TL",
      sortable: true,
      render: (t) => (
        <span title={t.distinctSpellings.length > 1 ? `Spelling variants: ${t.distinctSpellings.join(", ")}` : undefined}>
          {t.tlName}
          {t.distinctSpellings.length > 1 && (
            <span className="cell-badge"><Badge kind="warn">{t.distinctSpellings.length} spellings</Badge></span>
          )}
        </span>
      ),
      csv: (t) => t.tlName,
    },
    { key: "branch", label: "Branch", sortable: true, render: (t) => t.branch || "—" },
    {
      key: "teamSize",
      label: "Team Size",
      align: "right",
      sortable: true,
      render: (t) => (
        <span className="cell-inline">
          {num(t.teamSize)}
          {t.teamLinkedCount < t.teamSize && <Badge kind="warn">{t.teamSize - t.teamLinkedCount} not linked</Badge>}
        </span>
      ),
      csv: (t) => t.teamSize,
    },
    { key: "teamTotalCalls", label: "Total Calls", align: "right", sortable: true, render: (t) => <span title={partialTitle(t)}>{num(t.teamTotalCalls)}</span> },
    { key: "teamInterested", label: "Interested (engagement)", align: "right", sortable: true, render: (t) => <span title={partialTitle(t)}>{num(t.teamInterested)}</span> },
    { key: "teamPatientsVisited", label: "Patients Visited", align: "right", sortable: true, render: (t) => num(t.teamPatientsVisited) },
    { key: "teamConverted", label: "Converted", align: "right", sortable: true, render: (t) => num(t.teamConverted) },
    { key: "teamPerformance", label: "Team Performance", sortable: true, render: (t) => performanceCell(t.teamPerformance), csv: (t) => t.teamPerformance?.score ?? "" },
    {
      key: "managerName",
      label: "Manager",
      sortable: true,
      render: (t) => (
        <span className="cell-inline">
          {t.managerName || <span className="muted">— (unmapped)</span>}
          <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); openEdit(t); }}>
            {t.managerName ? "Edit" : "Set"}
          </button>
        </span>
      ),
      csv: (t) => t.managerName || "",
    },
    { key: "tlSalary", label: "TL Salary", align: "right", defaultHidden: true, render: (t) => (t.tlEmployeeFound ? rupee(t.tlSalary) : "—") },
    { key: "tlIncentiveRate", label: "TL Incentive Rate", align: "right", defaultHidden: true, render: (t) => (t.tlEmployeeFound ? `${t.tlIncentiveRate ?? 0} (rate)` : "—") },
  ];

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
          <FilterBar
            show={["date", "branch"]}
            extras={[{ key: "isactive", label: "Agents", options: STATUS_OPTIONS }]}
            defaults={{ isactive: "true" }}
            onChange={({ filters, range }) => setFilterState({ filters, range })}
          />

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
                  { label: "Total Calls", value: loading ? "—" : num(totalCalls), sub: "This period (linked members)", kind: "info" },
                  { label: "Unmapped Managers", value: loading ? "—" : unmapped, sub: "No TL → Manager mapping yet", kind: unmapped ? "warn" : "good" },
                ]}
              />

              {callbyError && (
                <InlineNotice kind="error" title="callby data may be incomplete">{callbyError}</InlineNotice>
              )}
              {saveNotice && (
                <InlineNotice kind={saveNotice.kind} title={saveNotice.title} onClose={() => setSaveNotice(null)}>
                  {saveNotice.text}
                </InlineNotice>
              )}

              <Card title="Teams" subtitle={loading ? "Loading…" : `${totalTeams} ${totalTeams === 1 ? "team" : "teams"}`}>
                <ReportTable
                  tableId="employees-leadership"
                  columns={columns}
                  rows={sortedTeams}
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  emptyMessage="No teams in this range/branch."
                  onRowClick={(row) => router.push(`/owner/employees/leadership/${encodeURIComponent(row.tlNameKey)}`)}
                  csvFilename="employees-leadership.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Manager for ${editing?.tlName || ""}`}>
        <div className="form-stack">
          <input
            className="control"
            placeholder="Manager name"
            value={managerInput}
            onChange={(e) => setManagerInput(e.target.value)}
            autoFocus
          />
          <p className="muted">Every agent on this team gets this manager name on their record.</p>
          <button className="primary" disabled={saving || !managerInput.trim()} onClick={saveManager}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
