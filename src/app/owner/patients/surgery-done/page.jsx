"use client";

import Card from "@/components/owner/Card";
import DataTable from "@/components/owner/DataTable";
import InlineNotice from "@/components/owner/InlineNotice";
import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS, SURGERY_CLINICAL_COLUMNS } from "@/lib/owner/patientColumns";
import { num } from "@/lib/owner/format";

// ops.status === "CLOSED" — surgery.surgeryDate is actually set. Carries
// clinical data read by senior staff — full team attribution, grafts
// needed/implanted, technique mix.
const config = {
  preset: "surgeryDone",
  title: "Surgery Done",
  subtitle: "Completed surgeries by surgery date — full clinical record and team attribution",
  trendLabel: "Surgeries per day · selected period",
  tableId: "patients-surgery-done",
  defaultSort: "surgeryDate",
  defaultSortDir: "desc",
  columns: [
    ...PATIENT_SHARED_COLUMNS.filter((c) => c.key !== "visitDate"),
    ...SURGERY_CLINICAL_COLUMNS,
  ],
  kpis: (data) => {
    const s = data.surgeryStats || {};
    return [
      { label: "Total Surgeries", value: num(data.total), sub: "Surgery date in this period", kind: "info" },
      { label: "Total Grafts Implanted", value: num(s.totalGraftsImplanted), sub: `Across ${num(s.countWithGrafts)} recorded cases`, kind: "info" },
      {
        label: "Avg. Grafts / Case",
        value: s.avgGraftsPerCase == null ? "—" : num(s.avgGraftsPerCase),
        sub: s.missingGrafts ? `Excludes ${num(s.missingGrafts)} with no grafts recorded` : "This period",
        kind: "good",
      },
      { label: "Total Grafts Needed", value: num(s.totalGraftsNeeded), sub: "As suggested at counselling", kind: "info" },
    ];
  },
  extraContent: (data) => (
    <>
      {data.surgeryStats?.missingGrafts > 0 && (
        <InlineNotice kind="error" title="Data quality: grafts implanted not recorded">
          {data.surgeryStats.missingGrafts} of {data.total} completed surgeries have no
          `graftsImplanted` value — excluded from the average above rather than counted as zero.
        </InlineNotice>
      )}
      <Card title="Technique Mix" subtitle="This period">
        <DataTable
          columns={[
            { key: "technique", label: "Technique" },
            { key: "count", label: "Cases", align: "right", render: (r) => num(r.count) },
          ]}
          rows={(data.techniqueMix || []).map((t, i) => ({ ...t, id: i }))}
        />
      </Card>
    </>
  ),
};

export default function SurgeryDonePatientsPage() {
  return <PatientReportPage config={config} />;
}
