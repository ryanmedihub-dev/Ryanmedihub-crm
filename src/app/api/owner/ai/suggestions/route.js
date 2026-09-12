import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toLeadDateParams } from "@/lib/owner/callbyRoute";
import { computeStagesForLeads, stageRate } from "@/app/api/owner/statistics/route";
import { attributeSpendToOutcomes } from "@/lib/owner/marketingAttribution";
import { overdueFollowUps, interestedNoRecentCall, stalePatients } from "@/lib/owner/metrics/attention";
import { ATTENTION_THRESHOLDS } from "@/lib/owner/attentionThresholds";
import { employeeSection } from "@/lib/owner/employeeSections";
import { SECTION_METRIC_BUILDERS, derivePerfMetrics, sampleValue, daysInPeriod } from "@/lib/owner/employeeReportQuery";
import { scoreCohort } from "@/lib/owner/performance";

// /owner/ai/suggestions — evidence-first observations, computed entirely
// server-side from the same aggregates the rest of Owner Panel v2 already
// uses (Statistics, Attention, Marketing, Employees). No model call, no raw
// data leaves this function, no directive language ("do X") — every
// observation states a fact with the numbers behind it and lets the owner
// decide what it means. The user chose this rules-based path explicitly over
// an LLM-based one for Part 6 (cost/model/API-key decisions deferred).
//
// Each observation cites real, freshly-computed numbers — nothing here is
// estimated or extrapolated. An observation is only emitted when its
// underlying sample is large enough to say something meaningful (thresholds
// inline, next to the rule they gate).

const DAY_MS = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;

function periodBounds(dateFrom, dateTo) {
  const to = dateTo ? new Date(dateTo) : new Date();
  const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * DAY_MS);
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

async function fetchLeadSample(from, to) {
  const result = await fetchCallby("/api/leads", {
    params: { ...toLeadDateParams(from.toISOString(), to.toISOString()), limit: "3000" },
  });
  return result?.data?.leads || [];
}

function funnelDropOffObservation(stages) {
  const labels = { contacted: "Contacted", interested: "Interested", followUp: "Follow-up", converted: "Converted", bookingDone: "Booking Done", surgeryBooked: "Surgery Booked", surgeryDone: "Surgery Done" };
  let worst = null;
  for (const s of stages) {
    if (s.stageConversionRate == null) continue;
    const dropRate = 100 - s.stageConversionRate;
    if (!worst || dropRate > worst.dropRate) worst = { ...s, dropRate };
  }
  if (!worst || worst.dropOff <= 0) return null;
  return {
    id: "funnel-worst-stage",
    category: "Funnel",
    headline: `The biggest funnel drop-off this period is at "${labels[worst.key] || worst.key}"`,
    detail: `${worst.dropOff} of the leads that reached the previous stage did not reach "${labels[worst.key] || worst.key}" — a ${worst.dropRate}% drop, larger than any other stage-to-stage transition this period.`,
    drillHref: "/owner/statistics",
  };
}

function conversionTrendObservation(currentStages, previousStages) {
  const cur = currentStages.find((s) => s.key === "converted");
  const prev = previousStages.find((s) => s.key === "converted");
  if (!cur || !prev || cur.overallRate == null || prev.overallRate == null) return null;
  const delta = round1(cur.overallRate - prev.overallRate);
  if (delta === 0) return null;
  return {
    id: "conversion-trend",
    category: "Funnel",
    headline: `Lead-to-converted rate is ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points vs. the previous period`,
    detail: `${cur.overallRate}% of leads created this period reached "Converted", vs ${prev.overallRate}% in the equal-length period before it.`,
    drillHref: "/owner/statistics",
  };
}

