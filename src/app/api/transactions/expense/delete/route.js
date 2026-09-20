import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { periodLockResponse } from "@/lib/periodLock";
import { backDateGuard } from "@/lib/backDateGuard";
import { checkCascadeOnDelete } from "@/lib/cascadeIntegrity";
import Transactions from "@/models/Transactions";
import Vendor from "@/models/Vendor";
import DeleteLog from "@/models/DeleteLog";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheInvalidate } from "@/lib/cache";

export async function DELETE(req) {
  let session;
  try {
    session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connectDB();

    const { transactionId } = await req.json();

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    const transaction = await Transactions.findById(transactionId);

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found" },
        { status: 404 }
      );
    }

    const backDateError = backDateGuard(session.user.role, transaction.date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    const locked = await periodLockResponse(transaction);
    if (locked) {
      return NextResponse.json(locked.body, { status: locked.status });
    }

    const cascade = await checkCascadeOnDelete(transaction);
    if (cascade.blocked) {
      return NextResponse.json(
        { success: false, error: cascade.reasons.join(" "), cascadeBlocked: true },
        { status: 409 },
      );
    }

    const category = transaction.transactionCategory || transaction.category;
    if (category !== "EXPENSE") {
      return NextResponse.json(
        { success: false, error: "Not an expense transaction" },
        { status: 400 }
      );
    }

    const deletedData = {
      transactionId: transaction._id,
      expense: transaction.expense || transaction.expenseCategory,
      expenseGiver: transaction.expenseGiver,
      amount: transaction.amount,
      method: transaction.method,
      date: transaction.date,
      branch: transaction.branch,
    };

    if (
      transaction.expenseGiver?.type === "VENDOR" &&
      transaction.expenseGiver?.vendorId
    ) {
      const vendorDoc = await Vendor.findById(
        transaction.expenseGiver.vendorId
      );

      if (vendorDoc) {
        if (
          vendorDoc.Transactions &&
          vendorDoc.Transactions.toString() === transactionId
        ) {
          vendorDoc.Transactions = null;

          vendorDoc.editors.push({
            name: session.user.name,
            email: session.user.email,
            branch: session.user.branch,
            date: new Date(),
            updatedFields: [
              {
                name: "Transactions",
                previousValue: transactionId,
                newValue: "null",
              },
            ],
          });

          await vendorDoc.save();
        }
      }
    }

    if (transaction.vendor) {
      const vendorDoc = await Vendor.findById(transaction.vendor);

      if (vendorDoc) {
        if (
          vendorDoc.Transactions &&
          vendorDoc.Transactions.toString() === transactionId
        ) {
          vendorDoc.Transactions = null;

          vendorDoc.editors.push({
            name: session.user.name,
            email: session.user.email,
            branch: session.user.branch,
            date: new Date(),
            updatedFields: [
              {
                name: "Transactions",
                previousValue: transactionId,
                newValue: "null",
              },
            ],
          });

          await vendorDoc.save();
        }
      }
    }

    await DeleteLog.create({
      entityType: "Transaction",
      entityId: transactionId,
      entityName: transaction.expense || transaction.expenseGiverOld || "Expense",
      entityDetails: {
        category: "EXPENSE",
        expense: transaction.expense,
        amount: transaction.amount,
        method: transaction.method,
        branch: transaction.branch,
        date: transaction.date,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: transaction.branch,
    });

    await Transactions.findByIdAndDelete(transactionId);

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      success: true,
      message: "Expense transaction deleted successfully",
      data: deletedData,
    });
  } catch (error) {
    console.error("Error deleting expense transaction:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete expense transaction",
      },
      { status: 500 }
    );
  }
}