"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import Card from "./Card";
import FilterBar from "./FilterBar";
import ReportTable from "./ReportTable";
import KpiRow from "./KpiRow";
import Badge from "./Badge";
import ErrorState from "./ErrorState";
import InlineNotice from "./InlineNotice";
import TrendChart from "./TrendChart";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, fmtDate } from "@/lib/owner/format";
import { performanceCell } from "@/lib/owner/employeeColumns";

// Generic shell behind all six Employees detail pages (Owner Panel v2, Part 1).
// `rowsColumns` and `kpis(data)` are the only per-role pieces — see
// src/app/owner/employees/agents/[employeeId]/page.jsx for the shape.
export default function EmployeeDetailPage({ listHref, rowsColumns, kpis, trendLabel = "Activity" }) {
  const params = useParams();
  const employeeId = params.employeeId;

  const [filterState, setFilterState] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      qs.set("dateFrom", filterState.range.from);
      qs.set("dateTo", filterState.range.to);
      const r = await ownerFetch(`/api/owner/employees/${employeeId}?${qs.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState, employeeId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const emp = data?.employee;
  const kpiItems = data && kpis ? kpis(data) : [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title={emp?.name || "Employee"}
          subtitle={emp ? `${emp.sectionLabel} · ${emp.branch}` : "Loading…"}
          controls={
            <Link href={listHref} className="btn" style={{ textDecoration: "none" }}>
              ← Back to list
            </Link>
          }
        />

        <div className="content">
          <FilterBar show={["date"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !data ? null : (
            <>
              <Card>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                  <div
                    style={{
                      width: 52, height: 52, borderRadius: "50%", background: "var(--surface-2)",
                      display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700, flex: "none",
                    }}
                    aria-hidden="true"
                  >
                    {(emp.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "var(--fs-18)" }}>{emp.name}</h2>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {emp.employeeId || "No employee ID"} · {emp.role} · {emp.branch}
                    </p>
                  </div>
                  <Badge kind={emp.isactive ? "good" : "neutral"} glyph>{emp.isactive ? "Active" : "Inactive"}</Badge>
                  {!emp.callbyLinked && <Badge kind="warn">Not linked to callby</Badge>}

                  <div style={{ marginLeft: "auto", display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>Joined</div>
                      <strong>{fmtDate(emp.dateOfJoining)}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>TL</div>
                      <strong>{emp.tlName || "—"}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>Manager</div>
                      <strong>{emp.managerName || "— (unmapped)"}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>Performance</div>
                      {performanceCell({ performance: emp.performance })}
                    </div>
                  </div>
                </div>
              </Card>

              {data.callbyError && (
                <InlineNotice kind="error" title="callby data unavailable for this employee">
                  {data.callbyError}
                </InlineNotice>
              )}

              <KpiRow loading={loading} items={kpiItems} primaryIndex={0} />

              <Card title="Trend" subtitle={trendLabel}>
                <TrendChart data={data.trend} label={trendLabel} />
              </Card>

              <Card title={data.rowsLabel || "Detail"} subtitle={`${data.rows.length} row${data.rows.length === 1 ? "" : "s"}`}>
                <ReportTable
                  tableId={`employee-detail-${emp.section}`}
                  columns={rowsColumns}
                  rows={data.rows}
                  loading={loading}
                />
              </Card>

              <Card title="Compensation">
                <div className="grid cols-equal">
                  <div className="metric-row"><span>Base Salary</span><div /><strong>{rupee(emp.salary)}</strong></div>
                  <div className="metric-row"><span>Incentive Rate</span><div /><strong>{emp.incentiveRate || "—"}</strong></div>
                  <div className="metric-row"><span>Salary Paid (this period)</span><div /><strong>{rupee(data.compensation?.salaryPaid)}</strong></div>
                  <div className="metric-row"><span>Incentive Paid (this period)</span><div /><strong>{rupee(data.compensation?.incentivePaid)}</strong></div>
                </div>
              </Card>

              {emp.section === "Agent" && (data.recentCalls?.length > 0 || data.recentLeadChangelog?.length > 0) && (
                <Card title="Recent Activity (from callby)">
                  <ReportTable
                    tableId="employee-detail-recent-activity"
                    columns={[
                      { key: "contactName", label: "Contact" },
                      { key: "type", label: "Type" },
                      { key: "when", label: "When" },
                    ]}
                    rows={[
                      ...(data.recentCalls || []).map((c, i) => ({ id: `call-${i}`, contactName: c.contactName || c.contactNumber, type: c.callType || "Call", when: fmtDate(c.timestamp) })),
                      ...(data.recentLeadChangelog || []).map((c, i) => ({ id: `lead-${i}`, contactName: c.leadName, type: c.action || "Lead update", when: fmtDate(c.changedAt) })),
                    ]}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
