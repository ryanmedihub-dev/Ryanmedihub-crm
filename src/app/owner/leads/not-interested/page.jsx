"use client";

import Card from "@/components/owner/Card";
import DataTable from "@/components/owner/DataTable";
import LeadStatusReportPage from "@/components/owner/LeadStatusReportPage";
import { LEAD_BASE_COLUMNS, LAST_NOTE_COLUMN } from "@/lib/owner/leadsColumns";
import { num } from "@/lib/owner/format";

const config = {
  preset: "notInterested",
  title: "Not Interested / Lost",
  subtitle: "No dedicated \"lost reason\" field exists in callby — Last Note is the closest real data",
  defaultSort: "createdAt",
  defaultSortDir: "desc",
  aiFeature: "leads.status",
  columns: [...LEAD_BASE_COLUMNS, LAST_NOTE_COLUMN],
  kpis: (data) => [
    { label: "Total Not Interested / Lost", value: num(data.total), sub: "This period", kind: "info" },
    {
      label: "Recovered",
      value: num(data.recovery?.recoveredCount ?? 0),
      sub: "Later became a real patient",
      kind: data.recovery?.recoveredCount ? "good" : "info",
    },
  ],
  extraContent: (data) =>
    data.recovery && data.recovery.recoveredCount > 0 ? (
      <Card
        title="Recovered — later became patients"
        subtitle="Phone-matched against ryan-crm's Patient records (same join lead-funnel uses)"
      >
        <DataTable
          columns={[
            { key: "name", label: "Patient" },
            { key: "phone", label: "Phone" },
            { key: "status", label: "Patient Status" },
          ]}
          rows={data.recovery.recovered.map((r, i) => ({ ...r, id: i }))}
        />
      </Card>
    ) : null,
};

export default function NotInterestedLeadsPage() {
  return <LeadStatusReportPage config={config} />;
}
