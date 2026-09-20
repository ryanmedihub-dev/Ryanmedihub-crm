import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import Borrowing from "@/models/Borrowing";
import DeleteLog from "@/models/DeleteLog";
import { buildReceivableAggregationStages } from "@/lib/receivableAggregation";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(req, { params }) {
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
      return NextResponse.json({ error: "Invalid receivable ID" }, { status: 400 });
    }

    const [receivable] = await Receivable.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      ...buildReceivableAggregationStages(Transactions.collection.name),
    ]);
    if (!receivable) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }

    return NextResponse.json({ receivable });
  } catch (error) {
    console.error("Error fetching receivable:", error);
    return NextResponse.json({ error: "Failed to fetch receivable" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
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
    const { totalAmount, dueDate, isCancelled, note } = await req.json();

    const receivable = await Receivable.findById(id);
    if (!receivable) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };

    if (totalAmount != null && parseFloat(totalAmount) !== receivable.totalAmount) {
      receivable.log.push({
        action: "Amount Revised",
        previousValue: String(receivable.totalAmount),
        newValue: String(parseFloat(totalAmount)),
        note,
        performedBy,
        performedAt: new Date(),
      });
      receivable.totalAmount = parseFloat(totalAmount);
    }

    if (dueDate !== undefined) {
      const newDue = dueDate ? new Date(dueDate) : null;
      const prevDue = receivable.dueDate ? receivable.dueDate.toISOString() : null;
      const nextDue = newDue ? newDue.toISOString() : null;
      if (prevDue !== nextDue) {
        receivable.log.push({
          action: "Due Date Changed",
          previousValue: prevDue || "none",
          newValue: nextDue || "none",
          note,
          performedBy,
          performedAt: new Date(),
        });
        receivable.dueDate = newDue;
      }
    }

    if (isCancelled === true && !receivable.isCancelled) {
      const settlingBorrowing = await Borrowing.findOne({
        settlesReceivableId: receivable._id,
        isCancelled: { $ne: true },
      });
      if (settlingBorrowing) {
        return NextResponse.json(
          {
            error:
              `An open borrowing (₹${settlingBorrowing.amount.toLocaleString("en-IN")} from ` +
              `${settlingBorrowing.party?.label || "a party"}) is settling this receivable. Unsettle it first.`,
          },
          { status: 409 },
        );
      }

      receivable.isCancelled = true;
      receivable.log.push({
        action: "Cancelled",
        previousValue: "false",
        newValue: "true",
        note,
        performedBy,
        performedAt: new Date(),
      });
    } else if (isCancelled === false && receivable.isCancelled) {
      receivable.isCancelled = false;
      receivable.log.push({
        action: "Cancelled",
        previousValue: "true",
        newValue: "false",
        note: note || "Reinstated",
        performedBy,
        performedAt: new Date(),
      });
    }

    if (note && totalAmount == null && dueDate === undefined && isCancelled === undefined) {
      receivable.log.push({
        action: "Note Added",
        note,
        performedBy,
        performedAt: new Date(),
      });
    }

    await receivable.save();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Receivable updated", receivable });
  } catch (error) {
    console.error("Error updating receivable:", error);
    return NextResponse.json({ error: "Failed to update receivable" }, { status: 500 });
  }
}

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
      return NextResponse.json({ error: "Invalid receivable ID" }, { status: 400 });
    }

    const receivable = await Receivable.findById(id);
    if (!receivable) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }

    const linked = await Transactions.countDocuments({ receivableId: receivable._id });
    if (linked > 0) {
      return NextResponse.json(
        {
          error:
            `${linked} transaction(s) have already been received against this receivable. ` +
            `Delete or re-link those first, or cancel this receivable instead — deleting it now ` +
            `would leave those receipts pointing at nothing.`,
        },
        { status: 409 },
      );
    }

    const { default: Advance } = await import("@/models/Advance");
    const linkedAdvances = await Advance.countDocuments({ receivableId: receivable._id });
    if (linkedAdvances > 0) {
      return NextResponse.json(
        {
          error:
            `${linkedAdvances} advance row(s) are recorded against this receivable. ` +
            `Cancel those first (see /admin/financing), or cancel this receivable instead of ` +
            `deleting it — deleting it now would leave those rows pointing at nothing.`,
        },
        { status: 409 },
      );
    }

    await DeleteLog.create({
      entityType: "Receivable",
      entityId: String(receivable._id),
      entityName: receivable.payer?.label || "Receivable",
      entityDetails: {
        purpose: receivable.purpose,
        totalAmount: receivable.totalAmount,
        branch: receivable.branch,
        payerKind: receivable.payer?.kind,
        remarks: receivable.remarks,
        createdBy: receivable.createdBy?.name,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: receivable.branch,
    });

    await receivable.deleteOne();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Receivable deleted" });
  } catch (error) {
    console.error("Error deleting receivable:", error);
    return NextResponse.json({ error: "Failed to delete receivable" }, { status: 500 });
  }
}
