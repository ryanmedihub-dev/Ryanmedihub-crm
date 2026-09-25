import AiVerdictChip from "./AiVerdictChip";

// ReportTable column factory — place as the SECOND column (right after name)
// on any list page that enables AI verdicts. `byId` and `loading` come
// straight from useAiVerdicts(feature, scope). `labelSet` picks which wording
// AiVerdictChip uses for the same star/solid/watch/at_risk enum (e.g.
// "followUp" for patient follow-up priority — see aiLabels.js).
export function aiVerdictColumn({ byId, loading, labelSet = "performance" }) {
  return {
    key: "aiVerdict",
    label: "AI Verdict",
    sortable: false,
    render: (r) => <AiVerdictChip {...(byId?.[r.id] || {})} loading={loading && !byId?.[r.id]} labelSet={labelSet} />,
    csv: (r) => (byId?.[r.id] ? `${byId[r.id].verdict} (${byId[r.id].score}) ${byId[r.id].oneLiner}` : ""),
  };
}

export default aiVerdictColumn;
