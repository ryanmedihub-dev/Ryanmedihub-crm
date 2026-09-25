"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, KpiRow, DataTable, ErrorState, InlineNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num } from "@/lib/owner/format";
import { SECTION_LABELS } from "@/lib/owner/employeeSections";

const SECTION_LINKS = {
  Agent: "/owner/employees/agents",
  Counsellor: "/owner/employees/counsellors",
  Surgery: "/owner/employees/surgery-staff",
  HR: "/owner/employees/hr",
  Other: "/owner/employees/other-staff",
};

export default function EmployeesLanding() {
  const router = useRouter();
  const [filterState, setFilterState] = useState(null);

  const aiScope = useMemo(() => {
    if (!filterState) return {};
    const s = { dateFrom: filterState.range.from, dateTo: filterState.range.to };
    if (filterState.filters.branch && filterState.filters.branch !== "All") s.branch = filterState.filters.branch;
    return s;
  }, [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams(aiScope);
    return `/api/owner/employees/overview?${params.toString()}`;
  }, [filterState, aiScope]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const overviewAi = useAiInsight("employees.overview", aiScope, { kind: "brief", enabled: !!filterState });

  const headcount = data?.headcount || [];
  const totalHeadcount = headcount.reduce((s, h) => s + h.total, 0);
  const totalActive = headcount.reduce((s, h) => s + h.active, 0);

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Employees"
          subtitle="Headcount, pay and performance across every role — links to each sub-page below"
          aiState={overviewAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <FilterBar show={["date", "branch"]} onChange={({ filters, range }) => setFilterState({ filters, range })} />

          <AiBriefPanel feature="employees.overview" scope={aiScope} title="Employees" enabled={!!filterState} aiState={overviewAi} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Total Headcount", value: num(totalHeadcount), sub: `${totalHeadcount - totalActive} inactive`, kind: "info" },
                  { label: "Active", value: num(totalActive), sub: "Across every role", kind: "good" },
                  { label: "Salary Paid", value: rupee(data?.totalSalaryPaid), sub: "This period", kind: "info" },
                  { label: "Incentive Paid", value: rupee(data?.totalIncentivePaid), sub: "This period", kind: "info" },
                ]}
              />

              {data?.callbyError && (
                <InlineNotice kind="error" title="callby data may be incomplete">{data.callbyError}</InlineNotice>
              )}

              <div className="grid cols-equal">
                <Card title="Headcount by Role">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "label", label: "Role" },
                      { key: "total", label: "Headcount", align: "right", render: (r) => num(r.total) },
                      { key: "active", label: "Active", align: "right", render: (r) => num(r.active) },
                    ]}
                    rows={headcount.map((h) => ({ ...h, id: h.section }))}
                    onRowClick={(row) => router.push(SECTION_LINKS[row.section])}
                  />
                </Card>

                <Card title="Headcount by Branch" subtitle="Click a branch to open the Agents page filtered to it">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "branch", label: "Branch", render: (r) => r.label || r.branch || "(no branch)" },
                      { key: "total", label: "Headcount", align: "right", render: (r) => num(r.total) },
                      { key: "active", label: "Active", align: "right", render: (r) => num(r.active) },
                    ]}
                    rows={(data?.byBranch || []).map((b) => ({ ...b, id: b.branch || "(none)" }))}
                    onRowClick={(row) => router.push(row.branch ? `/owner/employees/agents?branch=${encodeURIComponent(row.branch)}` : "/owner/employees/other-staff")}
                  />
                </Card>
              </div>

              <div className="grid cols-equal">
                {["Agent", "Counsellor", "Surgery", "HR"].map((section) => {
                  const p = data?.performers?.[section];
                  const coverage = p && p.total != null ? ` · ${p.scoredCount} of ${p.total} scored` : "";
                  return (
                    <Card key={section} title={`${SECTION_LABELS[section]} — Top / Bottom`} subtitle={`By performance score, this period${coverage}`}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <p className="muted" style={{ margin: "0 0 6px", fontSize: "var(--fs-12)" }}>Top</p>
                          {(p?.top || []).map((r) => (
                            <div key={r.id} className="metric-pair"><span>{r.name}</span><span className="readout">{r.performance.score}</span></div>
                          ))}
                          {!loading && (!p?.top || p.top.length === 0) && <p className="muted">Not enough data</p>}
                        </div>
                        <div>
                          <p className="muted" style={{ margin: "0 0 6px", fontSize: "var(--fs-12)" }}>Bottom</p>
                          {(p?.bottom || []).map((r) => (
                            <div key={r.id} className="metric-pair"><span>{r.name}</span><span className="readout">{r.performance.score}</span></div>
                          ))}
                          {!loading && (!p?.bottom || p.bottom.length === 0) && <p className="muted">Not enough data</p>}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Card title="Jump to a page">
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {[
                    { href: "/owner/employees/agents", label: "Agents" },
                    { href: "/owner/employees/counsellors", label: "Counsellors" },
                    { href: "/owner/employees/surgery-staff", label: "Surgery Staff" },
                    { href: "/owner/employees/hr", label: "HR" },
                    { href: "/owner/employees/other-staff", label: "Other Staff" },
                    { href: "/owner/employees/leadership", label: "TL & Manager" },
                    { href: "/owner/employees/links", label: "callby Links" },
                  ].map((it) => (
                    <Link key={it.href} href={it.href} className="btn" style={{ textAlign: "center", textDecoration: "none" }}>
                      {it.label}
                    </Link>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
