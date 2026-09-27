"use client";

import Card from "@/components/owner/Card";
import DataTable from "@/components/owner/DataTable";
import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS } from "@/lib/owner/patientColumns";
import { PATIENT_DIRECT_REFERENCE_NAME } from "@/lib/owner/patientStatus";
import { num, rupee } from "@/lib/owner/format";

function DirectVsRestCard({ data }) {
  const direct = data.totals || {};
  const others = data.others || {};
  const perPatient = (t) => (t.count ? Math.round((t.receivedSum || 0) / t.count) : 0);
  const rows = [
    { id: "count", metric: "Patients", direct: num(direct.count), others: num(others.count) },
    { id: "rate", metric: "Conversion rate", direct: `${direct.conversionRate ?? 0}%`, others: `${others.conversionRate ?? 0}%` },
    { id: "rev", metric: "Received / patient", direct: rupee(perPatient(direct)), others: rupee(perPatient(others)) },
    { id: "pkg", metric: "Package value", direct: rupee(direct.packageSum), others: rupee(others.packageSum) },
  ];
  return (
    <Card title="Direct vs. Everyone Else" subtitle="Same period, same branch filter · everyone else = any other reference">
      <DataTable
        columns={[
          { key: "metric", label: "Metric" },
          { key: "direct", label: "Direct", align: "right" },
          { key: "others", label: "Everyone else", align: "right" },
        ]}
        rows={rows}
      />
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
  aiFeature: "patients.preset",
  columns: PATIENT_SHARED_COLUMNS.filter((c) => c.key !== "reference"),
  kpis: (data) => [
    { label: "Direct Patients", value: num(data.total), sub: "Registered this period", kind: "info" },
    { label: "Converted", value: num(data.totals?.converted), sub: `${data.totals?.conversionRate ?? 0}% of direct`, kind: "good" },
    { label: "Received", value: rupee(data.totals?.receivedSum), sub: "So far, from these patients", kind: "good" },
  ],
  extraContent: (data) => <DirectVsRestCard data={data} />,
};

export default function DirectPatientsPage() {
  return <PatientReportPage config={config} />;
}
