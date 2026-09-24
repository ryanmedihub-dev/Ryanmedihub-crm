import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import {
  withExternalPartyLink,
  withDbTransaction,
  createExternalReceivable,
  validateExternalParty,
} from "@/lib/externalPartyDerivation";
import { resolveReceivableAllocations } from "@/lib/receivableAllocation";
import { backDateGuard } from "@/lib/backDateGuard";
import { cacheInvalidate } from "@/lib/cache";
import { ALL_BRANCHES } from "@/lib/branches";
import { nonCashMethodsSync } from "@/lib/masterData";

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

    const services = body.services || [
      {
        procedure: body.procedure,
        quantity: body.quantity,
        perSessionCost: body.perSessionCost,
      },
    ];

    const backDateError = backDateGuard(session.user.role, date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    if (!services || services.length === 0) {
      return NextResponse.json(
        { error: "At least one service is required" },
        { status: 400 }
      );
    }

    if (!patientId && (!patientName || !patientPhone)) {
      return NextResponse.json(
        { error: "Either select a patient or provide walk-in details" },
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

    for (const item of services) {
      if (!item.procedure || !item.quantity || !item.perSessionCost) {
        return NextResponse.json(
          { error: "Missing required fields in service items" },
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

    const subtotal = services.reduce(
      (sum, item) => sum + item.quantity * parseFloat(item.perSessionCost),
      0
    );
    const totalDiscount = discount || 0;
    const finalTotal = subtotal - totalDiscount;
    const resolvedBranch = branch || session.user.branch;
    if (!resolvedBranch || !ALL_BRANCHES.includes(resolvedBranch)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!furtherMode && !nonCashMethodsSync().includes(method)) {
      return NextResponse.json(
        { error: "Account (received-in account) is required" },
        { status: 400 }
      );
    }

    const createdBy = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    };

    const computeItemFinalAmount = (item) => {
      const itemSubtotal = item.quantity * parseFloat(item.perSessionCost);
      const itemDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * totalDiscount : 0;
      return { itemDiscount, itemFinalAmount: itemSubtotal - itemDiscount };
    };

    const buildTxnDocs = (allocationsByIndex) =>
      services.map((item, idx) => {
        const { itemDiscount, itemFinalAmount } = computeItemFinalAmount(item);
        const alloc = allocationsByIndex?.[idx];

        return {
          transactionCategory: "SERVICE",
          costType: "Revenue",
          batchId,
          patient: patientId || null,
          patientName: patientName || "",
          patientPhone: patientPhone || "",
          procedure: item.procedure,
          quantity: item.quantity,
          perSessionCost: parseFloat(item.perSessionCost),
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
          transactionCategory: "SERVICE",
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
          const itemAmounts = services.map((item) => computeItemFinalAmount(item).itemFinalAmount);
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

    let updatedPatient = null;

    if (patientId) {
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

        const newIds = savedTransactions.map((t) => t._id);
        patient.payments.transactions.push(...newIds);

        patient.payments.amountReceived += finalTotal;

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

        updatedPatient = {
          _id: patient._id,
          payments: patient.payments,
        };
      }
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      {
        message: `${savedTransactions.length} service transaction(s) created successfully`,
        transactions: savedTransactions,
        batchId,
        summary: {
          totalItems: services.length,
          subtotal,
          discount: totalDiscount,
          finalTotal,
        },
        updatedPatient,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating service transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}