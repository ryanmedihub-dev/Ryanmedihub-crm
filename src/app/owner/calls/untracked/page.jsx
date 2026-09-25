"use client";

import { useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, FilterBar, ReportTable, KpiRow, ErrorState, InlineNotice } from "@/components/owner";
import { AiBriefPanel } from "@/components/owner/ai";
import { useAiInsight } from "@/lib/ai/client/useAiInsight";
import { ownerFetch } from "@/lib/ownerFetch";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { num, fmtDateTime } from "@/lib/owner/format";
import { callTypeBadge } from "@/lib/owner/callsColumns";

// Calls whose number never matched a Lead — business happening outside the
// CRM. High untracked% means agents are working off-system.
export default function UntrackedCallsPage() {
  const [filterState, setFilterState] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [creating, setCreating] = useState(null); // callId currently being turned into a lead
  const [notice, setNotice] = useState(null);

  const aiScope = useMemo(() => (filterState ? { dateFrom: filterState.range.from, dateTo: filterState.range.to } : {}), [filterState]);

  const url = useMemo(() => {
    if (!filterState) return null;
    const params = new URLSearchParams(aiScope);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/owner/calls/untracked?${params.toString()}`;
  }, [filterState, aiScope, search, page, pageSize]);

  const { data, loading, error, mutate: load } = useOwnerData(url);
  const untrackedAi = useAiInsight("calls.untracked", aiScope, { kind: "brief", enabled: !!filterState });

  const createLead = async (call) => {
    setCreating(call._id);
    setNotice(null);
    const r = await ownerFetch("/api/owner/calls/untracked/create-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: call._id,
        name: call.contactName && call.contactName !== "Unknown" ? call.contactName : call.contactNumber,
        phone: call.contactNumber,
        employeeId: call.employeeId?._id || call.employeeId,
      }),
    });
    setCreating(null);
    if (r.ok) {
      setNotice({ kind: "info", text: `Lead created for ${call.contactNumber}.` });
      load();
    } else {
      setNotice({ kind: "error", text: r.error });
    }
  };

  const rows = data?.rows || [];
  const total = data?.total || 0;

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar
          title="Untracked Calls"
          subtitle="Calls to numbers that never matched a lead — business happening outside the CRM"
          aiState={untrackedAi}
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          <AiBriefPanel feature="calls.untracked" scope={aiScope} title="Untracked Calls" enabled={!!filterState} aiState={untrackedAi} />

          <FilterBar show={["date"]} onChange={({ filters, range }) => { setPage(1); setFilterState({ filters, range }); }} />

          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              <KpiRow
                loading={loading || !data}
                primaryIndex={0}
                items={[
                  { label: "Untracked Calls", value: num(total), sub: "This period", kind: "warn" },
                  {
                    label: "Untracked %",
                    value: data ? `${data.untrackedPct}%` : "—",
                    sub: `of ${data ? num(data.totalCalls) : "—"} total calls`,
                    kind: data && data.untrackedPct > 20 ? "bad" : "info",
                  },
                ]}
              />

              {notice && (
                <InlineNotice kind={notice.kind === "error" ? "error" : "info"} title={notice.kind === "error" ? "Couldn't create the lead" : "Done"}>
                  {notice.text}
                </InlineNotice>
              )}

              <Card title="Untracked Calls" subtitle={loading ? "Loading…" : `${total} calls`}>
                <ReportTable
                  tableId="calls-untracked"
                  columns={[
                    { key: "employeeName", label: "Employee", render: (r) => r.employeeName || "Unknown" },
                    { key: "contactNumber", label: "Number", render: (r) => r.contactNumber || "—" },
                    { key: "contactName", label: "Contact Name", render: (r) => r.contactName || "Unknown" },
                    { key: "callType", label: "Call Type", render: (r) => callTypeBadge(r.callType) },
                    { key: "timestamp", label: "When", render: (r) => fmtDateTime(r.timestamp) },
                    {
                      key: "actions",
                      label: "",
                      align: "right",
                      render: (r) => (
                        <button className="btn" disabled={creating === r._id} onClick={() => createLead(r)}>
                          {creating === r._id ? "Creating…" : "Create Lead"}
                        </button>
                      ),
                    },
                  ]}
                  rows={rows.map((r) => ({ ...r, id: r._id }))}
                  loading={loading}
                  search={search}
                  onSearchChange={(v) => { setSearch(v); setPage(1); }}
                  searchPlaceholder="Search number / contact name…"
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                  csvFilename="untracked-calls.csv"
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
