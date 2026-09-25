import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import AiInsight from "@/models/AiInsight";
import { getFeature } from "@/lib/ai/features";

// GET /api/owner/ai/feed?limit=12 — latest brief insights across every
// feature, no OpenAI call. Feeds the dashboard ticker and the AI landing page.

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  let limit = parseInt(searchParams.get("limit"), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 12;
  limit = Math.min(limit, 50);

  await dbConnect();
  const docs = await AiInsight.find({ kind: "brief" }).sort({ generatedAt: -1 }).limit(limit).lean();

  const items = docs.map((d) => {
    const feature = getFeature(d.feature);
    const topAction = (d.output?.actions || [])[0]?.title || "";
    return {
      feature: d.feature,
      title: feature?.title || d.feature,
      page: feature?.page || "",
      headline: d.output?.headline || "",
      sentiment: d.output?.sentiment || "neutral",
      healthScore: d.output?.healthScore ?? null,
      topAction,
      generatedAt: d.generatedAt,
    };
  });

  return NextResponse.json({ success: true, items });
}
