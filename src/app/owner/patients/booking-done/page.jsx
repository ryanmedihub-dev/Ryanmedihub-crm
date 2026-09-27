"use client";

import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS, DAYS_SINCE_BOOKING_COLUMN, SURGERY_DATE_IF_SET_COLUMN } from "@/lib/owner/patientColumns";
import { ATTENTION_THRESHOLDS } from "@/lib/owner/attentionThresholds";
import { num, rupee } from "@/lib/owner/format";

const config = {
  preset: "bookingDone",
  title: "Booking Done",
  subtitle: `Paid something but not in full — flagged past ${ATTENTION_THRESHOLDS.bookingDoneStaleDays} days with no surgery date booked`,
  tableId: "patients-booking-done",
  defaultSort: "createdAt",
  defaultSortDir: "asc", 
  aiFeature: "patients.preset",
  aiVerdicts: true,
  columns: [...PATIENT_SHARED_COLUMNS, DAYS_SINCE_BOOKING_COLUMN, SURGERY_DATE_IF_SET_COLUMN],
  kpis: (data) => [
    { label: "Booking Done", value: num(data.total), sub: "Registered this period", kind: "info" },
    { label: "Received", value: rupee(data.totals?.receivedSum), sub: "So far, from these patients", kind: "good" },
    { label: "Pending", value: rupee(data.totals?.pendingSum), sub: "Still owed by these patients", kind: "warn" },
    {
      label: "Stale",
      value: num(data.stats?.stale),
      sub: `${ATTENTION_THRESHOLDS.bookingDoneStaleDays}+ days, no surgery date`,
      kind: data.stats?.stale ? "bad" : "good",
    },
    { label: "Surgery Date Set", value: num(data.stats?.withSurgeryDate), sub: "Of these bookings", kind: "good" },
  ],
};

export default function BookingDonePatientsPage() {
  return <PatientReportPage config={config} />;
}
