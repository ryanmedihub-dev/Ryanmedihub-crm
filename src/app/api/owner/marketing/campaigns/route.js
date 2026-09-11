import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import AdCampaign from "@/models/AdCampaign";
import { ALL_BRANCHES } from "@/lib/branches";
import { computeCampaignSpend } from "@/lib/owner/marketingAttribution";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];
const PLATFORMS = ["Meta", "Google"];
const STATUSES = ["Active", "Paused", "Ended"];

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

function validatePayload(body) {
  if (!body.name?.trim()) return "Campaign name is required";
  if (!PLATFORMS.includes(body.platform)) return `platform must be one of: ${PLATFORMS.join(", ")}`;
  if (!ALL_BRANCHES.includes(body.branch)) return `branch must be one of: ${ALL_BRANCHES.join(", ")}`;
  if (body.dailyBudget != null && (isNaN(body.dailyBudget) || Number(body.dailyBudget) < 0)) {
    return "dailyBudget must be a non-negative number";
  }
  if (!Array.isArray(body.targetLocations) || body.targetLocations.filter(Boolean).length === 0) {
    return "At least one target location is required";
  }
  if (body.startDate && body.endDate && new Date(body.endDate) < new Date(body.startDate)) {
    return "End date must be after start date";
  }
  if (body.targetAgeMin != null && body.targetAgeMax != null && Number(body.targetAgeMin) > Number(body.targetAgeMax)) {
    return "targetAgeMin must not be greater than targetAgeMax";
  }
  return null;
}

// GET — list campaigns, with computed spend/clicks/CPC for the period.
// Leads/CPL/Converted/CAC are NOT computed per campaign — Leads.tag only
// distinguishes platform, never campaign (see marketingAttribution.js).
const getHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);
  const status = searchParams.get("status") || "Active";
  const platform = searchParams.get("platform");
  const showAll = status === "All";

  const match = {};
  if (!showAll) match.status = status;
  if (platform && PLATFORMS.includes(platform)) match.platform = platform;
  if (branch && branch !== "All") match.branch = branch;

  const campaigns = await AdCampaign.find(match).sort({ createdAt: -1 }).lean();

  const from = dateFrom ? new Date(dateFrom) : new Date(0);
  const to = dateTo ? new Date(dateTo) : new Date();

  const rows = await Promise.all(
    campaigns.map(async (c) => {
      const spend = await computeCampaignSpend({ campaignId: c._id, from, to });
      return { ...c, id: String(c._id), ...spend };
    }),
  );

  return NextResponse.json({ success: true, campaigns: rows });
};

// POST — create a campaign.
const postHandler = async (req) => {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const validationError = validatePayload(body);
  if (validationError) {
    return NextResponse.json({ success: false, message: validationError }, { status: 400 });
  }

  const nameKey = body.name.trim().toLowerCase();
  const existing = await AdCampaign.findOne({ platform: body.platform, nameKey });
  if (existing) {
    return NextResponse.json(
      { success: false, message: `A ${body.platform} campaign named "${body.name.trim()}" already exists` },
      { status: 409 },
    );
  }

  const who = { name: session.user.name, email: session.user.email };
  const campaign = await AdCampaign.create({
    name: body.name.trim(),
    nameKey,
    platform: body.platform,
    branch: body.branch,
    status: STATUSES.includes(body.status) ? body.status : "Active",
    objective: body.objective || "",
    targetLocations: (body.targetLocations || []).map((l) => String(l).trim()).filter(Boolean),
    targetAgeMin: body.targetAgeMin ?? null,
    targetAgeMax: body.targetAgeMax ?? null,
    targetGender: ["All", "Male", "Female"].includes(body.targetGender) ? body.targetGender : "All",
    dailyBudget: Number(body.dailyBudget) || 0,
    startDate: body.startDate ? new Date(body.startDate) : null,
    endDate: body.endDate ? new Date(body.endDate) : null,
    platformCampaignId: body.platformCampaignId || "",
    notes: body.notes || "",
    createdBy: who,
    updatedBy: who,
  });

  return NextResponse.json({ success: true, campaign });
};

export const GET = withDB(getHandler);
export const POST = withDB(postHandler);
