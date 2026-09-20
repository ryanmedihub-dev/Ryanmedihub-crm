import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import connectDB from "@/lib/db";
import { periodLockResponse } from "@/lib/periodLock";
import { checkCascadeOnUpdate, applyCascadeOnUpdate } from "@/lib/cascadeIntegrity";
import { withDbTransaction, syncExternalPartyOnUpdate } from "@/lib/externalPartyDerivation";
import { backDateGuard } from "@/lib/backDateGuard";
import mongoose from "mongoose";
import { cacheInvalidate } from "@/lib/cache";

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name || !session?.user?.email || !session?.user?.branch) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please login." },
        { status: 401 }
      );
    }

    await connectDB();

    const data = await req.json();

    if (!data.transactionId || !mongoose.Types.ObjectId.isValid(data.transactionId)) {
      return NextResponse.json(
        { success: false, message: "Valid transaction ID is required" },
        { status: 400 }
      );
    }

    const existingTransaction = await Transactions.findById(data.transactionId);
    if (!existingTransaction) {
      return NextResponse.json(
        { success: false, message: "Transaction not found" },
        { status: 404 }
      );
    }

    if (existingTransaction.transactionCategory !== "TRANSPLANT") {
      return NextResponse.json(
        { success: false, message: "Not a transplant transaction" },
        { status: 400 }
      );
    }

    const backDateError = backDateGuard(
      session.user.role,
      existingTransaction.date,
      data.date
    );
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    const locked = await periodLockResponse(existingTransaction, {
      date: data.date,
      furtherMode: data.furtherMode,
    });
    if (locked) {
      return NextResponse.json({ ...locked.body, message: locked.body.error }, { status: locked.status });
    }

    const linkedWarning =
      data.amount !== undefined
        ? await checkCascadeOnUpdate(existingTransaction, { amount: data.amount })
        : null;
    if (linkedWarning && !data.updateLinked) {
      return NextResponse.json({ ...linkedWarning, message: linkedWarning.message }, { status: 409 });
    }

    if (data.method !== undefined && !data.method) {
      return NextResponse.json(
        { success: false, message: "Payment method is required" },
        { status: 400 }
      );
    }

    if (data.amount !== undefined && data.amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Amount must be positive" },
        { status: 400 }
      );
    }

    if (data.procedure !== undefined) {
      const validTransplantProcedures = ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"];
      if (!validTransplantProcedures.includes(data.procedure)) {
        return NextResponse.json(
          { success: false, message: "Invalid procedure for transplant transaction" },
          { status: 400 }
        );
      }
    }

    const originalPatientId = existingTransaction.patient?.toString();
    const originalAmount = existingTransaction.amount || 0;
    const originalProcedure = existingTransaction.procedure;
    const originalDiscount = existingTransaction.discount || 0;

    const newPatientId = data.patientId?.toString();
    const newAmount = data.amount !== undefined ? Number(data.amount) : originalAmount;
    const newProcedure = data.procedure || originalProcedure;
    const newDiscount = data.discount !== undefined ? Number(data.discount) : originalDiscount;

    const updatedFields = [];
    const fieldMapping = {
      patientId: { name: "Patient", getValue: (val) => val?.toString() || "" },
      procedure: { name: "Procedure", getValue: (val) => val || "" },
      paymentType: { name: "Payment Type", getValue: (val) => val || "" },
      amount: { name: "Amount", getValue: (val) => val?.toString() || "0" },
      discount: { name: "Discount", getValue: (val) => val?.toString() || "0" },
      method: { name: "Payment Method", getValue: (val) => val || "" },
      paymentId: { name: "Payment ID", getValue: (val) => val || "" },
      date: { name: "Date", getValue: (val) => val ? new Date(val).toISOString() : "" },
      branch: { name: "Branch", getValue: (val) => val || "" },
      remarks: { name: "Remarks", getValue: (val) => val || "" },
    };

    Object.keys(data).forEach((key) => {
      if (key === "transactionId") return;

      if (fieldMapping[key]) {
        const mapping = fieldMapping[key];
        const fieldKey = key === "patientId" ? "patient" : key;
        const previousValue = mapping.getValue(existingTransaction[fieldKey]);
        const newValue = mapping.getValue(data[key]);

        if (previousValue !== newValue) {
          updatedFields.push({
            name: mapping.name,
            previousValue: previousValue,
            newValue: newValue,
          });
        }
      }
    });

    const { transactionId, patientId, ...updateData } = data;

    if (patientId !== undefined) {
      updateData.patient = patientId;
    }

    if (updateData.amount !== undefined) {
      updateData.amount = Number(updateData.amount);
    }
    if (updateData.discount !== undefined) {
      updateData.discount = Number(updateData.discount);
    }

    const editorEntry = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
      updatedFields: updatedFields,
    };

    let updatedTransaction;
    try {
      updatedTransaction = await withDbTransaction(async (dbSession) => {
        const patch = await syncExternalPartyOnUpdate({
          session: dbSession,
          transaction: existingTransaction,
          nextMethod: updateData.method !== undefined ? updateData.method : existingTransaction.method,
          nextAmount: updateData.amount !== undefined ? updateData.amount : existingTransaction.amount,
          nextExternalParty: data.externalParty,
          branch: updateData.branch || existingTransaction.branch,
          transactionCategory: "TRANSPLANT",
          relatedPatient: updateData.patient || existingTransaction.patient,
          actor: { name: session.user.name, email: session.user.email, branch: session.user.branch },
        });

        const saved = await Transactions.findByIdAndUpdate(
          data.transactionId,
          {
            $set: { ...updateData, ...(patch || {}) },
            $push: { editors: editorEntry },
          },
          { new: true, runValidators: true, session: dbSession },
        );

        if (linkedWarning && data.updateLinked) {
          await applyCascadeOnUpdate(existingTransaction, { amount: newAmount }, dbSession, {
            name: session.user.name,
            email: session.user.email,
          });
        }

        return saved;
      });
    } catch (syncError) {
      return NextResponse.json({ success: false, message: syncError.message }, { status: 400 });
    }

    const recalculatePatientPayments = async (patientId) => {
      if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
        return null;
      }

      const patient = await Patient.findById(patientId);
      if (!patient) return null;

      patient.payments = patient.payments || {
        amountReceived: 0,
        pendingAmount: 0,
        medicineAmount: 0,
        discount: 0,
        totalAmount: 0,
        transactions: [],
      };

      const allTransactions = await Transactions.find({
        _id: { $in: patient.payments.transactions },
        costType: "Revenue",
      });

      let totalAmountReceived = 0;
      let totalDiscount = 0;

      allTransactions.forEach((transaction) => {
        const amount = transaction.amount || 0;
        totalAmountReceived += amount;
        totalDiscount += transaction.discount || 0;
      });

      patient.payments.amountReceived = totalAmountReceived;
      patient.payments.discount = totalDiscount;

      const adjustedTotal = Math.max(0, patient.payments.totalAmount - totalDiscount);
      patient.payments.pendingAmount = Math.max(0, adjustedTotal - totalAmountReceived);

      patient.editors = patient.editors || [];
      patient.editors.push(editorEntry);

      return await patient.save();
    };

    const patientChanged = originalPatientId !== newPatientId;
    const dataChanged =
      originalAmount !== newAmount ||
      originalDiscount !== newDiscount;

    if (patientChanged) {
      if (originalPatientId) {
        const originalPatient = await Patient.findById(originalPatientId);
        if (originalPatient?.payments) {
          originalPatient.payments.transactions = originalPatient.payments.transactions.filter(
            (tid) => tid.toString() !== data.transactionId.toString()
          );
          await originalPatient.save();
          await recalculatePatientPayments(originalPatientId);
        }
      }

      if (newPatientId) {
        const newPatient = await Patient.findById(newPatientId);
        if (newPatient) {
          newPatient.payments = newPatient.payments || {
            amountReceived: 0,
            pendingAmount: 0,
            medicineAmount: 0,
            discount: 0,
            totalAmount: 0,
            transactions: [],
          };
          if (!newPatient.payments.transactions.some(tid => tid.toString() === data.transactionId.toString())) {
            newPatient.payments.transactions.push(data.transactionId);
          }
          await newPatient.save();
          await recalculatePatientPayments(newPatientId);
        }
      }
    }
    else if (originalPatientId && dataChanged) {
      await recalculatePatientPayments(originalPatientId);
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      {
        success: true,
        message: "Transplant transaction updated successfully",
        data: updatedTransaction,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating transplant transaction:", error);

    if (error.name === "ValidationError") {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}