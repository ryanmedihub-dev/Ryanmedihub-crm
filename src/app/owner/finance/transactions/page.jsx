"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, Badge, ErrorState } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee, num, fmtDate } from "@/lib/owner/format";
import { toISTDateKey } from "@/lib/owner/dates";

const CATEGORY_OPTIONS = [
  { value: "ALL", label: "All categories" },
  { value: "TRANSPLANT", label: "Transplant" },
  { value: "SERVICE", label: "Service" },
  { value: "MEDICINE", label: "Medicine" },
  { value: "EXPENSE", label: "Expense" },
];
const CATEGORY_KIND = { TRANSPLANT: "good", SERVICE: "info", MEDICINE: "purple", EXPENSE: "bad" };

// Reuses the existing /api/transactions/get-all directly — the same
// paginated, $facet-backed query /admin/transactions already uses — rather
// than a parallel implementation (Owner Panel v2, Part 5).
export default function FinanceTransactionsPage() {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const aiScope = useMemo(
    () => (filterState ? {
      dateFrom: toISTDateKey(filterState.range.from), dateTo: toISTDateKey(filterState.range.to),
      branch: filterState.filters.branch && filterState.filters.branch !== "All" ? filterState.filters.branch : "",
      category: filterState.filters.category && filterState.filters.category !== "ALL" ? filterState.filters.category : "",
    } : {}),
    [filterState],
  );

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams();
    // get-all takes IST calendar dates, not ISO instants.
    params.set("dateFrom", toISTDateKey(filterState.range.from));
    params.set("dateTo", toISTDateKey(filterState.range.to));
    if (filterState.filters.branch && filterState.filters.branch !== "All") params.set("branch", filterState.filters.branch);
    if (filterState.filters.category && filterState.filters.category !== "ALL") params.set("category", filterState.filters.category);
    if (search) params.set("search", search);
    params.set("sortKey", sortKey);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    return `/api/transactions/get-all?${params.toString()}`;
  }, [filterState, search, sortKey, sortDir, page, pageSize]);

  const { data, loading, error, isValidating, mutate: load } = useOwnerData(url);
  const transactionsAi = useAiInsight("finance.transactions", aiScope, { kind: "brief", enabled: !!filterState });

  const handleSort = (key) => {
    setPage(1);
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const rows = data?.transactions || [];
  const total = data?.total || 0;
  const stats = data?.stats || {};
  const grandTotal = Object.values(stats).reduce((s, c) => s + (c.total || 0), 0);

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="All Transactions"
          subtitle="Full transaction report — same data and query as /admin/transactions"
          aiState={transactionsAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={isValidating} title="Refresh">
              {isValidating ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="finance.transactions" scope={aiScope} title="All Transactions" enabled={!!filterState} aiState={transactionsAi} />

          <FilterBar
            show={["date", "branch"]}
            extras={[{ key: "category", label: "Category", options: CATEGORY_OPTIONS }]}
            defaults={{ category: "ALL" }}
            onChange={({ filters, range }) => { setPage(1); setFilterState({ filters, range }); }}
          />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Total", value: rupee(grandTotal), rawValue: grandTotal, format: "rupee", sub: `${num(total)} rows · excludes settlements & external methods`, kind: "info" },
                  { label: "Transplant", value: rupee(stats.TRANSPLANT?.total), rawValue: stats.TRANSPLANT?.total, format: "rupee", sub: `${num(stats.TRANSPLANT?.count)} txns`, kind: "good" },
                  { label: "Service", value: rupee(stats.SERVICE?.total), rawValue: stats.SERVICE?.total, format: "rupee", sub: `${num(stats.SERVICE?.count)} txns`, kind: "info" },
                  { label: "Medicine", value: rupee(stats.MEDICINE?.total), rawValue: stats.MEDICINE?.total, format: "rupee", sub: `${num(stats.MEDICINE?.count)} txns`, kind: "info" },
                  { label: "Expense", value: rupee(stats.EXPENSE?.total), rawValue: stats.EXPENSE?.total, format: "rupee", sub: `${num(stats.EXPENSE?.count)} txns`, kind: "bad" },
                ]}
              />

              <Card title="Transactions" subtitle={loading ? "Loading…" : `${total} transactions`}>
                <ReportTable
                  tableId="finance-transactions"
                  columns={[
                    { key: "date", label: "Date", sortable: true, render: (r) => fmtDate(r.date) },
                    { key: "transactionCategory", label: "Category", render: (r) => <Badge kind={CATEGORY_KIND[r.transactionCategory || "TRANSPLANT"]}>{r.transactionCategory || "TRANSPLANT"}</Badge> },
                    { key: "procedure", label: "Type", render: (r) => r.procedure || r.expense || "—" },
                    { key: "amount", label: "Amount", align: "right", sortable: true, render: (r) => rupee(r.amount) },
                    { key: "method", label: "Method", sortable: true, render: (r) => r.method || "—" },
                    { key: "branch", label: "Branch", sortable: true, render: (r) => r.branch || "—" },
                    {
                      key: "party", label: "Patient / Vendor",
                      render: (r) => r.patient?.personal?.name || r.patientName || r.expenseGiver?.vendorId?.name || r.expenseGiver?.name || "—",
                    },
                    {
                      key: "settlement", label: "Settlement", defaultHidden: true,
                      render: (r) => (r.isSettlement ? <Badge kind="info">Settlement</Badge> : r.reversalOf ? <Badge kind="bad">Reversal</Badge> : "—"),
                    },
                    {
                      key: "linked", label: "Linked Payable/Receivable", defaultHidden: true,
                      render: (r) => (r.payableId ? "Payable" : r.receivableId ? "Receivable" : "—"),
                    },
                    { key: "createdBy", label: "Entered By", defaultHidden: true, render: (r) => r.createdBy?.name || "—" },
                  ]}
                  rows={rows.map((r) => ({ ...r, id: r._id }))}
                  loading={loading}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  search={search}
                  onSearchChange={(v) => { setSearch(v); setPage(1); }}
                  searchPlaceholder="Search patient / phone / vendor / remarks…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                  csvFilename="finance-transactions.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
