"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, DataTable, KpiRow, ErrorState, InlineNotice, Badge } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { num, fmtTime } from "@/lib/owner/format";

const STATUS_OPTIONS = ["Present", "Half-day", "Absent", "Leave", "Holiday"];

const STATUS_KIND = {
  Present: "good",
  "Half-day": "warn",
  Absent: "bad",
  Leave: "info",
  Holiday: "neutral",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayIso());
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null); // employeeId currently being saved
  const [drafts, setDrafts] = useState({}); // employeeId -> { status, note }

  const load = useCallback(
    async ({ signal } = {}) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("date", date);
      if (filterState?.filters?.branch && filterState.filters.branch !== "All") {
        params.set("branch", filterState.filters.branch);
      }
      if (search.trim()) params.set("search", search.trim());
      const r = await ownerFetch(`/api/owner/ai/attendance?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [date, filterState, search],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => load({ signal: ctrl.signal }), search ? 300 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [load]);

  const rows = data?.rows || [];

  const mark = async (employeeId, status, note, source) => {
    setSaving(employeeId);
    const r = await ownerFetch("/api/owner/ai/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, date, status, note: note || "", source: source || "manual" }),
    });
    setSaving(null);
    if (r.ok) {
      setDrafts((d) => ({ ...d, [employeeId]: undefined }));
      load();
    }
  };

  const summary = data?.summary;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Attendance"
          subtitle="Call activity is a signal, not a verdict — every status here was set or confirmed by a person"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <InlineNotice kind="info" title="Why this isn't automatic">
            There is no punch-in system and no login/logout tracking in either callby or ryan-crm today — call
            activity is the only signal available, and it's a proxy at best (an employee on a field visit,
            training, or a non-calling task would show as inactive here without being absent). This page{" "}
            <strong>suggests</strong> a status from that activity; nothing is written to the attendance record
            until a person confirms or overrides it below. Real attendance tracking needs a punch-in flow or an
            integration — worth deciding on separately from this page.
          </InlineNotice>

          <div className="filter-bar">
            <input
              type="date"
              className="control"
              aria-label="Date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              type="text"
              className="control"
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterBar show={["branch"]} onChange={(s) => setFilterState(s)} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              {data?.callbyError && (
                <InlineNotice kind="warn" title="Call activity unavailable">
                  {data.callbyError} — suggestions are unavailable for this date, but marking attendance manually
                  still works below.
                </InlineNotice>
              )}

              <KpiRow
                loading={loading || !summary}
                primaryIndex={0}
                items={[
                  { label: "Marked", value: summary ? `${num(summary.marked)} / ${num(summary.total)}` : "—", sub: "Employees confirmed for this day", kind: "info" },
                  { label: "Unmarked", value: num(summary?.unmarked), sub: "Still need a decision", kind: summary?.unmarked > 0 ? "warn" : "good" },
                  { label: "No Call Activity", value: num(summary?.noActivity), sub: "Zero calls logged today", kind: "warn" },
                  { label: "Not Linked to callby", value: num(summary?.unlinked), sub: "No suggestion possible", kind: "neutral" },
                ]}
              />

              <Card title={`Register — ${date}`} subtitle="Suggested status is a starting point; confirm it or pick a different one">
                <DataTable
                  tall
                  loading={loading}
                  columns={[
                    { key: "name", label: "Employee", render: (r) => (
                      <span>
                        {r.name}
                        <span className="muted" style={{ marginLeft: 6, fontSize: "var(--fs-12)" }}>{r.role}</span>
                      </span>
                    ) },
                    { key: "branch", label: "Branch" },
                    { key: "calls", label: "Calls", align: "right", render: (r) => (r.callbyLinked ? `${num(r.totalCalls)} (${num(r.connectedCalls)} connected)` : "—") },
                    { key: "window", label: "Active Window", render: (r) => (r.activeWindowStart ? `${fmtTime(r.activeWindowStart)} – ${fmtTime(r.activeWindowEnd)}` : "—") },
                    { key: "target", label: "Target Attainment", align: "right", render: (r) => (r.targetAchievement == null ? "—" : `${r.targetAchievement}%`) },
                    { key: "suggested", label: "Suggested", render: (r) => (r.suggestedStatus ? <Badge kind={STATUS_KIND[r.suggestedStatus] || "neutral"} dot>{r.suggestedStatus}</Badge> : <span className="muted">—</span>) },
                    {
                      key: "status",
                      label: "Confirmed Status",
                      render: (r) => {
                        const draft = drafts[r.employeeId];
                        const value = draft?.status ?? r.markedStatus ?? "";
                        return (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <select
                              className="control"
                              value={value}
                              onChange={(e) =>
                                setDrafts((d) => ({ ...d, [r.employeeId]: { ...d[r.employeeId], status: e.target.value } }))
                              }
                            >
                              <option value="" disabled>Choose…</option>
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                            {r.markedStatus && !draft && (
                              <Badge kind={STATUS_KIND[r.markedStatus] || "neutral"}>{r.markedSource === "suggested" ? "confirmed" : "manual"}</Badge>
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      key: "actions",
                      label: "",
                      render: (r) => {
                        const draft = drafts[r.employeeId];
                        const isSaving = saving === r.employeeId;
                        return (
                          <div style={{ display: "flex", gap: 6 }}>
                            {r.suggestedStatus && !r.markedStatus && !draft && (
                              <button
                                type="button"
                                className="btn"
                                disabled={isSaving}
                                onClick={() => mark(r.employeeId, r.suggestedStatus, "", "suggested")}
                              >
                                {isSaving ? "…" : `Confirm ${r.suggestedStatus}`}
                              </button>
                            )}
                            {draft?.status && (
                              <button
                                type="button"
                                className="btn"
                                disabled={isSaving}
                                onClick={() => mark(r.employeeId, draft.status, draft.note, "manual")}
                              >
                                {isSaving ? "…" : "Save"}
                              </button>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                  rows={rows}
                  emptyMessage="No employees match this filter"
                />
              </Card>

              <Card title="What 'Active Window' means" subtitle="First to last call timestamp for the day — call activity, not working hours or attendance">
                <p className="muted" style={{ margin: 0 }}>
                  This is deliberately labelled &quot;active call window&quot;, never &quot;working hours&quot; — it says
                  nothing about when someone arrived, left, or whether they were doing non-calling work. Treat it as one
                  input into a human decision, not a fact about presence.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
