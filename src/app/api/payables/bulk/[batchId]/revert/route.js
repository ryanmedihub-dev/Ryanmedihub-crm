import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import UploadBatch from "@/models/UploadBatch";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const { batchId } = await params;
    if (!mongoose.Types.ObjectId.isValid(batchId)) {
      return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
    }

    await connectDB();

    const batch = await UploadBatch.findById(batchId);
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    if (batch.status === "reverted") {
      return NextResponse.json({ error: "This batch has already been reverted." }, { status: 400 });
    }
    if (batch.status === "processing") {
      return NextResponse.json({ error: "This batch is still importing." }, { status: 400 });
    }

    const ids = (batch.createdPayables || []).map((id) => new mongoose.Types.ObjectId(id));
    if (ids.length === 0) {
      batch.status = "reverted";
      batch.revertedAt = new Date();
      batch.revertedBy = { name: session.user.name, email: session.user.email };
      await batch.save();
      return NextResponse.json({ cancelled: 0, skipped: [], message: "Batch had no payables." });
    }

    // Which of the batch's payables already have money against them — those are left alone.
    const withPaid = await Payable.aggregate([
      { $match: { _id: { $in: ids } } },
      ...buildPayableAggregationStages(Transactions.collection.name),
      { $project: { paid: 1, "payee.label": 1 } },
    ]);
    const paidById = new Map(withPaid.map((p) => [String(p._id), p.paid || 0]));

    const note = `Bulk upload batch #${batch.batchNo} reverted`;
    const performedBy = { name: session.user.name, email: session.user.email };

    const cancelled = [];
    const skipped = [];

    for (const id of ids) {
      const key = String(id);
      if ((paidById.get(key) || 0) > 0) {
        const label = withPaid.find((p) => String(p._id) === key)?.payee?.label || key;
        skipped.push({ payableId: key, reason: `Has ₹${(paidById.get(key) || 0).toLocaleString("en-IN")} paid against it (${label})` });
        continue;
      }
      const payable = await Payable.findById(id);
      if (!payable) {
        skipped.push({ payableId: key, reason: "No longer exists" });
        continue;
      }
      if (payable.isCancelled) {
        skipped.push({ payableId: key, reason: "Already cancelled" });
        continue;
      }
      payable.isCancelled = true;
      payable.log.push({
        action: "Cancelled",
        previousValue: "false",
        newValue: "true",
        note,
        performedBy,
        performedAt: new Date(),
      });
      await payable.save();
      cancelled.push(key);
    }

    batch.status = "reverted";
    batch.revertedAt = new Date();
    batch.revertedBy = performedBy;
    await batch.save();

    return NextResponse.json({
      cancelled: cancelled.length,
      skipped,
      message:
        skipped.length > 0
          ? `${cancelled.length} cancelled, ${skipped.length} left alone (payments recorded against them).`
          : `${cancelled.length} payable(s) cancelled.`,
    });
  } catch (error) {
    console.error("bulk payable revert failed:", error);
    return NextResponse.json({ error: "Revert failed" }, { status: 500 });
  }
}
