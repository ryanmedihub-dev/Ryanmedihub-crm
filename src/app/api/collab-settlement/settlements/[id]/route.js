import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import CollabSettlement from "@/models/CollabSettlement";
import Transactions from "@/models/Transactions";
import DeleteLog from "@/models/DeleteLog";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid settlement ID" }, { status: 400 });
    }

    const settlement = await CollabSettlement.findById(id);
    if (!settlement) {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }

    const linkedIds = settlement.generatedTransactions || [];

    const linkedDocs = linkedIds.length
      ? await Transactions.find({ _id: { $in: linkedIds } })
          .select("transactionCategory costType amount method branch date procedure expense")
          .lean()
      : [];

    await DeleteLog.create({
      entityType: "CollabSettlement",
      entityId: String(settlement._id),
      entityName: `${settlement.clinic} — ${settlement.direction}`,
      entityDetails: {
        clinic: settlement.clinic,
        direction: settlement.direction,
        amount: settlement.amount,
        date: settlement.date,
        mode: settlement.mode,
        reference: settlement.reference,
        remarks: settlement.remarks,
        coveredCases: (settlement.coveredCases || []).map((c) => ({
          case: String(c.case),
          amount: c.amount,
        })),
        deletedTransactions: linkedDocs.map((t) => ({
          id: String(t._id),
          category: t.transactionCategory,
          costType: t.costType,
          amount: t.amount,
          date: t.date,
        })),
        createdBy: settlement.createdBy?.name,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: settlement.clinic,
    });

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        if (linkedIds.length) {
          await Transactions.deleteMany({ _id: { $in: linkedIds } }, { session: dbSession });
        }
        await CollabSettlement.deleteOne({ _id: settlement._id }, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      message: "Settlement deleted",
      deletedTransactions: linkedIds.length,
    });
  } catch (error) {
    console.error("Error deleting collab settlement:", error);
    return NextResponse.json({ error: "Failed to delete settlement" }, { status: 500 });
  }
}
