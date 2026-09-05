import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Vendor from "@/models/Vendor";
import Payable from "@/models/Payable";
import {
  withExternalPartyLink,
  createExternalPayable,
  validateExternalParty,
} from "@/lib/externalPartyDerivation";
import { expenseTypesSync, nonCashMethodsSync } from "@/lib/masterData";
import { backDateGuard } from "@/lib/backDateGuard";

const NO_GIVER_CATEGORIES = [
  "Salary",
  "Incentive",
  "Commision",
  "Patient Related Expenses",
  "Rent",
  "Electricity Bill",
  "Collab Clinic Payment",
];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const {
      expenseCategory,
      expenseType,
      expenseGiver,
      amount,
      method,
      paymentId,
      branch,
      date,
      remarks,
      patientId,
      commissionReceiver,
      payableId,
      allowOverpayment,
      receipts,
      furtherMode,
      receiptMode,
      externalParty,
      taxDetails,
    } = await req.json();

    const backDateError = backDateGuard(session.user.role, date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    if (!expenseCategory || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (payableId && furtherMode !== undefined && !furtherMode && !nonCashMethodsSync().includes(method)) {
      return NextResponse.json(
        { error: "furtherMode is required — name the account this payment left from" },
        { status: 400 },
      );
    }

    const needsGiver = !NO_GIVER_CATEGORIES.includes(expenseCategory);
    if (needsGiver && !expenseGiver) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (expenseTypesSync(expenseCategory).length > 0 && !expenseType) {
      return NextResponse.json(
        { error: "Expense type is required for this category" },
        { status: 400 }
      );
    }

    if (needsGiver) {
      if (!expenseGiver.type) {
        return NextResponse.json({ error: "Invalid expense giver data" }, { status: 400 });
      }
      if (
        (expenseGiver.type === "EMPLOYEE" || expenseGiver.type === "PATIENT") &&
        (!expenseGiver.refId || !expenseGiver.name)
      ) {
        return NextResponse.json(
          { error: "Employee/patient reference and name are required" },
          { status: 400 }
        );
      }
      if (expenseGiver.type === "MANUAL" && !expenseGiver.name) {
        return NextResponse.json({ error: "Payee name is required" }, { status: 400 });
      }
    }

    let vendorDoc = null;

    if (expenseGiver?.type === "VENDOR") {
      if (!expenseGiver.vendorId) {
        return NextResponse.json(
          { error: "Vendor ID required for vendor expenses" },
          { status: 400 }
        );
      }

      vendorDoc = await Vendor.findById(expenseGiver.vendorId);
      if (!vendorDoc) {
        return NextResponse.json(
          { error: "Vendor not found" },
          { status: 404 }
        );
      }
    }

    let payableDoc = null;
    if (payableId) {
      payableDoc = await Payable.findById(payableId);
      if (!payableDoc) {
        return NextResponse.json({ error: "Payable not found" }, { status: 404 });
      }
      if (payableDoc.isCancelled) {
        return NextResponse.json(
          { error: "This payable has been cancelled" },
          { status: 400 }
        );
      }

      // No unsettled-method exclusion — a transaction only reaches here (matched by this
      // exact payableId) via a deliberate "settle this payable" link, so a "Paid by Other"
      // payment counts too (the vendor was paid, just via an external party).
      const [paidAgg] = await Transactions.aggregate([
        {
          $match: {
            payableId: payableDoc._id,
            approvalStatus: "APPROVED",
          },
        },
        { $group: { _id: null, paid: { $sum: "$amount" } } },
      ]);
      const currentPaid = paidAgg?.paid || 0;
      const remaining = payableDoc.totalAmount - currentPaid;

      if (parseFloat(amount) > remaining && !allowOverpayment) {
        return NextResponse.json(
          {
            error: `Payment (₹${amount}) exceeds the remaining balance (₹${remaining}) on this payable. Pass allowOverpayment to record it anyway.`,
          },
          { status: 400 }
        );
      }
    }

    if (method === "paid_by_other") {
      const partyError = validateExternalParty(externalParty, "PAID_BY");
      if (partyError) {
        return NextResponse.json({ error: partyError }, { status: 400 });
      }
    }

    const transactionData = {
      transactionCategory: "EXPENSE",
      costType: "Expenses",
      expense: expenseCategory,
      expenseType: expenseType || "",
      expenseGiver: expenseGiver
        ? {
            type: expenseGiver.type,
            vendorId: expenseGiver.type === "VENDOR" ? expenseGiver.vendorId : null,
            refId:
              expenseGiver.type === "EMPLOYEE" || expenseGiver.type === "PATIENT"
                ? expenseGiver.refId
                : null,
            name: expenseGiver.name,
          }
        : undefined,
      patient: patientId || undefined,
      commissionReceiver:
        expenseCategory === "Commision" && commissionReceiver
          ? {
              type: commissionReceiver.type,
              refId: commissionReceiver.type === "MANUAL" ? undefined : commissionReceiver.refId,
              name: commissionReceiver.name,
            }
          : undefined,
      payableId: payableId || null,
      amount: parseFloat(amount),
      method,
      paymentId: paymentId || "",
      branch: branch || session.user.branch,
      date: date ? new Date(date) : new Date(),
      remarks: remarks || "",
      receipts: receipts || [],
      furtherMode: furtherMode || "",
      receiptMode: receiptMode || "",
      isSettlement: payableDoc ? payableDoc.costAlreadyRecognised === true : false,
      taxDetails: taxDetails || undefined,
      vendor: expenseGiver?.type === "VENDOR" ? expenseGiver.vendorId : null,
      approvalStatus: "APPROVED",
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    };

    const resolvedBranch = branch || session.user.branch;
    let transaction;
    if (method === "paid_by_other") {
      transaction = await withExternalPartyLink(async (dbSession) => {
        const [txn] = await Transactions.create(
          [
            {
              ...transactionData,
              externalParty: {
                direction: "PAID_BY",
                name: externalParty.name,
                method: externalParty.method,
                partyKind: externalParty.partyKind || "MANUAL",
                partyRefId:
                  externalParty.partyKind && externalParty.partyKind !== "MANUAL"
                    ? externalParty.partyRefId
                    : null,
              },
            },
          ],
          { session: dbSession, ordered: true },
        );
        const payable = await createExternalPayable({
          session: dbSession,
          amount: transactionData.amount,
          name: externalParty.name,
          method: externalParty.method,
          partyKind: externalParty.partyKind || "MANUAL",
          partyRefId: externalParty.partyRefId,
          branch: resolvedBranch,
          relatedPatient: patientId || undefined,
          actor: transactionData.createdBy,
          settledPayableLabel: payableDoc?.payee?.label,
        });
        txn.externalParty.linkedPayableId = payable._id;
        await txn.save({ session: dbSession });
        return txn;
      });
    } else {
      transaction = new Transactions(transactionData);
      await transaction.save();
    }

    if (vendorDoc) {
      const previousValue = vendorDoc.Transactions?.toString() || "null";
      vendorDoc.Transactions = transaction._id;
      vendorDoc.editors.push({
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
        updatedFields: [
          { name: "Transactions", previousValue, newValue: transaction._id.toString() },
        ],
      });
      await vendorDoc.save();
    }

    return NextResponse.json(
      {
        message: "Expense transaction created successfully",
        transaction,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating expense transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
