
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { periodLockResponse } from "@/lib/periodLock";
import { backDateGuard } from "@/lib/backDateGuard";
import { checkCascadeOnDelete } from "@/lib/cascadeIntegrity";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
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
    if (category !== "SERVICE") {
      return NextResponse.json(
        { success: false, error: "Not a service transaction" },
        { status: 400 }
      );
    }

    const deletedData = {
      transactionId: transaction._id,
      procedure: transaction.procedure,
      amount: transaction.amount,
      discount: transaction.discount,
      quantity: transaction.quantity,
      batchId: transaction.batchId,
      date: transaction.date,
    };

    await DeleteLog.create({
      entityType: "Transaction",
      entityId: transactionId,
      entityName: transaction.patientName || transaction.procedure || "Service",
      entityDetails: {
        category: "SERVICE",
        procedure: transaction.procedure,
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

    let updatedPatient = null;

    if (transaction.patient) {
      const patient = await Patient.findById(transaction.patient);

      if (patient && patient.payments) {
        patient.payments.transactions = patient.payments.transactions.filter(
          (id) => id.toString() !== transactionId.toString()
        );

        patient.payments.amountReceived = Math.max(
          0,
          patient.payments.amountReceived - (transaction.amount || 0)
        );

        const remainingTransactions = await Transactions.find({
          _id: { $in: patient.payments.transactions },
          costType: "Revenue",
        });
        patient.payments.discount = remainingTransactions.reduce(
          (sum, t) => sum + (t.discount || 0),
          0
        );

        const adjustedTotal = Math.max(
          0,
          patient.payments.totalAmount - patient.payments.discount
        );
        patient.payments.pendingAmount = Math.max(
          0,
          adjustedTotal - patient.payments.amountReceived
        );

        patient.editors = patient.editors || [];
        patient.editors.push({
          name: session.user.name,
          email: session.user.email,
          branch: session.user.branch,
          date: new Date(),
        });

        await patient.save();

        updatedPatient = {
          _id: patient._id,
          payments: patient.payments,
        };
      }
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      success: true,
      message: "Service transaction deleted successfully",
      data: deletedData,
      updatedPatient,
    });
  } catch (error) {
    console.error("Error deleting service transaction:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete service transaction",
      },
      { status: 500 }
    );
  }
}