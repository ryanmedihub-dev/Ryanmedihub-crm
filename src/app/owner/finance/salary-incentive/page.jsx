"use client";

import { useCallback, useEffect, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, DataTable, ErrorState, InlineNotice } from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";
import { rupee, num } from "@/lib/owner/format";

// Uses the exact same buildCompensationMetrics Part 1's Employees pages call
// (via /api/owner/finance/salary-incentive), so these figures agree with
// Part 1 by construction (Owner Panel v2, Part 5).
export default function FinanceSalaryIncentivePage() {
  const [filterState, setFilterState] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("baseSalaryDue");
  const [sortDir, setSortDir] = useState("desc");

  const load = useCallback(
    async ({ signal } = {}) => {
      if (!filterState) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("dateFrom", filterState.range.from);
      params.set("dateTo", filterState.range.to);
      if (filterState.filters.branch && filterState.filters.branch !== "All") params.set("branch", filterState.filters.branch);
      const r = await ownerFetch(`/api/owner/finance/salary-incentive?${params.toString()}`, { signal });
      if (r.aborted) return;
      if (r.ok) setData(r.data);
      else setError(r.error);
      setLoading(false);
    },
    [filterState],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const rows = data?.rows || [];
  const filtered = search
    ? rows.filter((r) => r.name?.toLowerCase().includes(search.toLowerCase()) || r.role?.toLowerCase().includes(search.toLowerCase()))
    : rows;
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return dir * av.localeCompare(bv || "");
    return dir * ((av ?? -1) - (bv ?? -1));
  });

  const totalSalaryDue = rows.reduce((s, r) => s + r.baseSalaryDue, 0);
  const totalSalaryPaid = rows.reduce((s, r) => s + r.salaryPaid, 0);
  const totalIncentiveDue = rows.reduce((s, r) => s + r.incentiveDue, 0);
  const totalIncentivePaid = rows.reduce((s, r) => s + r.incentivePaid, 0);

  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Salary & Incentive"
          subtitle="Payable purpose: SALARY, joined to Employee — same source as Part 1's Employees pages"
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
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Salary Due", value: rupee(totalSalaryDue), sub: "This period", kind: "info" },
                  { label: "Salary Paid", value: rupee(totalSalaryPaid), sub: "This period", kind: "good" },
                  { label: "Incentive Due", value: rupee(totalIncentiveDue), sub: "This period", kind: "info" },
                  { label: "Incentive Paid", value: rupee(totalIncentivePaid), sub: "This period", kind: "good" },
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

              <Card title="Employees" subtitle={loading ? "Loading…" : `${sorted.length} employees with salary/incentive activity this period`}>
                <ReportTable
                  tableId="finance-salary-incentive"
                  columns={[
                    { key: "name", label: "Name", sortable: true },
                    { key: "role", label: "Role" },
                    { key: "branch", label: "Branch" },
                    { key: "operatingUnit", label: "Operating Unit", defaultHidden: true, render: (r) => r.operatingUnit || "—" },
                    { key: "baseSalaryDue", label: "Salary Due", align: "right", sortable: true, render: (r) => rupee(r.baseSalaryDue) },
                    { key: "salaryPaid", label: "Salary Paid", align: "right", sortable: true, render: (r) => rupee(r.salaryPaid) },
                    { key: "salaryPending", label: "Salary Pending", align: "right", sortable: true, render: (r) => rupee(r.salaryPending) },
                    { key: "incentiveDue", label: "Incentive Due", align: "right", sortable: true, defaultHidden: true, render: (r) => rupee(r.incentiveDue) },
                    { key: "incentivePaid", label: "Incentive Paid", align: "right", sortable: true, render: (r) => rupee(r.incentivePaid) },
                    { key: "incentivePending", label: "Incentive Pending", align: "right", sortable: true, defaultHidden: true, render: (r) => rupee(r.incentivePending) },
                  ]}
                  rows={sorted.map((r) => ({ ...r, id: r.id }))}
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  search={search}
                  onSearchChange={setSearch}
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
