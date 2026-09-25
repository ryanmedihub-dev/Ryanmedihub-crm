"use client";

import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card } from "@/components/owner";
import { AiOrb, AiFeedTicker, NeuralCoverageMap } from "@/components/owner/ai";
import { useOwnerData } from "@/lib/owner/useOwnerData";

const ITEMS = [
  { href: "/owner/ai/attendance", label: "Attendance", note: "Call activity + manual, human-confirmed attendance. Not automatic — see the page for why.", ready: true },
  { href: "/owner/ai/attention", label: "Attention", note: "Threshold rules over data you already have, with an AI triage layer on top of them.", ready: true },
  { href: "/owner/ai/suggestions", label: "Suggestions", note: "Evidence-first rule-based observations, with an AI strategist reading them.", ready: true },
  { href: "/owner/ai/sanya", label: "Sanya Assistant", note: "Tool-calling assistant over the Owner panel's own aggregations — read-only, aliased.", ready: true },
  { href: "/owner/ai/health", label: "AI Health & Audit", note: "How the AI layer itself is doing — reliability, cost, latency, grounding, coverage.", ready: true },
  { href: "/owner/ai/clinical-quality", label: "Clinical AI Quality", note: "Being built separately — no data source yet, so nothing is shown.", ready: false },
];

export default function AiLanding() {
  const { data } = useOwnerData("/api/owner/ai/health");
  const coverage = data?.insights?.coverage || [];

  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="AI" subtitle="What each page does and what data it uses — no page here claims more certainty than the data supports" />
        <div className="content">
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <AiOrb state="idle" size={72} />
              <div>
                <h2 style={{ margin: "0 0 4px" }}>Owner Intelligence</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Every page below reads only aggregate, already-computed numbers — grounded against real facts,
                  people aliased (E07, P12, …), never a name or a number invented.
                </p>
              </div>
            </div>
          </Card>

          <AiFeedTicker />

          <Card title="Neural Coverage Map" subtitle="Every AI feature across the owner panel, grouped by section — green fresh, amber stale, red failing, grey never run">
            <NeuralCoverageMap coverage={coverage} compact />
          </Card>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {ITEMS.map((it) => (
              <Link key={it.href} href={it.href} className="card section-landing-card" style={{ display: "block", textDecoration: "none" }}>
                <div className="card-title">
                  <div>
                    <h3>{it.label}</h3>
                    <p>{it.note}</p>
                  </div>
                  <span aria-hidden="true" style={{ color: it.ready ? "var(--accent)" : "var(--ink-muted)" }}>
                    {it.ready ? "›" : "soon"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
