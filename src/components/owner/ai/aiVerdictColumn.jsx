import AiVerdictChip from "./AiVerdictChip";

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
