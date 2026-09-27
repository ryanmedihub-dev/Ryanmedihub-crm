import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import AdCampaign from "@/models/AdCampaign";
import { ALL_BRANCHES } from "@/lib/branches";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — owner access required" }, { status: 403 });
  }

  await connectDB();

  const campaigns = await AdCampaign.find({})
    .select("name platform branch status")
    .sort({ name: 1 })
    .lean();

  const STATUS_ORDER = { Active: 0, Paused: 1, Ended: 2 };
  campaigns.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({ id: String(c._id), name: c.name, platform: c.platform, branch: c.branch, status: c.status })),
    branches: ALL_BRANCHES,
  });
}
