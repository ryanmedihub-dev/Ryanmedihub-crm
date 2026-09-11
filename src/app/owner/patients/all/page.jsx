"use client";

import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS } from "@/lib/owner/patientColumns";
import { PATIENT_STATUS_LABELS } from "@/lib/owner/patientStatus";
import { num, rupee } from "@/lib/owner/format";

const config = {
  preset: "all",
  title: "All Patients",
  subtitle: "Every patient — full status breakdown, search doubles as the old patient-search tool",
  tableId: "patients-all",
  defaultSort: "createdAt",
  defaultSortDir: "desc",
  columns: PATIENT_SHARED_COLUMNS,
  kpis: (data) => {
    const items = [
      { label: "Total Patients", value: num(data.total), sub: "This period", kind: "info" },
      { label: "Amount Received", value: rupee(data.totals?.receivedSum), sub: "This period", kind: "good" },
      { label: "Pending", value: rupee(data.totals?.pendingSum), sub: "This period", kind: "warn" },
    ];
    for (const status of ["NEW", "NOT_VISITED", "NOT_CONVERTED", "BOOKING_DONE", "SURGERY_BOOKED", "CLOSED"]) {
      items.push({
        label: PATIENT_STATUS_LABELS[status],
        value: num(data.statusBreakdown?.[status] || 0),
        sub: "This period",
        kind: "info",
      });
    }
    return items;
  },
};

export default function AllPatientsPage() {
  return <PatientReportPage config={config} />;
}
