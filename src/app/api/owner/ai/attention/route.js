import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { withCallbyRoute } from "@/lib/owner/callbyRoute";
import { getAttentionItems } from "@/lib/owner/metrics/attention";

export const GET = withCallbyRoute(async (req) => {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || searchParams.get("dateFrom") || "";
  const to = searchParams.get("to") || searchParams.get("dateTo") || "";
  const data = await getAttentionItems({ from, to });
  return NextResponse.json({ success: true, ...data });
});
