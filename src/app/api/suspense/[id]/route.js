import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import SuspenseEntry from "@/models/SuspenseEntry";
import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid suspense entry id" }, { status: 400 });
    }

    const entry = await SuspenseEntry.findById(id);
    if (!entry) return NextResponse.json({ error: "Suspense entry not found" }, { status: 404 });

    const { account, direction, amount, date, branch, reference, remarks, receipts } =
      await req.json();

    if (account !== undefined && !accountsSync().includes(account)) {
      return NextResponse.json(
        { error: `account must be one of: ${accountsSync().join(", ")}` },
        { status: 400 },
      );
    }
    if (direction !== undefined && !["IN", "OUT"].includes(direction)) {
      return NextResponse.json({ error: "direction must be IN or OUT" }, { status: 400 });
    }
    if (branch !== undefined && branch && !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json(
        { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` },
        { status: 400 },
      );
    }
    const parsedAmount = amount === undefined ? entry.amount : parseFloat(amount);
    if (!(parsedAmount > 0)) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };
    const changes = [];
    const track = (field, next, label) => {
      if (next === undefined) return;
      const prev = entry[field];
      const same = field === "date"
        ? new Date(prev).getTime() === new Date(next).getTime()
        : (prev ?? "") === (next ?? "");
      if (same) return;
      changes.push(`${label}: ${prev ?? "(blank)"} → ${next ?? "(blank)"}`);
      entry[field] = next;
    };

    if (parsedAmount !== entry.amount) {
      entry.log.push({
        action: "Amount Revised",
        previousValue: String(entry.amount),
        newValue: String(parsedAmount),
        performedBy,
        performedAt: new Date(),
      });
      entry.amount = parsedAmount;
    }
    track("account", account, "Account");
    track("direction", direction, "Direction");
    track("date", date ? new Date(date) : undefined, "Date");
    track("branch", branch === "" ? null : branch, "Branch");
    track("reference", reference, "Reference");
    track("remarks", remarks, "Remarks");
    if (receipts !== undefined && Array.isArray(receipts)) entry.receipts = receipts;

    if (changes.length) {
      entry.log.push({
        action: "Note Added",
        note: `Edited — ${changes.join("; ")}`,
        performedBy,
        performedAt: new Date(),
      });
    }

    await entry.save();
    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Suspense entry updated", entry });
  } catch (error) {
    if (error?.name === "ValidationError" || error?.message?.includes("Suspense")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error editing suspense entry:", error);
    return NextResponse.json({ error: "Failed to edit suspense entry" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid suspense entry id" }, { status: 400 });
    }

    const entry = await SuspenseEntry.findById(id).lean();
    if (!entry) return NextResponse.json({ error: "Suspense entry not found" }, { status: 404 });

    await SuspenseEntry.deleteOne({ _id: id });

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({
      message: "Suspense entry deleted",
      deleted: {
        _id: entry._id,
        account: entry.account,
        amount: entry.amount,
        direction: entry.direction,
        wasCountingTowardBalance: !entry.isResolved && !entry.isCancelled,
      },
    });
  } catch (error) {
    console.error("Error deleting suspense entry:", error);
    return NextResponse.json({ error: "Failed to delete suspense entry" }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid suspense entry id" }, { status: 400 });
    }

    const { action, transactionId, amount, note } = await req.json();
    const entry = await SuspenseEntry.findById(id);
    if (!entry) return NextResponse.json({ error: "Suspense entry not found" }, { status: 404 });

    const performedBy = { name: session.user.name, email: session.user.email };

    if (action === "resolve") {
      if (entry.isResolved) {
        return NextResponse.json({ error: "This entry is already resolved" }, { status: 400 });
      }
      if (!transactionId || !mongoose.Types.ObjectId.isValid(transactionId)) {
        return NextResponse.json(
          { error: "Resolving requires the id of the transaction that explains this money" },
          { status: 400 },
        );
      }
      const txn = await Transactions.findById(transactionId).select("amount date").lean();
      if (!txn) {
        return NextResponse.json(
          { error: "That transaction does not exist — create the real entry first, then resolve." },
          { status: 400 },
        );
      }

      entry.isResolved = true;
      entry.resolvedTransactionId = txn._id;
      entry.resolvedAt = new Date();
      entry.resolvedBy = performedBy;
      entry.log.push({
        action: "Resolved",
        newValue: String(txn._id),
        note:
          note ||
          (Math.abs((txn.amount || 0) - entry.amount) > 0.01
            ? `Linked to a transaction of ₹${txn.amount} against a suspense amount of ₹${entry.amount} — amounts differ`
            : "Source identified"),
        performedBy,
        performedAt: new Date(),
      });
      await entry.save();
      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Suspense entry resolved", entry });
    }

    if (action === "reopen") {
      if (!entry.isResolved) {
        return NextResponse.json({ error: "This entry is not resolved" }, { status: 400 });
      }
      entry.isResolved = false;
      entry.resolvedTransactionId = null;
      entry.resolvedAt = null;
      entry.resolvedBy = undefined;
      entry.log.push({
        action: "Reopened",
        note: note || "Resolution reversed — source is unknown again",
        performedBy,
        performedAt: new Date(),
      });
      await entry.save();
      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Suspense entry reopened", entry });
    }

    if (action === "cancel") {
      entry.isCancelled = true;
      entry.log.push({
        action: "Cancelled",
        previousValue: "false",
        newValue: "true",
        note: note || "Raised in error",
        performedBy,
        performedAt: new Date(),
      });
      await entry.save();
      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Suspense entry cancelled", entry });
    }

    if (action === "revise") {
      const parsed = parseFloat(amount);
      if (!(parsed > 0)) {
        return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
      }
      entry.log.push({
        action: "Amount Revised",
        previousValue: String(entry.amount),
        newValue: String(parsed),
        note,
        performedBy,
        performedAt: new Date(),
      });
      entry.amount = parsed;
      await entry.save();
      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Suspense entry updated", entry });
    }

    if (action === "note") {
      if (!note) return NextResponse.json({ error: "A note is required" }, { status: 400 });
      entry.log.push({ action: "Note Added", note, performedBy, performedAt: new Date() });
      await entry.save();
      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Note added", entry });
    }

    return NextResponse.json(
      { error: "action must be one of: resolve, reopen, cancel, revise, note" },
      { status: 400 },
    );
  } catch (error) {
    if (error?.name === "ValidationError" || error?.message?.includes("suspense")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error updating suspense entry:", error);
    return NextResponse.json({ error: "Failed to update suspense entry" }, { status: 500 });
  }
}
