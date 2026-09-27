"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, DataTable, ErrorState, InlineNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { usePagedList } from "@/lib/owner/usePagedList";
import { rupee, num } from "@/lib/owner/format";

export default function FinanceSalaryIncentivePage() {
  const [filterState, setFilterState] = useState(null);
  const list = usePagedList({ defaultSort: "name", defaultDir: "asc" });

  const aiScope = useMemo(
    () => (filterState ? { dateFrom: filterState.range.from, dateTo: filterState.range.to, branch: filterState.filters.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "" } : {}),
    [filterState],
  );

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    params.set("dateFrom", filterState.range.from);
    params.set("dateTo", filterState.range.to);
    if (filterState.filters.branch && filterState.filters.branch !== "All") params.set("branch", filterState.filters.branch);
    return `/api/owner/finance/salary-incentive?${params.toString()}&${list.query}`;
  }, [filterState, list.query]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const salaryAi = useAiInsight("finance.salaryIncentive", aiScope, { kind: "brief", enabled: !!filterState });

  const totals = data?.totals;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Salary & Incentive"
          subtitle="Payable purpose: SALARY, joined to Employee — same source as Part 1's Employees pages"
          aiState={salaryAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="finance.salaryIncentive" scope={aiScope} title="Salary & Incentive" enabled={!!filterState} aiState={salaryAi} />

          <FilterBar
            show={["date", "branch"]}
            defaults={{ range: "Last 30 Days" }}
            onChange={({ filters, range }) => { list.resetPage(); setFilterState({ filters, range }); }}
          />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Salary Due", value: rupee(totals?.salaryDue), rawValue: totals?.salaryDue, format: "rupee", sub: `${num(totals?.employees)} employees`, kind: "info" },
                  { label: "Salary Paid", value: rupee(totals?.salaryPaid), rawValue: totals?.salaryPaid, format: "rupee", sub: "This period", kind: "good" },
                  { label: "Incentive Due", value: rupee(totals?.incentiveDue), rawValue: totals?.incentiveDue, format: "rupee", sub: "This period", kind: "info" },
                  { label: "Incentive Paid", value: rupee(totals?.incentivePaid), rawValue: totals?.incentivePaid, format: "rupee", sub: "This period", kind: "good" },
                ]}
              />

              <InlineNotice kind="info" title="Operating unit vs branch">
                A bulk salary import mapped 5 operating units (Backend, Vaishali, GD, CD, Collab) onto
                the single "Delhi" branch. The Operating Unit column/rollup below recovers that split
                from the payable's remarks where present; rows without a parsed unit fall back to branch.
              </InlineNotice>

              <div className="grid cols-equal">
                <Card title="By Branch">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "key", label: "Branch" },
                      { key: "count", label: "Employees", align: "right", render: (r) => num(r.count) },
                      { key: "salaryDue", label: "Salary Due", align: "right", render: (r) => rupee(r.salaryDue) },
                      { key: "salaryPaid", label: "Salary Paid", align: "right", render: (r) => rupee(r.salaryPaid) },
                    ]}
                    rows={(data?.byBranch || []).map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
                <Card title="By Operating Unit" subtitle="Parsed from import remarks where present">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "key", label: "Unit" },
                      { key: "count", label: "Employees", align: "right", render: (r) => num(r.count) },
                      { key: "salaryDue", label: "Salary Due", align: "right", render: (r) => rupee(r.salaryDue) },
                      { key: "salaryPaid", label: "Salary Paid", align: "right", render: (r) => rupee(r.salaryPaid) },
                    ]}
                    rows={(data?.byOperatingUnit || []).map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
              </div>

              <div className="grid cols-equal">
                <Card title="By Role">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "key", label: "Role" },
                      { key: "count", label: "Employees", align: "right", render: (r) => num(r.count) },
                      { key: "salaryDue", label: "Salary Due", align: "right", render: (r) => rupee(r.salaryDue) },
                    ]}
                    rows={(data?.byRole || []).map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
                <Card title="By Month" subtitle="From Payable.period, where set">
                  <DataTable
                    loading={loading}
                    columns={[
                      { key: "key", label: "Month" },
                      { key: "count", label: "Employees", align: "right", render: (r) => num(r.count) },
                      { key: "salaryDue", label: "Salary Due", align: "right", render: (r) => rupee(r.salaryDue) },
                    ]}
                    rows={(data?.byMonth || []).map((r, i) => ({ ...r, id: i }))}
                  />
                </Card>
              </div>

              <Card title="Employees" subtitle={loading ? "Loading…" : `${data?.total || 0} employees with salary/incentive activity this period`}>
                <ReportTable
                  tableId="finance-salary-incentive"
                  columns={[
                    { key: "name", label: "Name", sortable: true },
                    { key: "role", label: "Role", sortable: true },
                    { key: "branch", label: "Branch", sortable: true },
                    { key: "operatingUnit", label: "Operating Unit", defaultHidden: true, render: (r) => r.operatingUnit || "—" },
                    { key: "baseSalaryDue", label: "Salary Due", align: "right", sortable: true, render: (r) => rupee(r.baseSalaryDue) },
                    { key: "salaryPaid", label: "Salary Paid", align: "right", sortable: true, render: (r) => rupee(r.salaryPaid) },
                    { key: "salaryPending", label: "Salary Pending", align: "right", sortable: true, render: (r) => rupee(r.salaryPending) },
                    { key: "incentiveDue", label: "Incentive Due", align: "right", sortable: true, defaultHidden: true, render: (r) => rupee(r.incentiveDue) },
                    { key: "incentivePaid", label: "Incentive Paid", align: "right", sortable: true, render: (r) => rupee(r.incentivePaid) },
                    { key: "incentivePending", label: "Incentive Pending", align: "right", sortable: true, defaultHidden: true, render: (r) => rupee(r.incentivePending) },
                  ]}
                  rows={(data?.rows || []).map((r) => ({ ...r, id: r.id }))}
                  loading={loading}
                  total={data?.total || 0}
                  {...list.tableProps}
                  searchPlaceholder="Search name / role…"
                  csvFilename="salary-incentive.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
