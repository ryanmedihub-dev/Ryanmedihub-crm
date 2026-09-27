import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import AdCampaign from "@/models/AdCampaign";
import { ALL_BRANCHES } from "@/lib/branches";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];
const PLATFORMS = ["Meta", "Google"];

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req, { params }) {
  try {
    await dbConnect();
    const { session, error } = await requireSession();
    if (error) return error;
    const { id } = await params;

    const meta = {};
    const key = cacheKey("owner", { route: "marketing-campaign-detail", id }, session);
    const data = await cached(key, 180, async () => {
      const campaign = await AdCampaign.findById(id).lean();
      return campaign ? { success: true, campaign } : null;
    }, meta);

    if (!data) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (err) {
    console.error("campaign detail error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    await dbConnect();
    const { session, error } = await requireSession();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();

    if (body.platform && !PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ success: false, message: `platform must be one of: ${PLATFORMS.join(", ")}` }, { status: 400 });
    }
    if (body.branch && !ALL_BRANCHES.includes(body.branch)) {
      return NextResponse.json({ success: false, message: `branch must be one of: ${ALL_BRANCHES.join(", ")}` }, { status: 400 });
    }
    if (body.targetLocations && (!Array.isArray(body.targetLocations) || body.targetLocations.filter(Boolean).length === 0)) {
      return NextResponse.json({ success: false, message: "At least one target location is required" }, { status: 400 });
    }
    const start = body.startDate !== undefined ? body.startDate : undefined;
    const end = body.endDate !== undefined ? body.endDate : undefined;
    if (start && end && new Date(end) < new Date(start)) {
      return NextResponse.json({ success: false, message: "End date must be after start date" }, { status: 400 });
    }
    if (body.dailyBudget != null && (isNaN(body.dailyBudget) || Number(body.dailyBudget) < 0)) {
      return NextResponse.json({ success: false, message: "dailyBudget must be a non-negative number" }, { status: 400 });
    }

    const update = {};
    for (const key of ["platform", "branch", "status", "objective", "targetGender", "platformCampaignId", "notes"]) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    if (body.name !== undefined) {
      update.name = body.name.trim();
      update.nameKey = body.name.trim().toLowerCase();
    }
    if (body.targetLocations !== undefined) {
      update.targetLocations = body.targetLocations.map((l) => String(l).trim()).filter(Boolean);
    }
    if (body.targetAgeMin !== undefined) update.targetAgeMin = body.targetAgeMin;
    if (body.targetAgeMax !== undefined) update.targetAgeMax = body.targetAgeMax;
    if (body.dailyBudget !== undefined) update.dailyBudget = Number(body.dailyBudget) || 0;
    if (body.startDate !== undefined) update.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) update.endDate = body.endDate ? new Date(body.endDate) : null;
    update.updatedBy = { name: session.user.name, email: session.user.email };

    if (update.name || update.platform) {
      const current = await AdCampaign.findById(id).select("name platform").lean();
      if (!current) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      const platform = update.platform || current.platform;
      const nameKey = update.nameKey || current.name.trim().toLowerCase();
      const dupe = await AdCampaign.findOne({ platform, nameKey, _id: { $ne: id } }).lean();
      if (dupe) {
        return NextResponse.json({ success: false, message: `A ${platform} campaign with that name already exists` }, { status: 409 });
      }
    }

    const campaign = await AdCampaign.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ success: true, campaign });
  } catch (err) {
    console.error("campaign update error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await dbConnect();
    const { session, error } = await requireSession();
    if (error) return error;

    const { id } = await params;
    const campaign = await AdCampaign.findByIdAndUpdate(
      id,
      { status: "Ended", updatedBy: { name: session.user.name, email: session.user.email } },
      { new: true },
    );
    if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ success: true, campaign, message: "Campaign ended" });
  } catch (err) {
    console.error("campaign end error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
