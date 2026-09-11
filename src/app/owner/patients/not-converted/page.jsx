"use client";

import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS, DAYS_SINCE_ACTIVITY_COLUMN, LAST_CONTACT_COLUMN } from "@/lib/owner/patientColumns";
import { num, rupee } from "@/lib/owner/format";

// ops.status === "NOT_CONVERTED" only — seen by a counsellor, paid nothing.
// NOT_VISITED (never showed up) is a different, earlier failure mode and is
// deliberately excluded (confirmed with the user).
const config = {
  preset: "notConverted",
  title: "Not Converted",
  subtitle: "Counselled but never paid — NOT_VISITED (never showed up) is tracked separately",
  tableId: "patients-not-converted",
  defaultSort: "createdAt",
  defaultSortDir: "desc",
  columns: [...PATIENT_SHARED_COLUMNS, LAST_CONTACT_COLUMN, DAYS_SINCE_ACTIVITY_COLUMN],
  kpis: (data) => [
    { label: "Not Converted", value: num(data.total), sub: "This period", kind: "bad" },
    { label: "Recovery Value", value: rupee(data.totals?.packageSum), sub: "Sum of quoted packages, unconverted", kind: "warn" },
  ],
};

export default function NotConvertedPatientsPage() {
  return <PatientReportPage config={config} />;
}
