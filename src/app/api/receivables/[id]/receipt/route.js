import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import { REVENUE_METHODS } from "@/constants/paymentMethods";
import { getBankRoutingDefaults } from "@/lib/masterData/lists";
import { unsettledMethodsSync, nonCashMethodsSync } from "@/lib/masterData";

const ALLOWED_ROLES = ["admin", "super-admin"];

const ALLOWED_METHODS = REVENUE_METHODS.map((m) => m.value);

const CATEGORY_BY_REVENUE_CATEGORY = {
  transplant: "TRANSPLANT",
  service: "SERVICE",
  services: "SERVICE",
  medicine: "MEDICINE",
};

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
      date,
      method,
      paymentId,
      remarks,
      receipts,
      allowOverpayment,
      receiptMode: receiptModeInput,
      furtherMode: furtherModeInput,
      branch: branchInput,
      externalParty,
    } = await req.json();

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json({ error: "A receipt amount greater than zero is required" }, { status: 400 });
    }
    if (
      furtherModeInput !== undefined &&
      !furtherModeInput &&
      !nonCashMethodsSync().includes(method)
    ) {
      return NextResponse.json(
        { error: "furtherMode is required — name the account this money landed in" },
        { status: 400 },
      );
    }
    if (!method || !ALLOWED_METHODS.includes(method)) {
      return NextResponse.json(
        { error: `method must be one of: ${ALLOWED_METHODS.join(", ")}` },
        { status: 400 },
      );
    }

    const receivable = await Receivable.findById(id);
    if (!receivable) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }
    if (receivable.isCancelled) {
      return NextResponse.json({ error: "This receivable has been cancelled" }, { status: 400 });
    }

    const [receivedAgg] = await Transactions.aggregate([
      {
        $match: {
          receivableId: receivable._id,
          costType: "Revenue",
          approvalStatus: "APPROVED",
          method: { $nin: unsettledMethodsSync() },
        },
      },
      { $group: { _id: null, received: { $sum: "$amount" } } },
    ]);
    const received = receivedAgg?.received || 0;
    const remaining = receivable.totalAmount - received;

    if (parsedAmount > remaining && !allowOverpayment) {
      return NextResponse.json(
        {
          error: `Receipt (₹${parsedAmount}) exceeds the outstanding balance (₹${remaining}) on this receivable. Pass allowOverpayment to record it anyway.`,
        },
        { status: 400 },
      );
    }

    const branch = branchInput || receivable.branch || session.user.branch;
    const transactionCategory =
      CATEGORY_BY_REVENUE_CATEGORY[String(receivable.revenueCategory || "").toLowerCase()] ||
      undefined;

    const routing = transactionCategory
      ? await getBankRoutingDefaults(branch, transactionCategory, method)
      : { receiptMode: "", furtherMode: "" };

    const patient =
      receivable.relatedPatient ||
      (receivable.payer?.kind === "PATIENT" ? receivable.payer.refId : null);

    const transaction = await Transactions.create({
      transactionCategory,
      costType: "Revenue",
      patient: patient || undefined,
      amount: parsedAmount,
      method,
      paymentId: paymentId || "",
      branch,
      date: date ? new Date(date) : new Date(),
      remarks: remarks || `Receipt against receivable — ${receivable.payer?.label || ""}`.trim(),
      receiptMode: receiptModeInput ?? routing.receiptMode ?? "",
      furtherMode: furtherModeInput ?? routing.furtherMode ?? "",
      receipts: receipts || [],
      receivableId: receivable._id,
      isSettlement: receivable.costAlreadyRecognised === true,
      externalParty: externalParty && externalParty.name ? externalParty : undefined,
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
      editors: [],
    });

    return NextResponse.json(
      {
        message: "Receipt recorded",
        transaction,
        receivable: {
          _id: receivable._id,
          totalAmount: receivable.totalAmount,
          received: received + parsedAmount,
          pending: Math.max(receivable.totalAmount - (received + parsedAmount), 0),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error recording receipt:", error);
    return NextResponse.json({ error: "Failed to record receipt" }, { status: 500 });
  }
}
