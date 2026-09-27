import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import UploadBatch from "@/models/UploadBatch";
import CampaignLead from "@/models/CampaignLead";
import { syncCampaignSource } from "@/lib/owner/campaignSourceSync";
import { cacheInvalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — owner access required" }, { status: 403 });
    }

    const { batchId } = await params;
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    await connectDB();

    const batch = await UploadBatch.findById(batchId);
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    if (batch.kind !== "CAMPAIGN_LEAD") {
      return NextResponse.json({ error: "This batch is not a campaign-lead upload." }, { status: 400 });
    }
    if (batch.status === "reverted") {
      return NextResponse.json({ error: "This batch has been reverted — its leads no longer exist." }, { status: 400 });
    }
    if (!batch.sourceSync?.label) {
      return NextResponse.json({ error: "This batch has no source-sync label to retry." }, { status: 400 });
    }

    const leads = await CampaignLead.find({ uploadBatch: batch._id }).select("phoneNormalized").lean();
    const phones = leads.map((l) => l.phoneNormalized);

    batch.sourceSync = { status: "pending", label: batch.sourceSync.label };
    await batch.save();
    batch.sourceSync = await syncCampaignSource({
      phones,
      label: batch.sourceSync.label,
      ref: `ryan-upload-batch-${batch.batchNo}`,
    });
    await batch.save();

    await cacheInvalidate("owner");
    return NextResponse.json({ sourceSync: batch.sourceSync });
  } catch (error) {
    console.error("campaign-lead sync-source failed:", error);
    return NextResponse.json({ error: "Source sync failed" }, { status: 500 });
  }
}
