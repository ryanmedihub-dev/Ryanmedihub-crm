import { NextResponse } from "next/server";
import mongoose from "mongoose";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions";
import { withDB } from "@/lib/withDB";
import { cacheInvalidate } from "@/lib/cache";

const handler = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();

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
      .session(session);

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
      await session.abortTransaction();
      return NextResponse.json({
        success: false,
        message: "No patients matched deletion criteria",
      });
    }

    await Employee.updateMany(
      { patient: { $in: patientIds } },
      { $pull: { patient: { $in: patientIds } } },
      { session }
    );

    if (transactionIds.length) {
      await Transactions.deleteMany(
        { _id: { $in: transactionIds } },
        { session }
      );
    }

    await Patient.deleteMany(
      { _id: { $in: patientIds } },
      { session }
    );

    await session.commitTransaction();

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      success: true,
      deletedPatients: patientIds.length,
      deletedTransactions: transactionIds.length,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE ERROR:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    session.endSession();
  }
};

export const DELETE = withDB(handler);
