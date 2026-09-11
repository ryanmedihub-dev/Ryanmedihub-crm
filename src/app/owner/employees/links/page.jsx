"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import {
  OwnerTopbar, Card, DataTable, Badge, EmptyState, ErrorState, InlineNotice,
} from "@/components/owner";
import { ownerFetch } from "@/lib/ownerFetch";

// Manual pairing screen for the employee <-> callby links the reconciliation
// script (scripts/link-employees-to-callby.mjs) couldn't match confidently.
// Without this, every Employees page silently under-reports for anyone unlinked.

export default function CallbyLinksPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selEmp, setSelEmp] = useState(null);
  const [selAgent, setSelAgent] = useState(null);
  const [empQuery, setEmpQuery] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async ({ signal } = {}) => {
    setLoading(true);
    setError(null);
    const r = await ownerFetch("/api/owner/callby-links", { signal });
    if (r.aborted) return;
    if (r.ok) setData(r.data);
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  const unlinkedEmployees = data?.unlinkedEmployees || [];
  const unlinkedCallbyAgents = data?.unlinkedCallbyAgents || [];
  const linked = data?.linked || [];
  const counts = data?.counts;

  const filteredEmployees = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return unlinkedEmployees;
    return unlinkedEmployees.filter((e) =>
      [e.name, e.phone, e.employeeId, e.role, e.branch].some((v) => String(v || "").toLowerCase().includes(q)),
    );
  }, [unlinkedEmployees, empQuery]);

  const filteredAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    if (!q) return unlinkedCallbyAgents;
    return unlinkedCallbyAgents.filter((a) =>
      [a.name, a.tlName, a.phone, a.callbyUserId].some((v) => String(v || "").toLowerCase().includes(q)),
    );
  }, [unlinkedCallbyAgents, agentQuery]);

  const doLink = async () => {
    if (!selEmp || !selAgent) return;
    setBusy(true);
    setNotice(null);
    const r = await ownerFetch("/api/owner/callby-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: selEmp._id, callbyUserId: selAgent.callbyUserId }),
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "info", text: `Linked ${selEmp.name} -> ${selAgent.name}.` });
      setSelEmp(null);
      setSelAgent(null);
      load();
    } else {
      setNotice({ kind: "error", text: r.error });
    }
  };

  const doUnlink = async (employeeId, label) => {
    setBusy(true);
    setNotice(null);
    const r = await ownerFetch(`/api/owner/callby-links?employeeId=${encodeURIComponent(employeeId)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "info", text: `Unlinked ${label}.` });
      load();
    } else {
      setNotice({ kind: "error", text: r.error });
    }
  };

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="callby Links"
          subtitle="Pair the employees the reconciliation script couldn't match to a callby user"
          controls={
            <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
              {loading ? "…" : "⟳"}
            </button>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <>
              {counts && (
                <Card title="Reconciliation status">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge kind="info">{counts.linked} linked</Badge>
                    <Badge kind={counts.unlinkedEmployees ? "warn" : "good"}>
                      {counts.unlinkedEmployees} employees unlinked
                    </Badge>
                    <Badge kind={counts.unlinkedCallbyAgents ? "warn" : "good"}>
                      {counts.unlinkedCallbyAgents} callby users unclaimed
                    </Badge>
                  </div>
                </Card>
              )}

              {notice && (
                <InlineNotice kind={notice.kind} title={notice.kind === "error" ? "Couldn't complete that" : "Done"}>
                  {notice.text}
                </InlineNotice>
              )}

              <div className="grid cols-equal">
                <Card
                  title="Unlinked employees"
                  subtitle={loading ? "Loading…" : `${filteredEmployees.length} shown`}
                >
                  <input
                    className="control"
                    style={{ width: "100%", marginBottom: 10 }}
                    placeholder="Search name / phone / ID…"
                    value={empQuery}
                    onChange={(e) => setEmpQuery(e.target.value)}
                  />
                  <DataTable
                    tall
                    loading={loading}
                    emptyMessage={<EmptyState icon="✓" title="Every employee is linked" />}
                    onRowClick={(row) => setSelEmp(row)}
                    columns={[
                      {
                        key: "name",
                        label: "Employee",
                        render: (e) => (
                          <span style={{ fontWeight: selEmp?._id === e._id ? 700 : 400 }}>
                            {selEmp?._id === e._id ? "→ " : ""}{e.name}
                          </span>
                        ),
                      },
                      { key: "role", label: "Role", render: (e) => e.role || "—" },
                      { key: "phone", label: "Phone", render: (e) => e.phone || "—" },
                      { key: "branch", label: "Branch", render: (e) => e.branch || "—" },
                    ]}
                    rows={filteredEmployees.map((e) => ({ ...e, id: e._id }))}
                  />
                </Card>

                <Card
                  title="Unclaimed callby users"
                  subtitle={loading ? "Loading…" : `${filteredAgents.length} shown`}
                >
                  <input
                    className="control"
                    style={{ width: "100%", marginBottom: 10 }}
                    placeholder="Search name / TL…"
                    value={agentQuery}
                    onChange={(e) => setAgentQuery(e.target.value)}
                  />
                  <DataTable
                    tall
                    loading={loading}
                    emptyMessage={<EmptyState icon="✓" title="Every callby user is claimed" />}
                    onRowClick={(row) => setSelAgent(row)}
                    columns={[
                      {
                        key: "name",
                        label: "callby user",
                        render: (a) => (
                          <span style={{ fontWeight: selAgent?.callbyUserId === a.callbyUserId ? 700 : 400 }}>
                            {selAgent?.callbyUserId === a.callbyUserId ? "→ " : ""}{a.name || "(no name)"}
                          </span>
                        ),
                      },
                      { key: "tlName", label: "TL", render: (a) => a.tlName || "—" },
                      { key: "phone", label: "Phone", render: (a) => a.phone || "—" },
                      { key: "callbyUserId", label: "callby ID", render: (a) => <code>{a.callbyUserId}</code> },
                    ]}
                    rows={filteredAgents.map((a) => ({ ...a, id: a.callbyUserId }))}
                  />
                </Card>
              </div>

              <Card title="Create link">
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span>{selEmp ? <strong>{selEmp.name}</strong> : <span className="muted">pick an employee</span>}</span>
                  <span aria-hidden="true">↔</span>
                  <span>{selAgent ? <strong>{selAgent.name}</strong> : <span className="muted">pick a callby user</span>}</span>
                  <button className="primary" disabled={!selEmp || !selAgent || busy} onClick={doLink}>
                    {busy ? "Linking…" : "Link"}
                  </button>
                  {(selEmp || selAgent) && (
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => { setSelEmp(null); setSelAgent(null); }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </Card>

              <Card title="Linked pairs" subtitle={`${linked.length} link${linked.length === 1 ? "" : "s"}`}>
                <DataTable
                  loading={loading}
                  emptyMessage="No links yet — run scripts/link-employees-to-callby.mjs --apply first, then fix the rest here."
                  columns={[
                    { key: "employee", label: "Employee", render: (r) => r.employee?.name },
                    { key: "role", label: "Role", render: (r) => r.employee?.role || "—" },
                    {
                      key: "callbyAgent",
                      label: "callby user",
                      render: (r) => (
                        <>
                          {r.callbyAgent?.name}
                          {r.callbyAgent?.stale && <span style={{ marginLeft: 6 }}><Badge kind="warn">stale</Badge></span>}
                        </>
                      ),
                    },
                    { key: "tlName", label: "TL", render: (r) => r.employee?.tlName || r.callbyAgent?.tlName || "—" },
                    {
                      key: "actions",
                      label: "",
                      align: "right",
                      render: (r) => (
                        <button
                          className="link-btn"
                          disabled={busy}
                          onClick={() => doUnlink(r.employee._id, r.employee.name)}
                        >
                          Unlink
                        </button>
                      ),
                    },
                  ]}
                  rows={linked.map((r) => ({ ...r, id: r.employee?._id }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
