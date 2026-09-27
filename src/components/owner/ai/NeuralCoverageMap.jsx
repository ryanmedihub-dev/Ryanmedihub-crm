"use client";

import Link from "next/link";
import { relativeTime } from "@/lib/ai/client/aiLabels";

const STATUS_COLOR = { fresh: "var(--pos)", stale: "var(--warn)", failing: "var(--crit)", never: "var(--ink-muted)" };
const SECTION_LABEL = {
  dashboard: "Dashboard", statistics: "Statistics", employees: "Employees", calls: "Calls",
  leads: "Leads", patients: "Patients", marketing: "Marketing", hr: "HR", finance: "Finance", ai: "AI Ops",
};

function sectionOf(featureKey) {
  return featureKey.split(".")[0];
}

export default function NeuralCoverageMap({ coverage = [], compact = false }) {
  const sections = new Map();
  for (const c of coverage) {
    const key = sectionOf(c.feature);
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(c);
  }

  if (!sections.size) return <div className="muted">No features registered.</div>;

  return (
    <div className={`ai-neural-map${compact ? " ai-neural-map-compact" : ""}`}>
      {[...sections.entries()].map(([section, nodes]) => (
        <div key={section} className="ai-map-row">
          <div className="ai-map-hub">{SECTION_LABEL[section] || section}</div>
          <div className="ai-map-nodes">
            {nodes.map((n) => (
              <Link
                key={n.feature}
                href={n.page || "#"}
                className="ai-map-node"
                title={`${n.title} — ${n.status}${n.lastGeneratedAt ? ` · last run ${relativeTime(n.lastGeneratedAt)}` : " · never run"}`}
              >
                <span className="ai-map-node-dot" style={{ "--ai-node-color": STATUS_COLOR[n.status] || STATUS_COLOR.never }} />
                {!compact && <span className="ai-map-node-label">{n.title}</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
