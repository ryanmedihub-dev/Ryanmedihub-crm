"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import Skeleton, { KpiSkeleton } from "./Skeleton";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num, fmtDate, fmtDateTime } from "@/lib/owner/format";
import { performanceCell } from "@/lib/owner/employeeColumns";
import { usePagedList } from "@/lib/owner/usePagedList";

// Every section's detail base — used to bounce a URL that names the wrong
// section for this employee (e.g. /agents/<counsellorId>) to the right one.
const DETAIL_BASE = {
  Agent: "/owner/employees/agents",
  Counsellor: "/owner/employees/counsellors",
  Surgery: "/owner/employees/surgery-staff",
  HR: "/owner/employees/hr",
  Other: "/owner/employees/other-staff",
};

const RECENT_ACTIVITY_COLUMNS = [
  { key: "contactName", label: "Contact" },
  { key: "type", label: "Type" },
  { key: "when", label: "When" },
];

const LINKED_PATIENTS_COLUMNS = [
  { key: "name", label: "Name", render: (r) => r.name },
  { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
  { key: "branch", label: "Branch", render: (r) => r.branch || "—" },
  { key: "visitDate", label: "Visit Date", render: (r) => fmtDate(r.visitDate) },
  { key: "status", label: "Status", render: (r) => r.status || "—" },
  { key: "totalAmount", label: "Total Amount", align: "right", render: (r) => rupee(r.totalAmount) },
  { key: "amountReceived", label: "Amount Received", align: "right", render: (r) => rupee(r.amountReceived) },
  { key: "pendingAmount", label: "Pending Amount", align: "right", render: (r) => rupee(r.pendingAmount) },
  {
    key: "roles",
    label: "Linked As",
    render: (r) => (
      <div className="entity-badges">
        {(r.roles || []).map((role) => <Badge key={role} kind="info">{role}</Badge>)}
      </div>
    ),
    csv: (r) => (r.roles || []).join(", "),
  },
];

// Generic shell behind all six Employees detail pages. `rowsColumns` is the
// only per-role piece; KPIs, rows, trend and compensation all come from
// /api/owner/employees/[id] for the same date window.
export default function EmployeeDetailPage({ section, listHref, rowsColumns, defaultSort = "visitDate", trendLabel = "Activity" }) {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.employeeId;

  const [filterState, setFilterState] = useState(null);
  const list = usePagedList({ defaultSort, defaultDir: "desc" });

  // All patients linked to this employee in ANY role (Employee.patient), independent of the
  // role-specific rows above — own pagination, own fetch, own request.
  const linkedList = usePagedList({ defaultSort: "visitDate", pageSize: 10 });

  const detailUrl = useMemo(() => {
    if (!filterState) return null;
    const qs = new URLSearchParams(list.query);
    qs.set("dateFrom", filterState.range.from);
    qs.set("dateTo", filterState.range.to);
    return `/api/owner/employees/${employeeId}?${qs.toString()}`;
  }, [filterState, employeeId, list.query]);
  const { data, loading, error, mutate: load } = useOwnerData(detailUrl);

  const linkedUrl = `/api/owner/employees/${employeeId}/linked-patients?page=${linkedList.page}&pageSize=${linkedList.pageSize}`;
  const { data: linked, loading: linkedLoading } = useOwnerData(linkedUrl);

  const emp = data?.employee;

  // A URL under the wrong section for this employee → go to the right one.
  useEffect(() => {
    if (!emp || !section || emp.section === section) return;
    const base = DETAIL_BASE[emp.section];
    if (base) router.replace(`${base}/${emp.id}${typeof window !== "undefined" ? window.location.search : ""}`);
  }, [emp, section, router]);

  const kpiItems = useMemo(
    () =>
      (data?.kpis || []).map((k) => ({
        ...k,
        value: k.format === "currency" ? rupee(k.value) : typeof k.value === "number" ? num(k.value) : k.value,
      })),
    [data],
  );

  const backHref = useMemo(() => {
    const from = filterState?.range?.from;
    const to = filterState?.range?.to;
    const range = filterState?.filters?.range;
    if (!range || range === "Today") return listHref;
    const q = new URLSearchParams({ range });
    if (range === "Custom" && from && to) {
      q.set("from", filterState.filters.from || "");
      q.set("to", filterState.filters.to || "");
    }
    return `${listHref}?${q.toString()}`;
  }, [listHref, filterState]);

  const recentRows = useMemo(
    () => [
      ...(data?.recentCalls || []).map((c, i) => ({
        id: `call-${i}`, contactName: c.contactName || c.contactNumber || "—", type: c.callType || "Call", when: fmtDateTime(c.timestamp),
      })),
      ...(data?.recentLeadChangelog || []).map((c, i) => ({
        id: `lead-${i}`, contactName: c.leadName || "—", type: c.action || "Lead update", when: fmtDateTime(c.changedAt),
      })),
    ],
    [data],
  );

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title={emp?.name || "Employee"}
          subtitle={emp ? `${emp.sectionLabel} · ${emp.branch || "No branch"}` : "Loading…"}
          controls={
            <Link href={backHref} className="btn btn-link">
              ← Back to list
            </Link>
          }
        />

        <div className="content">
          <FilterBar show={["date"]} onChange={({ filters, range }) => { list.resetPage(); setFilterState({ filters, range }); }} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !data ? (
            <>
              <Card><Skeleton height={56} /></Card>
              <KpiSkeleton support={4} />
              <Card><Skeleton height={180} /></Card>
            </>
          ) : (
            <>
              <Card className="entity-header">
                <div className="entity-avatar" aria-hidden="true">
                  {(emp.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="entity-main">
                  <h2>{emp.name}</h2>
                  <p className="muted">
                    {emp.employeeId || "No employee ID"} · {emp.role || "No role"} · {emp.branch || "No branch"}
                  </p>
                  <div className="entity-badges">
                    <Badge kind={emp.isactive ? "good" : "neutral"} glyph>{emp.isactive ? "Active" : "Inactive"}</Badge>
                    {!emp.callbyLinked && <Badge kind="warn">Not linked to callby</Badge>}
                  </div>
                </div>
                <dl className="entity-facts">
                  <div><dt>Joined</dt><dd>{fmtDate(emp.dateOfJoining)}</dd></div>
                  <div><dt>TL</dt><dd>{emp.tlName || "—"}</dd></div>
                  <div><dt>Manager</dt><dd>{emp.managerName || "— (unmapped)"}</dd></div>
                  <div><dt>Performance</dt><dd>{performanceCell({ performance: emp.performance })}</dd></div>
                </dl>
              </Card>

              {data.callbyError && (
                <InlineNotice kind="error" title="callby data unavailable for this employee">
                  {data.callbyError}
                </InlineNotice>
              )}

              <KpiRow loading={loading} items={kpiItems} primaryIndex={0} />

              {rowsColumns.length > 0 && (
                <>
                  <Card title="Trend" subtitle={`${trendLabel} · selected period`}>
                    <TrendChart data={data.trend} label={trendLabel} />
                  </Card>

                  <Card
                    title={data.rowsLabel || "Detail"}
                    subtitle={loading ? "Loading…" : `${num(data.total)} ${data.total === 1 ? "record" : "records"} in period`}
                  >
                    <ReportTable
                      tableId={`employee-detail-${emp.section}`}
                      columns={rowsColumns}
                      rows={data.rows}
                      loading={loading}
                      {...list.tableProps}
                      onSearchChange={undefined}
                      total={data.total}
                      emptyMessage="No records in this period."
                    />
                  </Card>
                </>
              )}

              <Card title="Compensation" subtitle="Salary and incentive for the pay months the date filter covers">
                <div className="grid cols-equal">
                  <div>
                    <div className="metric-pair"><span>Base Salary (monthly)</span><span className="readout">{rupee(emp.salary)}</span></div>
                    <div className="metric-pair"><span>Salary Due</span><span className="readout">{rupee(data.compensation?.salaryPayable)}</span></div>
                    <div className="metric-pair"><span>Salary Paid</span><span className="readout">{rupee(data.compensation?.salaryPaid)}</span></div>
                  </div>
                  <div>
                    <div className="metric-pair"><span>Incentive Rate (setting)</span><span className="readout">{emp.incentiveRate ? `₹${emp.incentiveRate} / patient` : "—"}</span></div>
                    <div className="metric-pair"><span>Incentive Earned</span><span className="readout">{rupee(data.compensation?.incentivePayable)}</span></div>
                    <div className="metric-pair"><span>Incentive Paid</span><span className="readout">{rupee(data.compensation?.incentivePaid)}</span></div>
                  </div>
                </div>
              </Card>

              <Card
                title="All Linked Patients"
                subtitle={linkedLoading ? "Loading…" : `${num(linked?.total || 0)} patient(s) linked in any role — referred, counselled or surgery-side`}
              >
                <ReportTable
                  tableId="employee-detail-linked-patients"
                  columns={LINKED_PATIENTS_COLUMNS}
                  rows={linked?.rows || []}
                  loading={linkedLoading}
                  page={linkedList.page}
                  pageSize={linkedList.pageSize}
                  total={linked?.total || 0}
                  onPageChange={linkedList.tableProps.onPageChange}
                  onPageSizeChange={linkedList.tableProps.onPageSizeChange}
                  emptyMessage="No linked patients."
                  csvFilename={`${emp.name || "employee"}-linked-patients.csv`}
                />
              </Card>

              {emp.section === "Agent" && recentRows.length > 0 && (
                <Card title="Recent Activity (from callby)" subtitle="Calls and lead updates in this period">
                  <ReportTable
                    tableId="employee-detail-recent-activity"
                    columns={RECENT_ACTIVITY_COLUMNS}
                    rows={recentRows}
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
