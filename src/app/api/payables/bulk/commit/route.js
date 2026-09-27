import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import UploadBatch from "@/models/UploadBatch";
import { createPayable } from "@/lib/entryCore/createPayable";
import { runValidatePipeline, MAX_ROWS } from "@/lib/uploads/validatePipeline";
import { cacheInvalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["admin", "super-admin"];
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : null;
    const confirmedHashes = new Set(Array.isArray(body.confirmedHashes) ? body.confirmedHashes : []);
    const skipErrors = body.skipErrors === true;
    const batchLabel = String(body.batchLabel || "").trim();
    const fileName = String(body.fileName || "").trim();

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

    
    const { summary, results } = await runValidatePipeline(rows);

    
    const brokeSincePreview = results.filter(
      (r) => confirmedHashes.has(r.rowHash) && r.status === "error",
    );
    if (brokeSincePreview.length > 0 && !skipErrors) {
      return NextResponse.json(
        {
          error:
            `${brokeSincePreview.length} row(s) that were ready in the preview now fail — ` +
            "something changed. Review the refreshed preview and try again.",
          summary,
          results,
        },
        { status: 409 },
      );
    }

    let toImport = results.filter(
      (r) => confirmedHashes.has(r.rowHash) && (r.status === "ok" || r.status === "warning"),
    );

    
    const recent = await UploadBatch.find({
      status: { $in: ["completed", "partial"] },
      createdAt: { $gte: new Date(Date.now() - DAY_MS) },
    })
      .select("batchNo createdAt rowHashes")
      .lean();
    const seenHash = new Map();
    for (const b of recent) {
      for (const h of b.rowHashes || []) if (!seenHash.has(h)) seenHash.set(h, b);
    }

    const skippedAsDuplicate = [];
    toImport = toImport.filter((r) => {
      const prev = seenHash.get(r.rowHash);
      if (prev) {
        skippedAsDuplicate.push({
          rowNumber: r.rowNumber,
          message: `Already uploaded in batch #${prev.batchNo} on ${new Date(prev.createdAt).toLocaleDateString("en-GB")}`,
        });
        return false;
      }
      return true;
    });

    if (toImport.length === 0) {
      return NextResponse.json(
        {
          error: "Every confirmed row was already imported in the last 24 hours — nothing to do.",
          skippedAsDuplicate,
          summary,
          results,
        },
        { status: 409 },
      );
    }

    const batchNo = (await UploadBatch.countDocuments()) + 1;
    const batch = await UploadBatch.create({
      batchNo,
      kind: "PAYABLE",
      label: batchLabel || `Bulk upload #${batchNo}`,
      fileName,
      totalRows: rows.length,
      status: "processing",
      rowHashes: [],
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });

    const outcomes = [];
    const createdPayableIds = [];
    const committedHashes = [];

    for (const row of toImport) {
      try {
        const res = await createPayable({
          payload: { ...row.payload, uploadBatch: batch._id },
          session,
        });
        if (res?.error) {
          outcomes.push({ rowNumber: row.rowNumber, error: res.error });
          continue;
        }
        const payableId = res.data?._id ? String(res.data._id) : null;
        const tdsPayableId = res.tdsPayable?._id ? String(res.tdsPayable._id) : null;
        if (payableId) createdPayableIds.push(payableId);
        if (tdsPayableId) createdPayableIds.push(tdsPayableId);
        committedHashes.push(row.rowHash);
        outcomes.push({ rowNumber: row.rowNumber, payableId, tdsPayableId });
      } catch (err) {
        const friendly =
          err?.code === 11000
            ? "A matching payable already exists (duplicate key) — likely created between preview and import."
            : err?.message || "Failed to create payable";
        outcomes.push({ rowNumber: row.rowNumber, error: friendly });
      }
    }

    for (const d of skippedAsDuplicate) {
      outcomes.push({ rowNumber: d.rowNumber, error: d.message, skipped: true });
    }
    for (const b of brokeSincePreview) {
      outcomes.push({ rowNumber: b.rowNumber, error: b.errors.join(" · "), skipped: true });
    }

    const failedRows = outcomes
      .filter((o) => o.error && !o.skipped)
      .map((o) => ({ rowNumber: o.rowNumber, error: o.error }));
    const createdCount = outcomes.filter((o) => o.payableId).length;

    const status =
      createdCount === 0 ? "failed" : failedRows.length > 0 ? "partial" : "completed";

    batch.createdPayables = createdPayableIds;
    batch.failedRows = failedRows;
    batch.rowHashes = committedHashes;
    batch.status = status;
    await batch.save();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({
      batchId: String(batch._id),
      batchNo: batch.batchNo,
      created: createdCount,
      failed: failedRows.length,
      docsCreated: createdPayableIds.length,
      results: outcomes,
      skippedAsDuplicate,
    });
  } catch (error) {
    console.error("bulk payable commit failed:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
