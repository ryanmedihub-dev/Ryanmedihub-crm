import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import AdCampaign from "@/models/AdCampaign";
import CampaignLead from "@/models/CampaignLead";
import UploadBatch from "@/models/UploadBatch";
import { runValidateCampaignLeads, MAX_ROWS } from "@/lib/uploads/validateCampaignLeads";
import { cacheInvalidate } from "@/lib/cache";

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
    const confirmedHashes = new Set(Array.isArray(body.confirmedHashes) ? body.confirmedHashes : []);
    const skipErrors = body.skipErrors === true;
    const batchLabel = String(body.batchLabel || "").trim();
    const fileName = String(body.fileName || "").trim();

    if (!campaignId || !mongoose.Types.ObjectId.isValid(campaignId)) {
      return NextResponse.json({ error: "Pick a campaign before uploading." }, { status: 400 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Max ${MAX_ROWS} rows per upload. Split the file.` }, { status: 400 });
    }
    if (confirmedHashes.size === 0) {
      return NextResponse.json({ error: "Nothing was confirmed for import." }, { status: 400 });
    }

    await connectDB();

    const campaign = await AdCampaign.findById(campaignId).lean();
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

    // Never trust the client's payloads — rebuild everything from the raw rows.
    const { summary, results } = await runValidateCampaignLeads(rows, campaign);

    const brokeSincePreview = results.filter((r) => confirmedHashes.has(r.rowHash) && r.status === "error");
    if (brokeSincePreview.length > 0 && !skipErrors) {
      return NextResponse.json(
        {
          error: `${brokeSincePreview.length} row(s) that were ready in the preview now fail — something changed. Review the refreshed preview and try again.`,
          summary,
          results,
        },
        { status: 409 },
      );
    }

    // skipCreate rows (already in this campaign, or a within-file repeat) are confirmed but
    // never attempted — they're reported as skipped, not as a failure.
    const skippedByDesign = results.filter((r) => confirmedHashes.has(r.rowHash) && r.skipCreate);
    const toImport = results.filter(
      (r) => confirmedHashes.has(r.rowHash) && (r.status === "ok" || r.status === "warning") && !r.skipCreate,
    );

    if (toImport.length === 0) {
      return NextResponse.json(
        { error: "Nothing to import — every confirmed row already exists for this campaign or repeats an earlier row.", skippedByDesign: skippedByDesign.map((r) => r.rowNumber), summary, results },
        { status: 409 },
      );
    }

    const batchNo = (await UploadBatch.countDocuments()) + 1;
    const batch = await UploadBatch.create({
      batchNo,
      kind: "CAMPAIGN_LEAD",
      label: batchLabel || `Campaign lead upload #${batchNo}`,
      fileName,
      totalRows: rows.length,
      status: "processing",
      rowHashes: [],
      createdBy: { name: session.user.name, email: session.user.email, branch: session.user.branch, date: new Date() },
    });

    const outcomes = [];
    const createdIds = [];
    const committedHashes = [];

    for (const row of toImport) {
      try {
        const doc = await CampaignLead.create({
          ...row.payload,
          uploadBatch: batch._id,
          uploadedBy: { name: session.user.name, email: session.user.email },
        });
        createdIds.push(doc._id);
        committedHashes.push(row.rowHash);
        outcomes.push({ rowNumber: row.rowNumber, campaignLeadId: String(doc._id) });
      } catch (err) {
        // A parallel upload could have inserted the same campaign+phone between our
        // pre-check and this insert — the unique index is the actual source of truth.
        const friendly = err?.code === 11000
          ? "Already exists for this campaign (created between preview and import)."
          : err?.message || "Failed to create campaign lead";
        outcomes.push({ rowNumber: row.rowNumber, error: friendly });
      }
    }
    for (const r of skippedByDesign) {
      outcomes.push({ rowNumber: r.rowNumber, error: r.warnings[0] || "Skipped", skipped: true });
    }
    for (const b of brokeSincePreview) {
      outcomes.push({ rowNumber: b.rowNumber, error: b.errors.join(" · "), skipped: true });
    }

    const failedRows = outcomes.filter((o) => o.error && !o.skipped).map((o) => ({ rowNumber: o.rowNumber, error: o.error }));
    const createdCount = outcomes.filter((o) => o.campaignLeadId).length;
    const status = createdCount === 0 ? "failed" : failedRows.length > 0 ? "partial" : "completed";

    batch.createdCampaignLeads = createdIds;
    batch.failedRows = failedRows;
    batch.rowHashes = committedHashes;
    batch.status = status;
    await batch.save();

    await cacheInvalidate("owner");
    return NextResponse.json({
      batchId: String(batch._id),
      batchNo: batch.batchNo,
      created: createdCount,
      failed: failedRows.length,
      docsCreated: createdIds.length,
      results: outcomes,
    });
  } catch (error) {
    console.error("campaign-lead commit failed:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
