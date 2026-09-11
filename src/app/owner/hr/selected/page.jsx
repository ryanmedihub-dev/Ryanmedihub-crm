"use client";

import InterviewStatusReportPage from "@/components/owner/InterviewStatusReportPage";
import { INTERVIEW_BASE_COLUMNS, JOINED_COLUMN } from "@/lib/owner/interviewColumns";
import { num } from "@/lib/owner/format";

const config = {
  preset: "selected",
  title: "Selected",
  subtitle: "Selected candidates — mark whether they actually joined",
  defaultSort: "date",
  defaultSortDir: "desc",
  columns: [...INTERVIEW_BASE_COLUMNS, JOINED_COLUMN],
  allowMarkJoined: true,
  kpis: (data) => {
    const joined = (data.rows || []).filter((r) => r.hiredEmployeeId).length;
    return [
      { label: "Selected", value: num(data.total), sub: "This period", kind: "good" },
      { label: "Joined (this page)", value: num(joined), sub: "Marked as joined", kind: "good" },
    ];
  },
};

export default function SelectedInterviewsPage() {
  return <InterviewStatusReportPage config={config} />;
}
