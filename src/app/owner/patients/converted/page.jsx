"use client";

import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS, REVENUE_COLUMNS } from "@/lib/owner/patientColumns";
import { num, rupee } from "@/lib/owner/format";

const config = {
  preset: "converted",
  title: "Converted",
  subtitle: "Fully paid (pending ≤ 0) — the financial conversion point, distinct from Surgery Done",
  tableId: "patients-converted",
  defaultSort: "createdAt",
  defaultSortDir: "desc",
  aiFeature: "patients.preset",
  columns: [...PATIENT_SHARED_COLUMNS, ...REVENUE_COLUMNS],
  kpis: (data) => [
    { label: "Converted", value: num(data.total), sub: "Registered this period, fully paid", kind: "good" },
    { label: "Package Value", value: rupee(data.totals?.packageSum), sub: "Final packages", kind: "info" },
    { label: "Received", value: rupee(data.totals?.receivedSum), sub: "From these patients", kind: "good" },
    { label: "Discount Given", value: rupee(data.totals?.discountSum), sub: "From these patients", kind: "warn" },
  ],
};

export default function ConvertedPatientsPage() {
  return <PatientReportPage config={config} />;
}
