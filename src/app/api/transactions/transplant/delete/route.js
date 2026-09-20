
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { periodLockResponse } from "@/lib/periodLock";
import { backDateGuard } from "@/lib/backDateGuard";
import { checkCascadeOnDelete } from "@/lib/cascadeIntegrity";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import Audit from "@/models/Audit";
import DeleteLog from "@/models/DeleteLog";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import { cacheInvalidate } from "@/lib/cache";

export async function DELETE(req) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.name || !session?.user?.email || !session?.user?.branch) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please login." },
        { status: 401 }
      );
    }

    const { transactionId } = await req.json();

    if (!transactionId) {
      return NextResponse.json(
        { success: false, message: "Transaction ID is required" },
        { status: 400 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return NextResponse.json(
        { success: false, message: "Invalid transaction ID format" },
        { status: 400 }
      );
    }

    const transactionToDelete = await Transactions.findById(transactionId);

    if (!transactionToDelete) {
      return NextResponse.json(
        { success: false, message: "Transaction not found" },
        { status: 404 }
      );
    }

    if (transactionToDelete.transactionCategory !== "TRANSPLANT") {
      return NextResponse.json(
        { success: false, message: "Not a transplant transaction" },
        { status: 400 }
      );
    }

    const backDateError = backDateGuard(session.user.role, transactionToDelete.date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    const locked = await periodLockResponse(transactionToDelete);
    if (locked) {
      return NextResponse.json({ ...locked.body, message: locked.body.error }, { status: locked.status });
    }

    const cascade = await checkCascadeOnDelete(transactionToDelete);
    if (cascade.blocked) {
      return NextResponse.json(
        { success: false, error: cascade.reasons.join(" "), message: cascade.reasons.join(" "), cascadeBlocked: true },
        { status: 409 },
      );
    }

    const patientId = transactionToDelete.patient;

    const auditData = new Audit({
      transactionCategory: transactionToDelete.transactionCategory,
      costType: transactionToDelete.costType,
      method: transactionToDelete.method,
      patient: transactionToDelete.patient,
      procedure: transactionToDelete.procedure,
      paymentType: transactionToDelete.paymentType,
      paymentId: transactionToDelete.paymentId,
      branch: transactionToDelete.branch,
      discount: transactionToDelete.discount,
      amount: transactionToDelete.amount,
      date: transactionToDelete.date,
      remarks: transactionToDelete.remarks,
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });

    await auditData.save();

    await DeleteLog.create({
      entityType: "Transaction",
      entityId: transactionId,
      entityName: transactionToDelete.patientName || "Unknown Patient",
      entityDetails: {
        category: transactionToDelete.transactionCategory,
        procedure: transactionToDelete.procedure,
        amount: transactionToDelete.amount,
        method: transactionToDelete.method,
        branch: transactionToDelete.branch,
        date: transactionToDelete.date,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: transactionToDelete.branch,
    });

    const deletedTransaction = await Transactions.findByIdAndDelete(transactionId);

    if (patientId) {
      try {
        const patient = await Patient.findById(patientId);

        if (patient) {
          if (!patient.payments) {
            patient.payments = {
              amountReceived: 0,
              medicineAmount: 0,
              discount: 0,
              totalAmount: 0,
              pendingAmount: 0,
              transactions: [],
            };
          }

          if (patient.payments.transactions) {
            patient.payments.transactions = patient.payments.transactions.filter(
              (transId) => transId.toString() !== transactionId.toString()
            );
          }

          const remainingTransactions = await Transactions.find({
            _id: { $in: patient.payments.transactions },
            costType: "Revenue",
          });

          let totalAmountReceived = 0;
          let totalDiscount = 0;

          remainingTransactions.forEach((transaction) => {
            const amount = transaction.amount || 0;
            const discount = transaction.discount || 0;

            totalAmountReceived += amount;
            totalDiscount += discount;
          });

          patient.payments.amountReceived = totalAmountReceived;
          patient.payments.discount = totalDiscount;

          const totalAmount = patient.payments.totalAmount || 0;
          const adjustedTotal = Math.max(0, totalAmount - totalDiscount);
          patient.payments.pendingAmount = Math.max(
            0,
            adjustedTotal - totalAmountReceived
          );

          patient.editors = patient.editors || [];
          patient.editors.push({
            name: session.user.name,
            email: session.user.email,
            branch: session.user.branch,
            date: new Date(),
          });

          await patient.save();

          console.log(
            `Patient ${patientId} payments updated after transplant transaction deletion`
          );
        } else {
          console.warn(`Patient ${patientId} not found for payment update`);
        }
      } catch (patientUpdateError) {
        console.error(
          "Error updating patient payments after transaction deletion:",
          patientUpdateError
        );
      }
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      {
        success: true,
        message: "Transplant transaction deleted successfully",
        data: {
          deletedTransaction,
          patientUpdated: patientId ? true : false,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting transplant transaction:", error);

    if (error.name === "CastError") {
      return NextResponse.json(
        { success: false, message: "Invalid transaction ID format" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete transplant transaction",
        error: error.message,
      },
      { status: 500 }
    );
  }
}