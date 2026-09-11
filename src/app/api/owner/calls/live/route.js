import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";

// /owner/calls/live — agent-status half of the old combined live-workforce
// page. Only calls workforce-summary; the retry-lanes half now lives at
// /owner/leads/retry with its own route (src/app/api/owner/leads/retry/route.js)
// so neither page fetches data it doesn't render.
export const GET = withCallbyRoute(async () => {
  const result = await fetchCallby("/api/leads/workforce-summary");
  return NextResponse.json({
    success: true,
    generatedAt: result.data?.generatedAt,
    range: result.data?.range,
    agents: result.data?.agents || [],
  });
});
