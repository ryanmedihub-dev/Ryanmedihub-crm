import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import UploadBatch from "@/models/UploadBatch";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — owner access required" }, { status: 403 });
  }

  await connectDB();

  const batches = await UploadBatch.find({ kind: "CAMPAIGN_LEAD" })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("batchNo label fileName totalRows status createdBy createdAt revertedAt createdCampaignLeads failedRows sourceSync")
    .lean();

  return NextResponse.json({
    batches: batches.map((b) => ({
      id: String(b._id),
      batchNo: b.batchNo,
      label: b.label,
      fileName: b.fileName,
      totalRows: b.totalRows,
      created: (b.createdCampaignLeads || []).length,
      failed: (b.failedRows || []).length,
      status: b.status,
      createdBy: b.createdBy?.name || "",
      createdAt: b.createdAt,
      revertedAt: b.revertedAt || null,
      sourceSync: b.sourceSync || null,
    })),
  });
}
