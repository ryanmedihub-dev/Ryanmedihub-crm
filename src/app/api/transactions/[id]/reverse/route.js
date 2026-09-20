import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import CollabCase from "@/models/CollabCase";
import { checkPeriodLock } from "@/lib/periodLock";
import { withDbTransaction } from "@/lib/externalPartyDerivation";
import { reverseTransaction, ReversalError } from "@/lib/reverseTransaction";
import {
  computeCaseBalance,
  isFullyCollected,
  unwindClinicShareCrystallisation,
} from "@/lib/collabDerivation";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(request, { params }) {
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
    const body = await request.json();
    const { reason, remarks, date, amount } = body;

    const actor = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
    };

    const result = await withDbTransaction(async (dbSession) => {
      const reversalResult = await reverseTransaction({
        transactionId: id,
        amount,
        reason,
        remarks,
        date,
        actor,
        dbSession,
      });

      const caseId = reversalResult.original.collabRef?.caseId;
      const isCrystallisationRow = reversalResult.original.collabRef?.crystallisation === true;
      if (caseId && !isCrystallisationRow) {
        const collabCase = await CollabCase.findById(caseId).session(dbSession);
        if (collabCase?.clinicShareSettledAt) {
          const balance = await computeCaseBalance(caseId, dbSession);
          if (!isFullyCollected(collabCase, balance)) {
            await unwindClinicShareCrystallisation({
              session: dbSession,
              collabCase,
              actor,
              reason: `Collection reversed: ${reason}`,
            });
          }
        }
      }

      return reversalResult;
    });

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      {
        success: true,
        message: result.fullyReversed
          ? "Transaction fully reversed"
          : "Partial reversal recorded — the original remains open for further reversal",
        reversal: result.reversal,
        original: {
          _id: result.original._id,
          amount: result.original.amount,
          isReversed: result.fullyReversed,
        },
        alreadyReversed: result.alreadyReversed,
        remaining: result.remaining,
        patientStatus: result.patientStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ReversalError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    console.error("Error reversing transaction:", error);
    return NextResponse.json({ error: error.message || "Failed to reverse transaction" }, { status: 500 });
  }
}

export async function GET(request, { params }) {
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

    const original = await Transactions.findById(id).lean();
    if (!original) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const reversals = await Transactions.find({ reversalOf: original._id })
      .select("_id amount date reversalReason remarks createdBy")
      .sort({ date: 1 })
      .lean();

    const alreadyReversed = Math.abs(reversals.reduce((s, r) => s + (r.amount || 0), 0));
    const remaining = Math.round(((original.amount || 0) - alreadyReversed) * 100) / 100;

    let blockedReason = null;
    if (original.reversalOf) blockedReason = "This row is itself a reversal. Reverse the original instead.";
    else if ((original.amount || 0) <= 0) blockedReason = "Only a positive-amount transaction can be reversed.";
    else if (remaining <= 0) blockedReason = "This transaction is already fully reversed.";

    const periodLock = await checkPeriodLock(original);

    return NextResponse.json({
      success: true,
      originalAmount: original.amount || 0,
      alreadyReversed,
      remaining,
      isReversed: original.isReversed === true,
      reversals,
      blockedReason,
      originalPeriodLocked: !!periodLock,
      periodLockReason: periodLock || null,
    });
  } catch (error) {
    console.error("Error reading reversal state:", error);
    return NextResponse.json({ error: "Failed to read reversal state" }, { status: 500 });
  }
}
