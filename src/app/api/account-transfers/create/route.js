import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import AccountTransfer from "@/models/AccountTransfer";
import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { getAccountBalance } from "@/lib/accountBalances";
import { checkPeriodLock } from "@/lib/periodLock";
import { cacheInvalidate } from "@/lib/cache";

const TRANSFER_KINDS = ["MANUAL", "LOAN_SETTLEMENT", "LOAN_CANCELLATION"];

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const {
      fromAccount,
      toAccount,
      amount,
      date,
      reference,
      remarks,
      receipts,
      branch,
      sourceTransactionId,
      transferKind,
      reversesTransferId,
      allowOverSettlement,
    } = await req.json();

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: "Both accounts are required" }, { status: 400 });
    }
    if (!accountsSync().includes(fromAccount) || !accountsSync().includes(toAccount)) {
      return NextResponse.json({ error: "Invalid account" }, { status: 400 });
    }
    if (fromAccount === toAccount) {
      return NextResponse.json(
        { error: "A contra entry must move money between two different accounts." },
        { status: 400 },
      );
    }
    const parsedAmount = parseFloat(amount);
    if (!(parsedAmount > 0)) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    if (branch && !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json(
        { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` },
        { status: 400 },
      );
    }

    if (sourceTransactionId && !mongoose.Types.ObjectId.isValid(sourceTransactionId)) {
      return NextResponse.json({ error: "Invalid sourceTransactionId" }, { status: 400 });
    }
    const kind = transferKind && TRANSFER_KINDS.includes(transferKind) ? transferKind : "MANUAL";

    const transferDate = date ? new Date(date) : new Date();
    const fromLock = await checkPeriodLock({ furtherMode: fromAccount, date: transferDate });
    if (fromLock) {
      return NextResponse.json({ error: fromLock, periodLocked: true }, { status: 423 });
    }
    const toLock = await checkPeriodLock({ furtherMode: toAccount, date: transferDate });
    if (toLock) {
      return NextResponse.json({ error: toLock, periodLocked: true }, { status: 423 });
    }

    if (kind === "LOAN_SETTLEMENT" && sourceTransactionId) {
      const sourceTx = await Transactions.findById(sourceTransactionId).lean();
      if (!sourceTx) {
        return NextResponse.json({ error: "Source transaction not found" }, { status: 404 });
      }
      const [alreadyAgg] = await AccountTransfer.aggregate([
        {
          $match: {
            sourceTransactionId: new mongoose.Types.ObjectId(sourceTransactionId),
            transferKind: "LOAN_SETTLEMENT",
            isCancelled: { $ne: true },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const alreadySettled = alreadyAgg?.total || 0;
      const remaining = Math.round(((sourceTx.amount || 0) - alreadySettled) * 100) / 100;
      if (parsedAmount > remaining && !allowOverSettlement) {
        return NextResponse.json(
          {
            error: `Settling ₹${parsedAmount.toLocaleString("en-IN")} would exceed the loan amount. ₹${alreadySettled.toLocaleString("en-IN")} of ₹${(sourceTx.amount || 0).toLocaleString("en-IN")} is already settled; ₹${remaining.toLocaleString("en-IN")} remains. Pass allowOverSettlement to record it anyway.`,
            alreadySettled,
            remaining,
          },
          { status: 400 },
        );
      }
    }

    const transfer = new AccountTransfer({
      fromAccount,
      toAccount,
      amount: parsedAmount,
      branch: branch || null,
      date: transferDate,
      reference: reference || "",
      remarks: remarks || "",
      receipts: Array.isArray(receipts) ? receipts : [],
      sourceTransactionId: sourceTransactionId || null,
      transferKind: kind,
      reversesTransferId: reversesTransferId || null,
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });
    transfer.log.push({
      action: "Created",
      newValue: String(parsedAmount),
      note: `${fromAccount} → ${toAccount}`,
      performedBy: { name: session.user.name, email: session.user.email },
      performedAt: new Date(),
    });

    await transfer.save();

    let warning = null;
    try {
      const balance = await getAccountBalance(fromAccount, transfer.date);
      if (balance < 0) {
        warning = `${fromAccount} is now negative (${balance.toFixed(2)}) as of this date. The entry was saved — check whether an earlier deposit is still missing.`;
      }
    } catch (balanceError) {
      console.error("Contra entry saved but balance check failed:", balanceError);
    }

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Contra entry created", transfer, warning }, { status: 201 });
  } catch (error) {
    if (error?.name === "ValidationError" || error?.message?.includes("contra entry")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating contra entry:", error);
    return NextResponse.json({ error: "Failed to create contra entry" }, { status: 500 });
  }
}
