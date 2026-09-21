import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { getCampaignPerformance } from "@/lib/owner/campaignAttribution";
import { cacheKey, cached } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — owner access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const platform = searchParams.get("platform") || "";
    const branch = searchParams.get("branch") || "";
    const campaignId = searchParams.get("campaignId") || "";

    await connectDB();

    const meta = {};
    const key = cacheKey("owner", { route: "campaign-performance", from, to, platform, branch, campaignId }, session);
    const data = await cached(key, 300, () => getCampaignPerformance({ from, to, platform, branch, campaignId }), meta);

    const res = NextResponse.json({ success: true, ...data });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("campaign-performance error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
