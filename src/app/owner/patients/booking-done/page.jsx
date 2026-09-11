"use client";

import PatientReportPage from "@/components/owner/PatientReportPage";
import { PATIENT_SHARED_COLUMNS, DAYS_SINCE_BOOKING_COLUMN, SURGERY_DATE_IF_SET_COLUMN } from "@/lib/owner/patientColumns";
import { num, rupee, daysAgo } from "@/lib/owner/format";

// ops.status === "BOOKING_DONE" — any partial payment made.
const config = {
  preset: "bookingDone",
  title: "Booking Done",
  subtitle: "Paid something but not in full — flagged past 10 days with no surgery date booked",
  tableId: "patients-booking-done",
  defaultSort: "createdAt",
  defaultSortDir: "asc", // oldest bookings first, so the ones going stale surface
  columns: [...PATIENT_SHARED_COLUMNS, DAYS_SINCE_BOOKING_COLUMN, SURGERY_DATE_IF_SET_COLUMN],
  kpis: (data) => {
    const rows = data.rows || [];
    const staleOnPage = rows.filter((r) => (daysAgo(r.createdAt) ?? 0) > 10 && !r.surgeryDate).length;
    return [
      { label: "Booking Done", value: num(data.total), sub: "This period", kind: "info" },
      { label: "Received", value: rupee(data.totals?.receivedSum), sub: "This period", kind: "good" },
      { label: "Pending", value: rupee(data.totals?.pendingSum), sub: "This period", kind: "warn" },
      { label: "Stale (this page)", value: num(staleOnPage), sub: ">10 days, no surgery date", kind: staleOnPage ? "bad" : "good" },
    ];
  },
};

export default function BookingDonePatientsPage() {
  return <PatientReportPage config={config} />;
}
