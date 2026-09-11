"use client";

import Card from "@/components/owner/Card";
import DataTable from "@/components/owner/DataTable";
import InterviewStatusReportPage from "@/components/owner/InterviewStatusReportPage";
import { INTERVIEW_BASE_COLUMNS, REJECTION_REASON_COLUMN } from "@/lib/owner/interviewColumns";
import { num } from "@/lib/owner/format";

const config = {
  preset: "rejected",
  title: "Rejected",
  subtitle: "Rejected candidates, with a position-wise rejection breakdown",
  defaultSort: "date",
  defaultSortDir: "desc",
  columns: [...INTERVIEW_BASE_COLUMNS, REJECTION_REASON_COLUMN],
  kpis: (data) => [{ label: "Rejected", value: num(data.total), sub: "This period", kind: "bad" }],
  extraContent: (data) =>
    data.byPosition?.length ? (
      <Card title="Rejections by Position" subtitle="This period">
        <DataTable
          columns={[
            { key: "position", label: "Position" },
            { key: "count", label: "Rejected", align: "right", render: (r) => num(r.count) },
          ]}
          rows={data.byPosition.map((p, i) => ({ ...p, id: i }))}
        />
      </Card>
    ) : null,
};

export default function RejectedInterviewsPage() {
  return <InterviewStatusReportPage config={config} />;
}
