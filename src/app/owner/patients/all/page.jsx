"use client";

import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS } from "@/lib/owner/patientColumns";
import { PATIENT_STATUSES, PATIENT_STATUS_LABELS } from "@/lib/owner/patientStatus";
import { num, rupee } from "@/lib/owner/format";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...PATIENT_STATUSES.map((s) => ({ value: s, label: PATIENT_STATUS_LABELS[s] })),
];

const config = {
  preset: "all",
  title: "All Patients",
  subtitle: "Every patient registered in the period — filter by status, search doubles as the old patient-search tool",
  tableId: "patients-all",
  defaultSort: "createdAt",
  defaultSortDir: "desc",
  aiFeature: "patients.preset",
  columns: PATIENT_SHARED_COLUMNS,
  extras: [{ key: "status", label: "Status", options: STATUS_OPTIONS, defaultValue: "all" }],
  kpis: (data) => [
    { label: "Patients Registered", value: num(data.total), sub: "This period", kind: "info" },
    { label: "Converted", value: num(data.totals?.converted), sub: `${data.totals?.conversionRate ?? 0}% of registered`, kind: "good" },
    { label: "Received So Far", value: rupee(data.totals?.receivedSum), sub: "From patients registered this period", kind: "good" },
    { label: "Pending", value: rupee(data.totals?.pendingSum), sub: "From patients registered this period", kind: "warn" },
    { label: "Package Value", value: rupee(data.totals?.packageSum), sub: "Final packages, registered this period", kind: "info" },
  ],
};

export default function AllPatientsPage() {
  return <PatientReportPage config={config} />;
}
