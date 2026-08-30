import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import mongoose from "mongoose";
import {
  withExternalPartyLink,
  withDbTransaction,
  createExternalReceivable,
  validateExternalParty,
} from "@/lib/externalPartyDerivation";
import { resolveReceivableAllocations } from "@/lib/receivableAllocation";
import { backDateGuard } from "@/lib/backDateGuard";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name || !session?.user?.email || !session?.user?.branch) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please login." },
        { status: 401 }
      );
    }

    await connectDB();

    const {
      patientId,
      procedure,
      paymentType,
      amount,
      discount,
      method,
      paymentId,
      branch,
      date,
      remarks,
      receiptMode,
      furtherMode,
      receipts,
      receivableAllocationChoice,
      externalParty,
    } = await req.json();

    const backDateError = backDateGuard(session.user.role, date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    if (!patientId || !procedure || !amount || !method) {
      return NextResponse.json(
        { success: false, message: "Patient, procedure, amount, and payment method are required" },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Amount must be positive" },
        { status: 400 }
      );
    }

    const validTransplantProcedures = ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"];
    if (!validTransplantProcedures.includes(procedure)) {
      return NextResponse.json(
        { success: false, message: "Invalid procedure for transplant transaction. Must be one of: Sapphire FUE, DHI, Turkish DHI, or Beard Transplant" },
        { status: 400 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return NextResponse.json(
        { success: false, message: "Invalid patient ID" },
        { status: 400 }
      );
    }

    const patientExists = await Patient.findById(patientId);
    if (!patientExists) {
      return NextResponse.json(
        { success: false, message: "Patient not found" },
        { status: 404 }
      );
    }

    if (method === "paid_to_external") {
      const partyError = validateExternalParty(externalParty, "RECEIVED_BY");
      if (partyError) {
        return NextResponse.json({ success: false, message: partyError }, { status: 400 });
      }
    }

    const resolvedBranch = branch || session.user.branch;
    const createdBy = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    };
    const txnData = {
      transactionCategory: "TRANSPLANT",
      costType: "Revenue",
      patient: patientId,
      procedure,
      paymentType,
      amount: Math.floor(Number(amount)),
      discount: discount || 0,
      method,
      paymentId: paymentId || "",
      branch: resolvedBranch,
      date: date ? new Date(date) : new Date(),
      remarks: remarks || "",
      receiptMode: receiptMode || "",
      furtherMode: furtherMode || "",
      receipts: receipts || [],
      createdBy,
      editors: [],
    };

    let newTransaction;
    if (method === "paid_to_external") {
      newTransaction = await withExternalPartyLink(async (dbSession) => {
        const [txn] = await Transactions.create(
          [
            {
              ...txnData,
              receivableId: null,
              receivableAllocations: [],
              externalParty: {
                direction: "RECEIVED_BY",
                name: externalParty.name,
                method: externalParty.method,
                partyKind: externalParty.partyKind || "MANUAL",
                partyRefId: externalParty.partyKind && externalParty.partyKind !== "MANUAL" ? externalParty.partyRefId : null,
              },
            },
          ],
          { session: dbSession, ordered: true },
        );
        const receivable = await createExternalReceivable({
          session: dbSession,
          amount: txnData.amount,
          name: externalParty.name,
          method: externalParty.method,
          partyKind: externalParty.partyKind || "MANUAL",
          partyRefId: externalParty.partyRefId,
          branch: resolvedBranch,
          transactionCategory: "TRANSPLANT",
          relatedPatient: patientId,
          actor: createdBy,
        });
        txn.externalParty.linkedReceivableId = receivable._id;
        await txn.save({ session: dbSession });
        return txn;
      });
    } else {
      try {
        newTransaction = await withDbTransaction(async (dbSession) => {
          const [{ receivableId: resolvedReceivableId, receivableAllocations }] =
            await resolveReceivableAllocations({
              patientId,
              method,
              itemAmounts: [txnData.amount],
              choice: receivableAllocationChoice,
              session: dbSession,
            });
          const [txn] = await Transactions.create(
            [{ ...txnData, receivableId: resolvedReceivableId, receivableAllocations }],
            { session: dbSession, ordered: true },
          );
          return txn;
        });
      } catch (allocationError) {
        return NextResponse.json(
          { success: false, message: allocationError.message },
          { status: 400 },
        );
      }
    }

    const patient = await Patient.findById(patientId);

    if (patient) {
      patient.payments = patient.payments || {
        amountReceived: 0,
        pendingAmount: 0,
        medicineAmount: 0,
        discount: 0,
        totalAmount: 0,
        transactions: [],
      };

      patient.payments.transactions.push(newTransaction._id);

      patient.payments.amountReceived += parseFloat(amount);

      const allTransactions = await Transactions.find({
        _id: { $in: patient.payments.transactions },
        costType: "Revenue",
      });
      patient.payments.discount = allTransactions.reduce(
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
    }

    return NextResponse.json(
      {
        success: true,
        message: "Transplant transaction created successfully",
        data: newTransaction,
        updatedPatient: patient
          ? {
              _id: patient._id,
              payments: patient.payments,
            }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Transplant transaction creation error:", error);

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