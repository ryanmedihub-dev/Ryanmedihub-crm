"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, DataTable, Badge, KpiRow, ErrorState, EmptyState } from "@/components/owner";
import { ALL_BRANCHES } from "@/lib/branches";

const BRANCHES = ["All", ...ALL_BRANCHES];
const rupee = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export default function StaffPage() {
  const [branch, setBranch]     = useState("All");
  const [activeOnly, setActiveOnly] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = branch !== "All" ? `?branch=${encodeURIComponent(branch)}` : "";
      const res = await fetch(`/api/owner/staff-360${qs}`);
      const json = await res.json();
      if (json.success) setEmployees(json.employees || []);
      else setError(json.message || "Failed to load");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const rows = useMemo(() => {
    let filtered = activeOnly ? employees.filter((e) => e.isactive) : employees;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (typeof a[sortKey] === "string") return dir * String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""));
      return dir * ((a[sortKey] || 0) - (b[sortKey] || 0));
    });
  }, [employees, activeOnly, sortKey, sortDir]);

  const activeCount = employees.filter((e) => e.isactive).length;
  const totalPayroll = employees.reduce((s, e) => s + (e.baseSalary || 0), 0);
  const totalPatients = employees.reduce((s, e) => s + (e.patientsHandled || 0), 0);
  const roleCount = new Set(employees.map((e) => e.role).filter(Boolean)).size;

  const kpiItems = [
    { label: "Headcount", value: loading ? "—" : employees.length, sub: `${activeCount} active`, kind: "info" },
    { label: "Base payroll", value: loading ? "—" : rupee(totalPayroll), sub: "Sum of base salary", kind: "info" },
    { label: "Roles", value: loading ? "—" : roleCount, sub: "Distinct roles", kind: "info" },
    { label: "Patients handled", value: loading ? "—" : new Intl.NumberFormat("en-IN").format(totalPatients), sub: "All staff", kind: "info" },
  ];

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="All Staff 360°"
          subtitle="Real fields only — no attendance/productivity/quality/compliance scoring exists in this data"
          controls={
            <>
              <select className="control" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--muted)" }}>
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                Active only
              </label>
              <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh">
                {loading ? "…" : "⟳"}
              </button>
            </>
          }
        />

        <div className="content">
          {error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : (
            <>
              <KpiRow items={kpiItems} primaryIndex={0} loading={loading} />

              <Card
                title="Staff directory"
                subtitle={loading ? "Loading…" : `${rows.length} of ${employees.length} employees · ${activeCount} active`}
              >
                <DataTable
                  tall
                  loading={loading}
                  emptyMessage={<EmptyState icon="☰" title="No employees found" hint="Adjust the branch filter or the active-only toggle." />}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  columns={[
                    { key: "name", label: "Name", sortable: true },
                    { key: "role", label: "Role", sortable: true },
                    { key: "branch", label: "Branch", sortable: true },
                    { key: "isactive", label: "Status", render: (r) => <Badge kind={r.isactive ? "good" : "neutral"} glyph>{r.isactive ? "Active" : "Inactive"}</Badge> },
                    { key: "baseSalary", label: "Base salary", sortable: true, align: "right", render: (r) => rupee(r.baseSalary) },
                    { key: "incentiveRate", label: "Incentive rate", sortable: true, align: "right", render: (r) => rupee(r.incentiveRate) },
                    { key: "patientsHandled", label: "Patients handled", sortable: true, align: "right" },
                  ]}
                  rows={loading ? [] : rows}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
