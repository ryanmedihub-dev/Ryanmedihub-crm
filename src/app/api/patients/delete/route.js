import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions";
import { withDB } from "@/lib/withDB";
import { cacheInvalidate } from "@/lib/cache";

const handler = async () => {
  // ── Authorization ──────────────────────────────────────────────────────────
  const authSession = await getServerSession(authOptions);
  if (!authSession?.user || authSession.user.role !== "super-admin") {
    return NextResponse.json(
      { success: false, error: "Unauthorized. Super-admin access required." },
      { status: 403 }
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const targetDate = new Date("2025-12-31T23:59:59.999Z");
    const targetTime = targetDate.getTime();

    const patients = await Patient.find({
      createdAt: { $lt: targetDate },
    })
      .populate({
        path: "payments.transactions",
        select: "_id date",
        model: "Transactions",
      })
      .session(dbSession);

    const patientsToDelete = [];
    const patientIds = [];
    const transactionIds = [];

    patients.forEach((patient) => {
      const transactions = patient.payments?.transactions ?? [];

      const hasTransactionAfterTarget = transactions.some(
        (tx) => tx?.date && new Date(tx.date).getTime() > targetTime
      );

      if (!hasTransactionAfterTarget) {
        patientsToDelete.push(patient);
        patientIds.push(patient._id);

        transactions.forEach((tx) => {
          if (tx?._id) transactionIds.push(tx._id);
        });
      }
    });

    if (!patientIds.length) {
      await dbSession.abortTransaction();
      return NextResponse.json({
        success: false,
        message: "No patients matched deletion criteria",
      });
    }

    await Employee.updateMany(
      { patient: { $in: patientIds } },
      { $pull: { patient: { $in: patientIds } } },
      { session: dbSession }
    );

    if (transactionIds.length) {
      await Transactions.deleteMany(
        { _id: { $in: transactionIds } },
        { session: dbSession }
      );
    }

    await Patient.deleteMany(
      { _id: { $in: patientIds } },
      { session: dbSession }
    );

    await dbSession.commitTransaction();

    console.log(
      `Super-admin ${authSession.user.email} deleted ${patientIds.length} patients ` +
      `and ${transactionIds.length} transactions (pre-2026 cleanup).`
    );

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      success: true,
      deletedPatients: patientIds.length,
      deletedTransactions: transactionIds.length,
    });
  } catch (error) {
    await dbSession.abortTransaction();
    console.error("DELETE ERROR:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    dbSession.endSession();
  }
};

export const DELETE = withDB(handler);
