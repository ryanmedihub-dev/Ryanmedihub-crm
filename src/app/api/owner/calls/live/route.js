import { NextResponse } from "next/server";
import { fetchCallby } from "@/lib/callby";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";

export const GET = withCallbyRoute(async () => {
  const result = await fetchCallby("/api/leads/workforce-summary");
  return NextResponse.json({
    success: true,
    generatedAt: result.data?.generatedAt,
    range: result.data?.range,
    agents: result.data?.agents || [],
  });
});
