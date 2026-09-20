
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import AdSpend from "@/models/AdSpend";
import { ALL_BRANCHES } from "@/lib/branches";
import { attributeSpendToOutcomes } from "@/lib/owner/marketingAttribution";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];
const PLATFORMS = ["Meta", "Google"];

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

function validatePayload({ date, branch, platform, amount, clicks }) {
  if (!date || isNaN(new Date(date).getTime())) return "A valid date is required";
  if (!branch || !ALL_BRANCHES.includes(branch)) return `branch must be one of: ${ALL_BRANCHES.join(", ")}`;
  if (!platform || !PLATFORMS.includes(platform)) return `platform must be one of: ${PLATFORMS.join(", ")}`;
  if (amount == null || isNaN(amount) || Number(amount) < 0) return "amount must be a non-negative number";
  if (clicks != null && clicks !== "" && (isNaN(clicks) || Number(clicks) < 0)) return "clicks must be a non-negative number";
  return null;
}

const getHandler = async (req) => {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const branch = searchParams.get("branch");
  const platform = searchParams.get("platform");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const withReturn = searchParams.get("withReturn") === "true";

  const meta = {};
  const key = cacheKey("owner", { route: "ad-spend", ...Object.fromEntries(searchParams) }, session);
  const data = await cached(key, 180, async () => {
    const query = {};
    if (branch && branch !== "All") query.branch = branch;
    if (platform && PLATFORMS.includes(platform)) query.platform = platform;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const entries = await AdSpend.find(query)
      .populate("campaignId", "name status")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const response = { success: true, entries };

    // The "return" picture — spend/leads/CPL/CPC/converted/revenue/CAC/ROAS for
    // the same filter, via the shared attribution module (marketingAttribution.js).
    if (withReturn && from && to) {
      const platforms = platform && PLATFORMS.includes(platform) ? [platform] : PLATFORMS;
      const { byPlatform } = await attributeSpendToOutcomes({
        platforms,
        branch,
        from: new Date(from),
        to: new Date(to),
      });
      response.returnByPlatform = byPlatform;
    }

    return response;
  }, meta);

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
};

const postHandler = async (req) => {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const { date, branch, platform, campaignName = "", campaignId = null, amount, clicks } = body;

  const validationError = validatePayload({ date, branch, platform, amount, clicks });
  if (validationError) {
    return NextResponse.json({ success: false, message: validationError }, { status: 400 });
  }

  const entry = await AdSpend.create({
    date: new Date(date),
    branch,
    platform,
    campaignName: campaignName?.trim() || "",
    campaignId: campaignId || null,
    amount: Number(amount),
    clicks: clicks === "" || clicks == null ? null : Number(clicks),
    enteredBy: { name: session.user.name, email: session.user.email },
  });

  return NextResponse.json({ success: true, entry });
};

const putHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, message: "id is required" }, { status: 400 });
  }

  const body = await req.json();
  const { date, branch, platform, campaignName = "", campaignId = null, amount, clicks } = body;

  const validationError = validatePayload({ date, branch, platform, amount, clicks });
  if (validationError) {
    return NextResponse.json({ success: false, message: validationError }, { status: 400 });
  }

  const entry = await AdSpend.findByIdAndUpdate(
    id,
    {
      date: new Date(date),
      branch,
      platform,
      campaignName: campaignName?.trim() || "",
      campaignId: campaignId || null,
      amount: Number(amount),
      clicks: clicks === "" || clicks == null ? null : Number(clicks),
    },
    { new: true, runValidators: true }
  );

  if (!entry) {
    return NextResponse.json({ success: false, message: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, entry });
};

const deleteHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, message: "id is required" }, { status: 400 });
  }

  const entry = await AdSpend.findByIdAndDelete(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
};

export const GET = withDB(getHandler);
export const POST = withDB(postHandler);
export const PUT = withDB(putHandler);
export const DELETE = withDB(deleteHandler);
