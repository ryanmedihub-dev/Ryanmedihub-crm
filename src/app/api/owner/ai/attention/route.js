import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { getAttentionItems } from "@/lib/owner/metrics/attention";

// /owner/ai/attention — documented threshold rules over existing data (no AI,
// no scoring model). The rules live in src/lib/owner/metrics/attention.js,
// shared with the dashboard, suggestions and Sanya's get_attention_items
// tool. Successor to /owner/leads/leaks (kept live as a redirect target).
export const GET = withCallbyRoute(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || searchParams.get("dateFrom") || "";
  const to = searchParams.get("to") || searchParams.get("dateTo") || "";
  const data = await getAttentionItems({ from, to });
  return NextResponse.json({ success: true, ...data });
});
