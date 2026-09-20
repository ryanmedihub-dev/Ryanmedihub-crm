import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import CollabCase from "@/models/CollabCase";
import { recordCollabCollectionAtomic, computeCaseBalance } from "@/lib/collabDerivation";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["collab", "admin", "super-admin"];

export async function POST(req, { params }) {
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
    const {
      amount,
      discount,
      date,
      collectedBy = "CLINIC",
      method,
      mode,
      reference,
      receiptMode,
      furtherMode,
      note,
      allowOverpayment,
    } = await req.json();

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Collection amount must be greater than 0" },
        { status: 400 },
      );
    }
    const parsedDiscount = parseFloat(discount) || 0;
    if (parsedDiscount < 0) {
      return NextResponse.json({ error: "Discount cannot be negative" }, { status: 400 });
    }
    if (!["US", "CLINIC"].includes(collectedBy)) {
      return NextResponse.json({ error: 'collectedBy must be "US" or "CLINIC"' }, { status: 400 });
    }

    const collabCase = await CollabCase.findById(id).lean();
    if (!collabCase) {
      return NextResponse.json({ error: "Collab case not found" }, { status: 404 });
    }
    if (collabCase.status === "CANCELLED") {
      return NextResponse.json({ error: "This case has been cancelled" }, { status: 400 });
    }

    const { totalCollected, totalDiscount } = await computeCaseBalance(collabCase._id);
    const remaining = round2(collabCase.packageAmount - totalCollected - totalDiscount);

    if (parsedAmount + parsedDiscount > remaining && !allowOverpayment) {
      return NextResponse.json(
        {
          error: `Collection + discount (₹${parsedAmount + parsedDiscount}) exceeds the patient's remaining outstanding (₹${remaining}). Pass allowOverpayment to record it anyway.`,
        },
        { status: 400 },
      );
    }

    const { collabCase: updated, transaction } = await recordCollabCollectionAtomic({
      caseId: id,
      amount: parsedAmount,
      discount: parsedDiscount,
      date,
      collectedBy,
      method,
      mode,
      reference,
      receiptMode,
      furtherMode,
      note,
      actor: { name: session.user.name, email: session.user.email },
    });

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      message: "Collection recorded",
      collabCase: updated,
      transactionId: transaction?._id || null,
    });
  } catch (error) {
    console.error("Error recording collab collection:", error);
    return NextResponse.json({ error: error.message || "Failed to record collection" }, { status: 500 });
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
