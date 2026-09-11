import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Patient from "@/models/Patient";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute, toCallDateParams } from "@/lib/owner/callbyRoute";
import { parseEmployeeFilters } from "@/lib/owner/pagination";
import { normalizePhone } from "@/lib/phone";

// /owner/statistics — the full conversion funnel, leads-created through
// surgery-done, stage-by-stage (Owner Panel v2, Part 6). Cross-system: the
// first 5 stages are callby Lead.status (the calling workflow); the last 3
// are ryan-crm Patient.ops.status (Part 3's confirmed mapping), joined by
// phone. One callby call for the funnel counts, one more (capped) for the
// actual lead list needed to do the phone-join into Patient — see the
// STAGE_DEFINITIONS export for exactly what each stage means.
//
// Sample cap: the phone-join needs actual lead records, not just counts —
// capped at 3000 leads per request (documented on the page) rather than an
// unbounded fetch; the funnel's own "Leads Created" count still comes from
// callby's real total, uncapped.
const LEAD_SAMPLE_CAP = 3000;

export const STAGE_DEFINITIONS = [
  { key: "leadsCreated", label: "Leads Created", source: "callby Lead", rule: "Lead.createdAt in the selected period" },
  { key: "contacted", label: "Contacted", source: "callby Lead", rule: "status is not 'new' (at least one attempt made)" },
  { key: "interested", label: "Interested", source: "callby Lead", rule: "status = 'interested'" },
  { key: "followUp", label: "Follow-up", source: "callby Lead", rule: "status = 'follow_up'" },
  { key: "converted", label: "Converted", source: "callby Lead", rule: "status = 'converted' (handed off as a patient)" },
  { key: "bookingDone", label: "Booking Done", source: "ryan-crm Patient", rule: "phone-matched Patient.ops.status in [BOOKING_DONE, SURGERY_BOOKED, CLOSED]" },
  { key: "surgeryBooked", label: "Surgery Booked", source: "ryan-crm Patient", rule: "phone-matched Patient.ops.status in [SURGERY_BOOKED, CLOSED] — this is the 'fully paid' status, see Part 3" },
  { key: "surgeryDone", label: "Surgery Done", source: "ryan-crm Patient", rule: "phone-matched Patient.ops.status = CLOSED" },
];

export function emptyStageCounts() {
  return { leadsCreated: 0, contacted: 0, interested: 0, followUp: 0, converted: 0, bookingDone: 0, surgeryBooked: 0, surgeryDone: 0 };
}

// Exported so /owner/ai/suggestions can compute the same funnel numbers
// without a second, drifting implementation (or an HTTP round-trip to itself).
export async function computeStagesForLeads(leads) {
  const counts = emptyStageCounts();
  counts.leadsCreated = leads.length;
  for (const l of leads) {
    if (l.status !== "new") counts.contacted++;
    if (l.status === "interested") counts.interested++;
    if (l.status === "follow_up") counts.followUp++;
    if (l.status === "converted") counts.converted++;
  }

  const phones = [...new Set(leads.map((l) => normalizePhone(l.phone)).filter(Boolean))];
  if (phones.length) {
    const patients = await Patient.find({ "personal.phoneNormalized": { $in: phones } })
      .select("personal.phoneNormalized ops.status")
      .lean();
    // A phone can match more than one Patient record (rare) — take the most
    // "advanced" status per phone so the funnel doesn't double count.
    const rank = { CLOSED: 3, SURGERY_BOOKED: 2, BOOKING_DONE: 1 };
    const bestByPhone = new Map();
    for (const p of patients) {
      const phone = p.personal?.phoneNormalized;
      const status = p.ops?.status;
      if (!phone || !rank[status]) continue;
      const cur = bestByPhone.get(phone) || 0;
      if (rank[status] > cur) bestByPhone.set(phone, rank[status]);
    }
    for (const r of bestByPhone.values()) {
      if (r >= 1) counts.bookingDone++;
      if (r >= 2) counts.surgeryBooked++;
      if (r >= 3) counts.surgeryDone++;
    }
  }
  return counts;
}

export function stageRate(counts) {
  const seq = ["leadsCreated", "contacted", "interested", "followUp", "converted", "bookingDone", "surgeryBooked", "surgeryDone"];
  return seq.map((key, i) => {
    const value = counts[key] || 0;
    const prevKey = seq[i - 1];
    const prevValue = prevKey ? counts[prevKey] || 0 : null;
    return {
      key,
      value,
      stageConversionRate: prevValue ? Math.round((value / prevValue) * 1000) / 10 : null,
      dropOff: prevValue != null ? prevValue - value : null,
      overallRate: counts.leadsCreated ? Math.round((value / counts.leadsCreated) * 1000) / 10 : null,
    };
  });
}

export const GET = withCallbyRoute(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);
  const breakdownBy = searchParams.get("breakdownBy") || "none"; // none | source | agent | team

  const result = await fetchCallby("/api/leads", {
    params: { ...toCallDateParams(dateFrom, dateTo), range: "custom", startDate: dateFrom?.slice(0, 10), endDate: dateTo?.slice(0, 10), page: "1", limit: String(LEAD_SAMPLE_CAP) },
  });
  const leads = result?.data?.leads || [];
  const truncated = (result?.data?.total || 0) > leads.length;

  const overall = await computeStagesForLeads(leads);

  let breakdown = null;
  if (breakdownBy !== "none") {
    const groups = new Map();
    for (const l of leads) {
      const key =
        breakdownBy === "source" ? (l.source || "Unspecified")
        : breakdownBy === "agent" ? (l.assignedTo?.name || "Unassigned")
        : breakdownBy === "team" ? (l.assignedTo?.tlName || "Unassigned")
        : "All";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    breakdown = [];
    for (const [key, groupLeads] of groups) {
      breakdown.push({ key, ...(await computeStagesForLeads(groupLeads)) });
    }
    breakdown.sort((a, b) => b.leadsCreated - a.leadsCreated);
  }

  // Daily trend — leads created + converted, from the same sample already
  // fetched (no second callby call).
  const dailyMap = new Map();
  for (const l of leads) {
    const day = l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : null;
    if (!day) continue;
    if (!dailyMap.has(day)) dailyMap.set(day, { date: day, leadsCreated: 0, converted: 0 });
    const d = dailyMap.get(day);
    d.leadsCreated++;
    if (l.status === "converted") d.converted++;
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    success: true,
    stageDefinitions: STAGE_DEFINITIONS,
    stages: stageRate(overall),
    breakdownBy,
    breakdown,
    daily,
    truncated,
    sampleSize: leads.length,
    totalLeadsInPeriod: result?.data?.total || leads.length,
  });
});
