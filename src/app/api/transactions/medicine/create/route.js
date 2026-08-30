import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import Stock from "@/models/Stock";
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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const {
      patientId,
      patientName,
      patientPhone,
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
    } = body;

    const backDateError = backDateGuard(session.user.role, date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    const medicines = body.medicines || [
      {
        medicineId: body.medicineId,
        quantity: body.quantity,
        perUnitCost: body.perUnitCost,
      },
    ];

    if (!medicines || medicines.length === 0) {
      return NextResponse.json(
        { error: "At least one medicine is required" },
        { status: 400 }
      );
    }

    if (!patientId && (!patientName || !patientPhone)) {
      return NextResponse.json(
        { error: "Either select a patient or provide customer details" },
        { status: 400 }
      );
    }

    if (patientId) {
      const patient = await Patient.findById(patientId);
      if (!patient) {
        return NextResponse.json(
          { error: "Patient not found" },
          { status: 404 }
        );
      }
    }

    for (const item of medicines) {
      if (!item.medicineId || !item.quantity || !item.perUnitCost) {
        return NextResponse.json(
          { error: "Missing required fields in medicine items" },
          { status: 400 }
        );
      }

      const medicine = await Stock.findById(item.medicineId);
      if (!medicine) {
        return NextResponse.json(
          { error: `Medicine not found: ${item.medicineId}` },
          { status: 404 }
        );
      }

      if (medicine.totalQuantity < item.quantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${medicine.name}. Available: ${medicine.totalQuantity}`,
          },
          { status: 400 }
        );
      }
    }

    if (method === "paid_to_external") {
      const partyError = validateExternalParty(externalParty, "RECEIVED_BY");
      if (partyError) {
        return NextResponse.json({ error: partyError }, { status: 400 });
      }
    }

    const batchId = `BATCH-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const subtotal = medicines.reduce(
      (sum, item) => sum + item.quantity * parseFloat(item.perUnitCost),
      0
    );
    const totalDiscount = discount || 0;
    const finalTotal = subtotal - totalDiscount;
    const resolvedBranch = branch || session.user.branch;
    const createdBy = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    };

    const computeItemFinalAmount = (item) => {
      const itemSubtotal = item.quantity * parseFloat(item.perUnitCost);
      const itemDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * totalDiscount : 0;
      return { itemDiscount, itemFinalAmount: itemSubtotal - itemDiscount };
    };

    const buildTxnDocs = (allocationsByIndex) =>
      medicines.map((item, idx) => {
        const { itemDiscount, itemFinalAmount } = computeItemFinalAmount(item);
        const alloc = allocationsByIndex?.[idx];

        return {
          transactionCategory: "MEDICINE",
          costType: "Revenue",
          batchId,
          patient: patientId || null,
          patientName: patientName || "",
          patientPhone: patientPhone || "",
          procedure: "Medicine",
          medicineId: item.medicineId,
          quantity: item.quantity,
          perUnitCost: parseFloat(item.perUnitCost),
          amount: itemFinalAmount,
          discount: itemDiscount,
          method,
          paymentId: paymentId || "",
          branch: resolvedBranch,
          date: date ? new Date(date) : new Date(),
          remarks: remarks || "",
          receiptMode: receiptMode || "",
          furtherMode: furtherMode || "",
          receipts: receipts || [],
          receivableId: alloc?.receivableId || null,
          receivableAllocations: alloc?.receivableAllocations || [],
          stock: item.medicineId,
          createdBy,
          ...(method === "paid_to_external"
            ? {
                externalParty: {
                  direction: "RECEIVED_BY",
                  name: externalParty.name,
                  method: externalParty.method,
                  partyKind: externalParty.partyKind || "MANUAL",
                  partyRefId:
                    externalParty.partyKind && externalParty.partyKind !== "MANUAL"
                      ? externalParty.partyRefId
                      : null,
                },
              }
            : {}),
        };
      });

    let savedTransactions;
    if (method === "paid_to_external") {
      savedTransactions = await withExternalPartyLink(async (dbSession) => {
        const txns = await Transactions.create(buildTxnDocs(), { session: dbSession, ordered: true });
        const receivable = await createExternalReceivable({
          session: dbSession,
          amount: finalTotal,
          name: externalParty.name,
          method: externalParty.method,
          partyKind: externalParty.partyKind || "MANUAL",
          partyRefId: externalParty.partyRefId,
          branch: resolvedBranch,
          transactionCategory: "MEDICINE",
          relatedPatient: patientId || undefined,
          actor: createdBy,
        });
        for (const txn of txns) {
          txn.externalParty.linkedReceivableId = receivable._id;
          await txn.save({ session: dbSession });
        }
        return txns;
      });
    } else {
      try {
        savedTransactions = await withDbTransaction(async (dbSession) => {
          const itemAmounts = medicines.map((item) => computeItemFinalAmount(item).itemFinalAmount);
          const allocations = await resolveReceivableAllocations({
            patientId,
            method,
            itemAmounts,
            choice: receivableAllocationChoice,
            session: dbSession,
          });
          return Transactions.create(buildTxnDocs(allocations), { session: dbSession, ordered: true });
        });
      } catch (allocationError) {
        return NextResponse.json({ error: allocationError.message }, { status: 400 });
      }
    }

    for (const item of medicines) {
      await Stock.findByIdAndUpdate(item.medicineId, {
        $inc: { totalQuantity: -item.quantity },
      });
    }

    return NextResponse.json(
      {
        message: `${savedTransactions.length} medicine sale(s) created successfully`,
        transactions: savedTransactions,
        batchId,
        summary: {
          totalItems: medicines.length,
          subtotal,
          discount: totalDiscount,
          finalTotal,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating medicine transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}