import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { getCampaignLeadDetail } from "@/lib/owner/campaignAttribution";
import { cacheKey, cached } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — owner access required" }, { status: 403 });
    }

    const { campaignId } = await params;
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    await connectDB();

    const meta = {};
    const key = cacheKey("owner", { route: "campaign-performance-leads", campaignId, ...Object.fromEntries(searchParams) }, session);
    const data = await cached(
      key, 300,
      () => getCampaignLeadDetail({ campaignId: new mongoose.Types.ObjectId(campaignId), from, to, searchParams }),
      meta,
    );

    const res = NextResponse.json({ success: true, ...data });
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("campaign-performance leads error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
