"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, InlineNotice, Funnel, Badge, ProgressBar } from "@/components/owner";
import { useOwnerData } from "@/lib/owner/useOwnerData";
import { rupee } from "@/lib/owner/format";

// local: this screen rounds every projected figure to a whole number before display
// (shared `num` keeps decimals, which reads wrong for "43.2 consulted").
const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));

function SliderRow({ label, value, onChange, min, max, step = 1, suffix = "" }) {
  return (
    <div className="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{fmt(value)}{suffix}</output>
    </div>
  );
}

export default function ForecastStaffingPage() {
  const [leadsPerDay, setLeadsPerDay]     = useState(10);
  const [connectRate, setConnectRate]     = useState(40);
  const [consultRate, setConsultRate]     = useState(40);
  const [conversionRate, setConversionRate] = useState(20);
  const [avgPackage, setAvgPackage]       = useState(50000);
  const [agents, setAgents]               = useState(10);
  const [capacityPerAgent, setCapacityPerAgent] = useState(15);

  const { data: seedData, loading: seedLoading, error: seedError } = useOwnerData("/api/owner/forecast");
  const note = seedData?.note ?? null;

  // Sliders are free-edit after the first load — only seed them once, not on every revalidation.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !seedData) return;
    seeded.current = true;
    const d = seedData.defaults || {};
    if (d.leadsPerDay != null) setLeadsPerDay(d.leadsPerDay);
    if (d.connectRate != null) setConnectRate(d.connectRate);
    if (d.consultRate != null) setConsultRate(d.consultRate);
    if (d.agents != null) setAgents(d.agents);
  }, [seedData]);

  const forecast = useMemo(() => {
    const monthlyLeads = leadsPerDay * 30;
    const monthlyConnected = monthlyLeads * (connectRate / 100);
    const monthlyConsulted = monthlyConnected * (consultRate / 100);
    const monthlyConversions = monthlyConsulted * (conversionRate / 100);
    const monthlyRevenue = monthlyConversions * avgPackage;
    const requiredAgents = capacityPerAgent > 0 ? Math.ceil(leadsPerDay / capacityPerAgent) : 0;
    return {
      monthlyLeads, monthlyConnected, monthlyConsulted, monthlyConversions, monthlyRevenue,
      requiredAgents, agentGap: requiredAgents - agents,
    };
  }, [leadsPerDay, connectRate, consultRate, conversionRate, avgPackage, agents, capacityPerAgent]);

  return (
    <div className="app">
      <OwnerSidebar />

      <div className="main">
        <OwnerTopbar
          title="Forecast & Staffing"
          subtitle="Adjust the assumptions below — defaults are seeded from real 30-day figures where available"
        />

        <div className="content">
          {seedError && (
            <InlineNotice kind="warn" title="Couldn't seed real defaults">
              {seedError} — the sliders below start from generic assumptions.
            </InlineNotice>
          )}
          {note && (
            <InlineNotice kind="info" title="Partial live data">{note}</InlineNotice>
          )}

          <div className="grid cols-2">
            <Card title="Assumptions" subtitle={seedLoading ? "Loading real 30-day defaults…" : "Leads/day and consult rate are real; drag any slider to explore scenarios"}>
              <SliderRow label="Leads / day" value={leadsPerDay} onChange={setLeadsPerDay} min={0} max={300} />
              <SliderRow label="Connect Rate" value={connectRate} onChange={setConnectRate} min={0} max={100} suffix="%" />
              <SliderRow label="Consult Rate" value={consultRate} onChange={setConsultRate} min={0} max={100} suffix="%" />
              <SliderRow label="Conversion Rate" value={conversionRate} onChange={setConversionRate} min={0} max={100} suffix="%" />
              <SliderRow label="Avg. Package (₹)" value={avgPackage} onChange={setAvgPackage} min={0} max={200000} step={1000} />
              <SliderRow label="Current Agents" value={agents} onChange={setAgents} min={0} max={100} />
              <SliderRow label="Leads / Agent / Day" value={capacityPerAgent} onChange={setCapacityPerAgent} min={1} max={60} />
            </Card>

            <Card title="Projected Monthly Outcome" subtitle="30-day projection from the assumptions on the left">
              <div className="kpi kpi-lead" style={{ marginBottom: "var(--sp-4)" }}>
                <span className="label">Projected Monthly Revenue</span>
                <span className="value">{rupee(forecast.monthlyRevenue)}</span>
                <span className="sub">{fmt(forecast.monthlyConversions)} conversions × avg. package</span>
              </div>

              <Funnel
                items={[
                  { label: "Leads", value: Math.round(forecast.monthlyLeads) },
                  { label: "Connected", value: Math.round(forecast.monthlyConnected) },
                  { label: "Consulted", value: Math.round(forecast.monthlyConsulted) },
                  { label: "Conversions", value: Math.round(forecast.monthlyConversions) },
                ]}
              />

              <div className="forecast-box" style={{ marginTop: "var(--sp-4)" }}>
                <div className="forecast-card">
                  <strong>{agents}</strong>
                  <span>Current Agents</span>
                </div>
                <div className="forecast-card">
                  <strong>{forecast.requiredAgents}</strong>
                  <span>Agents Needed</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginTop: "var(--sp-3)" }}>
                <Badge kind={forecast.agentGap > 0 ? "bad" : "good"} dot>
                  {forecast.agentGap > 0
                    ? `${forecast.agentGap} agent${forecast.agentGap === 1 ? "" : "s"} short`
                    : forecast.agentGap < 0
                    ? `${-forecast.agentGap} agent${forecast.agentGap === -1 ? "" : "s"} spare`
                    : "Fully staffed"}
                </Badge>
                <ProgressBar
                  value={forecast.requiredAgents > 0 ? (agents / forecast.requiredAgents) * 100 : 100}
                  kind={forecast.agentGap > 0 ? "bad" : "good"}
                />
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                Agents Needed = Leads/day ÷ Leads/Agent/Day. Not a callby figure — a simple staffing
                math check against whatever capacity assumption you set above.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
