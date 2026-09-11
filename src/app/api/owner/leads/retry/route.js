import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";

function bucketQueue(leads) {
  const buckets = { P0: [], P1: [], P2: [], P3: [], P4: [] };
  for (const lead of leads) {
    if (buckets[lead.priority]) buckets[lead.priority].push(lead);
  }
  return buckets;
}

// /owner/leads/retry — the P0-P4 retry lanes, split out of the old combined
// live-workforce page into their natural home (Leads, not Calls/Employees —
// these are lead-priority queues). Only calls callby's retry-queue; the
// agent-status half now lives at /owner/calls/live with its own route.
export const GET = withCallbyRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const params = {};
  const teams = searchParams.get("teams");
  if (teams) params.teams = teams;

  const result = await fetchCallby("/api/leads/retry-queue", { params });
  const d = result?.data || {};

  return NextResponse.json({
    success: true,
    generatedAt: d.generatedAt,
    totalMatching: d.totalMatching || 0,
    byPriority: d.byPriority || {},
    truncated: !!d.truncated,
    queue: bucketQueue(d.leads || []),
  });
});
