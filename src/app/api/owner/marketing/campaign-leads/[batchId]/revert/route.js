import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import UploadBatch from "@/models/UploadBatch";
import CampaignLead from "@/models/CampaignLead";
import { cacheInvalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["owner", "super-admin"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
      return NextResponse.json({ error: "This batch has already been reverted." }, { status: 400 });
    }
    if (batch.status === "processing") {
      return NextResponse.json({ error: "This batch is still importing." }, { status: 400 });
    }
    if (Date.now() - new Date(batch.createdAt).getTime() > THIRTY_DAYS_MS) {
      return NextResponse.json({ error: "This batch is more than 30 days old and can no longer be reverted." }, { status: 400 });
    }

    
    
    const ids = batch.createdCampaignLeads || [];
    const { deletedCount } = ids.length ? await CampaignLead.deleteMany({ _id: { $in: ids } }) : { deletedCount: 0 };

    batch.status = "reverted";
    batch.revertedAt = new Date();
    batch.revertedBy = { name: session.user.name, email: session.user.email };
    await batch.save();

    await cacheInvalidate("owner");
    return NextResponse.json({ deleted: deletedCount, message: `${deletedCount} campaign lead(s) deleted.` });
  } catch (error) {
    console.error("campaign-lead revert failed:", error);
    return NextResponse.json({ error: "Revert failed" }, { status: 500 });
  }
}
