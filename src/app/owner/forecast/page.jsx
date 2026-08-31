"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, Card, InlineNotice } from "@/components/owner";

const rupee = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
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
  const [seedLoading, setSeedLoading] = useState(true);
  const [note, setNote] = useState(null);

  const [leadsPerDay, setLeadsPerDay]     = useState(10);
  const [connectRate, setConnectRate]     = useState(40);
  const [consultRate, setConsultRate]     = useState(40);
  const [conversionRate, setConversionRate] = useState(20);
  const [avgPackage, setAvgPackage]       = useState(50000);
  const [agents, setAgents]               = useState(10);
  const [capacityPerAgent, setCapacityPerAgent] = useState(15);

  const fetchDefaults = useCallback(async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/owner/forecast");
      const json = await res.json();
      if (json.success) {
        const d = json.defaults;
        setLeadsPerDay(d.leadsPerDay);
        setConnectRate(d.connectRate);
        setConsultRate(d.consultRate);
        setAgents(d.agents);
        setNote(json.note);
      }
    } finally {
      setSeedLoading(false);
    }
  }, []);

  useEffect(() => { fetchDefaults(); }, [fetchDefaults]);

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
              <div className="forecast-box">
                <div className="forecast-card">
                  <strong>{fmt(forecast.monthlyLeads)}</strong>
                  <span>Monthly Leads</span>
                </div>
                <div className="forecast-card">
                  <strong>{fmt(forecast.monthlyConsulted)}</strong>
                  <span>Monthly Consulted</span>
                </div>
                <div className="forecast-card">
                  <strong>{fmt(forecast.monthlyConversions)}</strong>
                  <span>Monthly Conversions</span>
                </div>
                <div className="forecast-card">
                  <strong>{rupee(forecast.monthlyRevenue)}</strong>
                  <span>Projected Revenue</span>
                </div>
                <div className="forecast-card">
                  <strong>{forecast.requiredAgents}</strong>
                  <span>Agents Needed</span>
                </div>
                <div className="forecast-card">
                  <strong style={{ color: forecast.agentGap > 0 ? "var(--red)" : "var(--green)" }}>
                    {forecast.agentGap > 0 ? `+${forecast.agentGap}` : forecast.agentGap}
                  </strong>
                  <span>{forecast.agentGap > 0 ? "Agent Shortfall" : "Agent Surplus"}</span>
                </div>
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
