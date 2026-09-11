"use client";

import { useEffect, useState } from "react";
import Card from "@/components/owner/Card";
import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS } from "@/lib/owner/patientColumns";
import { PATIENT_DIRECT_REFERENCE_NAME } from "@/lib/owner/patientStatus";
import { ownerFetch } from "@/lib/ownerFetch";
import { num, rupee } from "@/lib/owner/format";

// personal.reference points at the Employee named exactly "Ryan" — a
// deliberate sentinel for walk-in/direct patients (confirmed with the user;
// NOT the same as personal.reference being empty — see the Part 3 write-up).
function DirectVsRestCard({ data }) {
  const [allData, setAllData] = useState(null);

  useEffect(() => {
    if (!data?.appliedFilters) return;
    const ctrl = new AbortController();
    (async () => {
      const params = new URLSearchParams({
        preset: "all",
        dateFrom: data.appliedFilters.dateFrom,
        dateTo: data.appliedFilters.dateTo,
        branch: data.appliedFilters.branch,
        pageSize: "1", // totals are computed over the whole match set regardless of page size
      });
      const r = await ownerFetch(`/api/owner/patients?${params.toString()}`, { signal: ctrl.signal });
      if (!r.aborted && r.ok) setAllData(r.data);
    })();
    return () => ctrl.abort();
  }, [data]);

  if (!allData) return null;

  const directConverted = (data.statusBreakdown?.SURGERY_BOOKED || 0) + (data.statusBreakdown?.CLOSED || 0);
  const directRate = data.total ? Math.round((directConverted / data.total) * 1000) / 10 : 0;
  const directRevPerPatient = data.total ? Math.round((data.totals?.receivedSum || 0) / data.total) : 0;

  const allConverted = (allData.statusBreakdown?.SURGERY_BOOKED || 0) + (allData.statusBreakdown?.CLOSED || 0);
  const allRate = allData.total ? Math.round((allConverted / allData.total) * 1000) / 10 : 0;
  const allRevPerPatient = allData.total ? Math.round((allData.totals?.receivedSum || 0) / allData.total) : 0;

  return (
    <Card title="Direct vs. Everyone Else" subtitle="Same period, same branch filter">
      <div className="grid cols-equal">
        <div className="metric-row"><span>Conversion Rate — Direct</span><div /><strong>{directRate}%</strong></div>
        <div className="metric-row"><span>Conversion Rate — All Patients</span><div /><strong>{allRate}%</strong></div>
        <div className="metric-row"><span>Revenue / Patient — Direct</span><div /><strong>{rupee(directRevPerPatient)}</strong></div>
        <div className="metric-row"><span>Revenue / Patient — All Patients</span><div /><strong>{rupee(allRevPerPatient)}</strong></div>
      </div>
    </Card>
  );
}

const config = {
  preset: "direct",
  title: "Direct",
  subtitle: `Patients referenced to the "${PATIENT_DIRECT_REFERENCE_NAME}" sentinel employee — walk-in/direct, not agent-sourced`,
  tableId: "patients-direct",
  defaultSort: "createdAt",
  defaultSortDir: "desc",
  columns: PATIENT_SHARED_COLUMNS.filter((c) => c.key !== "reference"),
  kpis: (data) => [
    { label: "Direct Patients", value: num(data.total), sub: "This period", kind: "info" },
    { label: "Received", value: rupee(data.totals?.receivedSum), sub: "This period", kind: "good" },
  ],
  extraContent: (data) => <DirectVsRestCard data={data} />,
};

export default function DirectPatientsPage() {
  return <PatientReportPage config={config} />;
}
