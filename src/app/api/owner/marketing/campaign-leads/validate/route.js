import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import AdCampaign from "@/models/AdCampaign";
import { runValidateCampaignLeads, MAX_ROWS } from "@/lib/uploads/validateCampaignLeads";
import { syncCampaignSource } from "@/lib/owner/campaignSourceSync";
import { campaignSourceLabel } from "@/lib/owner/campaignSource";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — owner access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : null;
    const campaignId = String(body.campaignId || "");

    if (!campaignId || !mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json({ error: "Pick a campaign before uploading." }, { status: 400 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows to validate." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Max ${MAX_ROWS} rows per upload. Split the file.` }, { status: 400 });
    }

    await connectDB();

    const campaign = await AdCampaign.findById(campaignId).lean();
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

    const { summary, results } = await runValidateCampaignLeads(rows, campaign);

    
    
    const validPhones = results.filter((r) => r.status !== "error" && r.payload).map((r) => r.payload.phoneNormalized);
    const dry = await syncCampaignSource({ phones: validPhones, label: campaignSourceLabel(campaign), dryRun: true });
    const sourcePreview = { status: dry.status, label: dry.label, matched: dry.matched, wouldUpdate: dry.wouldUpdate, alreadySet: dry.alreadySet, unmatched: dry.unmatched, error: dry.error };

    return NextResponse.json({ summary, results, sourcePreview });
  } catch (error) {
    console.error("campaign-lead validate failed:", error);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