async function sourceSpreadObservation(leads) {
  const MIN_LEADS = 20;
  const groups = new Map();
  for (const l of leads) {
    const key = l.source || "Unspecified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const rows = [];
  for (const [source, groupLeads] of groups) {
    if (groupLeads.length < MIN_LEADS) continue;
    const counts = await computeStagesForLeads(groupLeads);
    rows.push({ source, leadsCreated: counts.leadsCreated, convertedRate: counts.leadsCreated ? (counts.converted / counts.leadsCreated) * 100 : 0 });
  }
  if (rows.length < 2) return null;
  rows.sort((a, b) => b.convertedRate - a.convertedRate);
  const best = rows[0];
  const worst = rows[rows.length - 1];
  if (best.convertedRate - worst.convertedRate < 5) return null;
  return {
    id: "source-spread",
    category: "Sources",
    headline: `"${best.source}" converts at ${round1(best.convertedRate)}% vs "${worst.source}" at ${round1(worst.convertedRate)}%`,
    detail: `Among sources with at least ${MIN_LEADS} leads this period, "${best.source}" (${best.leadsCreated} leads) has the highest conversion rate and "${worst.source}" (${worst.leadsCreated} leads) the lowest — a ${round1(best.convertedRate - worst.convertedRate)}-point spread.`,
    drillHref: "/owner/statistics",
  };
}

function platformCplObservation(current) {
  const { Meta, Google } = current;
  if (!Meta?.cpl || !Google?.cpl) return null;
  const [higher, lower] = Meta.cpl >= Google.cpl ? [{ name: "Meta", ...Meta }, { name: "Google", ...Google }] : [{ name: "Google", ...Google }, { name: "Meta", ...Meta }];
  const pctHigher = round1(((higher.cpl - lower.cpl) / lower.cpl) * 100);
  if (pctHigher < 10) return null;
  return {
    id: "platform-cpl",
    category: "Marketing",
    headline: `${higher.name}'s cost-per-lead is ${pctHigher}% higher than ${lower.name}'s this period`,
    detail: `${higher.name}: ₹${Math.round(higher.cpl)} per lead (${higher.leads} leads, ₹${Math.round(higher.spend)} spend). ${lower.name}: ₹${Math.round(lower.cpl)} per lead (${lower.leads} leads, ₹${Math.round(lower.spend)} spend).`,
    drillHref: "/owner/marketing/comparison",
  };
}

function platformRoasTrendObservation(current, previous) {
  const moves = [];
  for (const platform of ["Meta", "Google"]) {
    const cur = current[platform];
    const prev = previous[platform];
    if (cur?.roas == null || prev?.roas == null || prev.roas === 0) continue;
    const pctChange = round1(((cur.roas - prev.roas) / prev.roas) * 100);
    moves.push({ platform, pctChange, curRoas: cur.roas, prevRoas: prev.roas });
  }
  if (!moves.length) return null;
  moves.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  const m = moves[0];
  if (Math.abs(m.pctChange) < 10) return null;
  return {
    id: "platform-roas-trend",
    category: "Marketing",
    headline: `${m.platform}'s ROAS ${m.pctChange > 0 ? "improved" : "declined"} ${Math.abs(m.pctChange)}% vs. the previous period`,
    detail: `${m.platform} returned ${m.curRoas.toFixed(2)}x this period vs ${m.prevRoas.toFixed(2)}x the period before — based on revenue attributed so far to leads from each period (see the attribution window note on Marketing → Comparison).`,
    drillHref: "/owner/marketing/comparison",
  };
}

function attentionRollupObservation(rules) {
  const total = rules.reduce((s, r) => s + r.count, 0);
  if (total === 0) return null;
  const worst = rules.slice().sort((a, b) => (b.valueAtRisk || 0) - (a.valueAtRisk || 0) || b.count - a.count)[0];
  const valueAtRisk = rules.reduce((s, r) => s + (r.valueAtRisk || 0), 0);
  return {
    id: "attention-rollup",
    category: "Attention",
    headline: `${total} items are currently flagged across the Attention rules${valueAtRisk ? `, with ₹${Math.round(valueAtRisk).toLocaleString("en-IN")} pending on stale patients` : ""}`,
    detail: `The largest single rule is "${worst.label}" with ${worst.count} flagged${worst.valueAtRisk ? ` (₹${Math.round(worst.valueAtRisk).toLocaleString("en-IN")} pending)` : ""}.`,
    drillHref: "/owner/ai/attention",
  };
}

async function performanceDistributionObservation(period) {
  const periodDays = daysInPeriod(period.from.toISOString(), period.to.toISOString());
  const employees = await Employee.find({ isactive: true, mergedInto: null }).select("name role branch callbyUserId").lean();

  const bySection = new Map();
  for (const e of employees) {
    const section = employeeSection(e.role);
    if (!SECTION_METRIC_BUILDERS[section]) continue;
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(e);
  }

  let scoredTotal = 0;
  const badBySection = new Map();
  for (const [section, sectionEmployees] of bySection) {
    let metricsById;
    try {
      const result = await SECTION_METRIC_BUILDERS[section](sectionEmployees, { from: period.from.toISOString(), to: period.to.toISOString() });
      metricsById = result.metricsById;
    } catch {
      continue;
    }
    const cohort = sectionEmployees.map((e) => {
      const id = String(e._id);
      const m = metricsById.get(id) || {};
      return { id, sample: sampleValue(section, m), metrics: derivePerfMetrics(section, m, periodDays) };
    });
    const scored = scoreCohort(section, cohort);
    for (const e of sectionEmployees) {
      const r = scored.get(String(e._id));
      if (!r || r.insufficientData !== false) continue;
      scoredTotal++;
      if (r.band === "Bad") badBySection.set(section, (badBySection.get(section) || 0) + 1);
    }
  }

  const totalBad = [...badBySection.values()].reduce((s, n) => s + n, 0);
  if (scoredTotal === 0 || totalBad === 0) return null;
  const worstSection = [...badBySection.entries()].sort((a, b) => b[1] - a[1])[0];
  const pct = round1((totalBad / scoredTotal) * 100);
  return {
    id: "performance-distribution",
    category: "Employees",
    headline: `${totalBad} of ${scoredTotal} scored employees (${pct}%) are in the "Bad" performance band this period`,
    detail: `Most concentrated in ${worstSection[0]} (${worstSection[1]} of ${totalBad}). Scoring is peer-relative within each role — see /owner/employees for the methodology.`,
    drillHref: "/owner/ai/attention",
  };
}

export const GET = withCallbyRoute(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const { from, to, prevFrom, prevTo } = periodBounds(searchParams.get("dateFrom"), searchParams.get("dateTo"));

  const [currentLeads, previousLeads, currentMkt, previousMkt, followUps, interested, bookingDone, surgeryBooked] = await Promise.all([
    fetchLeadSample(from, to),
    fetchLeadSample(prevFrom, prevTo),
    attributeSpendToOutcomes({ from, to }),
    attributeSpendToOutcomes({ from: prevFrom, to: prevTo }),
    overdueFollowUps(),
    interestedNoRecentCall(),
    stalePatients("BOOKING_DONE", ATTENTION_THRESHOLDS.bookingDoneStaleDays),
    stalePatients("SURGERY_BOOKED", ATTENTION_THRESHOLDS.surgeryBookedStaleDays),
  ]);

  const currentStages = stageRate(await computeStagesForLeads(currentLeads));
  const previousStages = stageRate(await computeStagesForLeads(previousLeads));

  const attentionRules = [
    { label: "Overdue follow-ups", count: followUps.items.length, valueAtRisk: 0 },
    { label: `Interested, no call ${ATTENTION_THRESHOLDS.interestedNoCallDays}+ days`, count: interested.items.length, valueAtRisk: 0 },
    { label: `Booking done, stale ${ATTENTION_THRESHOLDS.bookingDoneStaleDays}+ days`, count: bookingDone.length, valueAtRisk: bookingDone.reduce((s, r) => s + (r.pendingAmount || 0), 0) },
    { label: `Surgery booked, stale ${ATTENTION_THRESHOLDS.surgeryBookedStaleDays}+ days`, count: surgeryBooked.length, valueAtRisk: surgeryBooked.reduce((s, r) => s + (r.pendingAmount || 0), 0) },
  ];

  const observations = (
    await Promise.all([
      funnelDropOffObservation(currentStages),
      conversionTrendObservation(currentStages, previousStages),
      sourceSpreadObservation(currentLeads),
      platformCplObservation(currentMkt.byPlatform),
      platformRoasTrendObservation(currentMkt.byPlatform, previousMkt.byPlatform),
      attentionRollupObservation(attentionRules),
      performanceDistributionObservation({ from, to }),
    ])
  ).filter(Boolean);

  return NextResponse.json({
    success: true,
    period: { from, to },
    previousPeriod: { from: prevFrom, to: prevTo },
    observations,
  });
});
