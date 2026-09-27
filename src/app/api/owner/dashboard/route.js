import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Employee from "@/models/Employee";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toLeadDateParams } from "@/lib/owner/callbyRoute";
import { computeStagesForLeads, stageRate, STAGE_DEFINITIONS } from "@/app/api/owner/statistics/route";
import { overdueFollowUps, interestedNoRecentCall, stalePatients } from "@/lib/owner/metrics/attention";
import { ATTENTION_THRESHOLDS } from "@/lib/owner/attentionThresholds";
import { employeeSection } from "@/lib/owner/employeeSections";
import { SECTION_METRIC_BUILDERS, derivePerfMetrics, sampleValue, daysInPeriod } from "@/lib/owner/employeeReportQuery";
import { scoreCohort } from "@/lib/owner/performance";
import { cacheKey, cached } from "@/lib/cache";

const LEAD_SAMPLE_CAP = 1500;
const DAY_MS = 86400000;

function prevWindow(from, to) {
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { prevFrom, prevTo };
}

async function revenueFacet(branch, from, to, prevFrom, prevTo) {
  const base = { costType: "Revenue", method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION };
  if (branch !== "All") base.branch = branch;

  const [row] = await Transactions.aggregate([
    { $match: base },
    {
      $facet: {
        current: [{ $match: { date: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: "$amount" } } }],
        previous: [{ $match: { date: { $gte: prevFrom, $lte: prevTo } } }, { $group: { _id: null, total: { $sum: "$amount" } } }],
        perDay: [
          { $match: { date: { $gte: from, $lte: to } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "Asia/Kolkata" } }, total: { $sum: "$amount" } } },
          { $sort: { _id: 1 } },
        ],
        byBranch: [
          { $match: { date: { $gte: from, $lte: to } } },
          { $group: { _id: "$branch", total: { $sum: "$amount" } } },
          { $sort: { total: -1 } },
        ],
      },
    },
  ]);

  return {
    current: row?.current?.[0]?.total || 0,
    previous: row?.previous?.[0]?.total || 0,
    perDay: (row?.perDay || []).map((d) => ({ date: d._id, total: d.total })),
    byBranch: (row?.byBranch || []).map((d) => ({ branch: d._id || "Unspecified", revenue: d.total })),
  };
}

async function surgeriesFacet(branch, from, to, prevFrom, prevTo) {
  const branchFilter = branch === "All" ? {} : { "personal.branch": branch };
  const [row] = await Patient.aggregate([
    {
      $facet: {
        current: [{ $match: { ...branchFilter, "surgery.surgeryDate": { $gte: from, $lte: to } } }, { $count: "count" }],
        previous: [{ $match: { ...branchFilter, "surgery.surgeryDate": { $gte: prevFrom, $lte: prevTo } } }, { $count: "count" }],
        byBranch: [
          { $match: { "surgery.surgeryDate": { $gte: from, $lte: to } } },
          { $group: { _id: "$personal.branch", count: { $sum: 1 } } },
        ],
      },
    },
  ]);
  const byBranch = Object.fromEntries((row?.byBranch || []).map((r) => [r._id || "Unspecified", r.count]));
  return {
    current: row?.current?.[0]?.count || 0,
    previous: row?.previous?.[0]?.count || 0,
    byBranch,
  };
}

async function compactFunnel(from, to) {
  try {
    const result = await fetchCallby("/api/leads", {
      params: { ...toLeadDateParams(from.toISOString(), to.toISOString()), limit: String(LEAD_SAMPLE_CAP) },
    });
    const leads = result?.data?.leads || [];
    const truncated = (result?.data?.total || 0) > leads.length;
    const stages = stageRate(await computeStagesForLeads(leads));
    return { stages, stageDefinitions: STAGE_DEFINITIONS, truncated, error: null };
  } catch (err) {
    return { stages: [], stageDefinitions: STAGE_DEFINITIONS, truncated: false, error: "Couldn't load the funnel (callby unreachable)" };
  }
}

async function attentionSummary() {
  const [followUps, interested, bookingDone, surgeryBooked] = await Promise.all([
    overdueFollowUps(),
    interestedNoRecentCall(),
    stalePatients("BOOKING_DONE", ATTENTION_THRESHOLDS.bookingDoneStaleDays),
    stalePatients("SURGERY_BOOKED", ATTENTION_THRESHOLDS.surgeryBookedStaleDays),
  ]);
  const rules = [
    { key: "overdueFollowUps", label: "Overdue follow-ups", count: followUps.items.length, valueAtRisk: 0, error: followUps.error },
    { key: "interestedNoCall", label: `Interested, no call ${ATTENTION_THRESHOLDS.interestedNoCallDays}+ days`, count: interested.items.length, valueAtRisk: 0, error: interested.error },
    { key: "bookingDoneStale", label: `Booking done, stale ${ATTENTION_THRESHOLDS.bookingDoneStaleDays}+ days`, count: bookingDone.length, valueAtRisk: bookingDone.reduce((s, r) => s + (r.pendingAmount || 0), 0), error: null },
    { key: "surgeryBookedStale", label: `Surgery booked, stale ${ATTENTION_THRESHOLDS.surgeryBookedStaleDays}+ days`, count: surgeryBooked.length, valueAtRisk: surgeryBooked.reduce((s, r) => s + (r.pendingAmount || 0), 0), error: null },
  ];
  return {
    totalFlagged: rules.reduce((s, r) => s + r.count, 0),
    totalValueAtRisk: rules.reduce((s, r) => s + (r.valueAtRisk || 0), 0),
    rules,
  };
}

async function topBottomPerformers() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * DAY_MS);
  const periodDays = daysInPeriod(from.toISOString(), to.toISOString());

  const employees = await Employee.find({ isactive: true, mergedInto: null }).select("name role branch callbyUserId employeeId").lean();
  const bySection = new Map();
  for (const e of employees) {
    const section = employeeSection(e.role);
    if (!SECTION_METRIC_BUILDERS[section]) continue;
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(e);
  }

  const scoredAll = [];
  for (const [section, sectionEmployees] of bySection) {
    let metricsById;
    try {
      const result = await SECTION_METRIC_BUILDERS[section](sectionEmployees, { from: from.toISOString(), to: to.toISOString() });
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
      if (r && r.insufficientData === false) {
        scoredAll.push({ id: String(e._id), name: e.name, role: e.role, section, branch: e.branch, score: r.score, band: r.band });
      }
    }
  }
  scoredAll.sort((a, b) => b.score - a.score);
  return { top: scoredAll.slice(0, 3), bottom: scoredAll.slice(-3).reverse(), scoredCount: scoredAll.length };
}

export const GET = withCallbyRoute(async (req, session) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get("branch") || "All";
  const from = new Date(searchParams.get("from") || Date.now() - DAY_MS);
  const to = new Date(searchParams.get("to") || Date.now());
  const { prevFrom, prevTo } = prevWindow(from, to);

  const meta = {};
  const key = cacheKey("owner", { route: "dashboard", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 60, async () => {
    const [revenue, surgeries, funnel, attention, performers] = await Promise.all([
      revenueFacet(branch, from, to, prevFrom, prevTo),
      surgeriesFacet(branch, from, to, prevFrom, prevTo),
      compactFunnel(from, to),
      attentionSummary(),
      topBottomPerformers(),
    ]);

    return {
      success: true,
      period: { from, to, prevFrom, prevTo },
      revenue,
      surgeries,
      funnel,
      attention,
      performers,
    };
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  res.headers.set("Cache-Control", "private, max-age=20, stale-while-revalidate=40");
  return res;
});
