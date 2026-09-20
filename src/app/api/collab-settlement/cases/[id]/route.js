import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import CollabCase from "@/models/CollabCase";
import CollabSettlement from "@/models/CollabSettlement";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import DeleteLog from "@/models/DeleteLog";
import { reverseTransaction, ReversalError } from "@/lib/reverseTransaction";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    const { packageAmount, clinicShare, isCancelled, note } = await req.json();

    const collabCase = await CollabCase.findById(id);
    if (!collabCase) {
      return NextResponse.json({ error: "Collab case not found" }, { status: 404 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };

    if (packageAmount != null && parseFloat(packageAmount) !== collabCase.packageAmount) {
      collabCase.log.push({
        action: "Package Revised",
        previousValue: String(collabCase.packageAmount),
        newValue: String(parseFloat(packageAmount)),
        note,
        performedBy,
        performedAt: new Date(),
      });
      collabCase.packageAmount = parseFloat(packageAmount);
    }

    if (clinicShare != null && parseFloat(clinicShare) !== collabCase.clinicShare) {
      collabCase.log.push({
        action: "Share Revised",
        previousValue: String(collabCase.clinicShare),
        newValue: String(parseFloat(clinicShare)),
        note,
        performedBy,
        performedAt: new Date(),
      });
      collabCase.clinicShare = parseFloat(clinicShare);
    }

    if (isCancelled === true && collabCase.status !== "CANCELLED") {
      const settledAgainst = await CollabSettlement.countDocuments({
        "coveredCases.case": collabCase._id,
      });
      if (settledAgainst > 0) {
        return NextResponse.json(
          {
            error:
              `${settledAgainst} settlement(s) have already been allocated against this case. ` +
              `Delete those settlements first — cancelling the case now would leave them ` +
              `pointing at nothing.`,
          },
          { status: 409 },
        );
      }

      const reason = note && note.trim() ? note.trim() : "Collab case cancelled";

      const dbSession = await mongoose.startSession();
      let reversedCount = 0;
      try {
        await dbSession.withTransaction(async () => {
          const linkedTx = await Transactions.find({
            "collabRef.caseId": collabCase._id,
            "collabRef.settlementId": { $exists: false },
            reversalOf: { $exists: false },
            isReversed: { $ne: true },
          }).session(dbSession);

          for (const tx of linkedTx) {
            const result = await reverseTransaction({
              transactionId: tx._id,
              reason,
              remarks: `Collab case ${collabCase._id} cancelled`,
              actor: performedBy,
              dbSession,
            });
            reversedCount += 1;

            if (tx.method === "paid_to_external" && tx.costType === "Revenue" && tx.patient) {
              const patient = await Patient.findById(tx.patient).session(dbSession);
              if (patient) {
                patient.payments = patient.payments || {};
                patient.payments.amountReceived = round2(
                  (patient.payments.amountReceived || 0) + result.requested,
                );
                const total = patient.payments.totalAmount || patient.counselling?.finlpackage || 0;
                patient.payments.pendingAmount = Math.max(
                  0,
                  round2(total - patient.payments.amountReceived - (patient.payments.discount || 0)),
                );
                await patient.save({ session: dbSession });
              }
            }
          }

          if (collabCase.clinicSharePayable) {
            const payable = await Payable.findById(collabCase.clinicSharePayable).session(dbSession);
            if (payable && !payable.isCancelled) {
              payable.isCancelled = true;
              payable.log.push({
                action: "Cancelled",
                previousValue: "false",
                newValue: "true",
                note: `Collab case ${collabCase._id} was cancelled`,
                performedBy,
                performedAt: new Date(),
              });
              await payable.save({ session: dbSession });
            }
          }
          if (collabCase.clinicShareReceivable) {
            const receivable = await Receivable.findById(collabCase.clinicShareReceivable).session(
              dbSession,
            );
            if (receivable && !receivable.isCancelled) {
              receivable.isCancelled = true;
              receivable.log.push({
                action: "Cancelled",
                previousValue: "false",
                newValue: "true",
                note: `Collab case ${collabCase._id} was cancelled`,
                performedBy,
                performedAt: new Date(),
              });
              await receivable.save({ session: dbSession });
            }
          }

          collabCase.status = "CANCELLED";
          collabCase.clinicShareSettledAt = null;
          collabCase.log.push({
            action: "Cancelled",
            previousValue: "OPEN",
            newValue: "CANCELLED",
            note: note || `Reversed ${linkedTx.length} linked transaction(s)`,
            performedBy,
            performedAt: new Date(),
          });
          await collabCase.save({ session: dbSession });
        });
      } catch (err) {
        if (err instanceof ReversalError) {
          return NextResponse.json(err.body, { status: err.status });
        }
        throw err;
      } finally {
        await dbSession.endSession();
      }

      await cacheInvalidate("finance", "owner", "patients");
      return NextResponse.json({
        message: "Collab case cancelled",
        reversedTransactions: reversedCount,
        collabCase,
      });
    }

    if (isCancelled === false && collabCase.status === "CANCELLED") {
      collabCase.status = "OPEN";
      collabCase.log.push({
        action: "Note Added",
        note: note || "Reinstated",
        performedBy,
        performedAt: new Date(),
      });
    }

    if (note && packageAmount == null && clinicShare == null && isCancelled === undefined) {
      collabCase.log.push({
        action: "Note Added",
        note,
        performedBy,
        performedAt: new Date(),
      });
    }

    await collabCase.save();

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({ message: "Collab case updated", collabCase });
  } catch (error) {
    console.error("Error updating collab case:", error);
    return NextResponse.json({ error: "Failed to update collab case" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const collabCase = await CollabCase.findById(id);
    if (!collabCase) {
      return NextResponse.json({ error: "Collab case not found" }, { status: 404 });
    }

    const settledAgainst = await CollabSettlement.countDocuments({ "coveredCases.case": collabCase._id });
    if (settledAgainst > 0) {
      return NextResponse.json(
        {
          error:
            `${settledAgainst} settlement(s) have already been allocated against this case. ` +
            `Delete those settlements first — removing the case now would leave them pointing ` +
            `at nothing.`,
        },
        { status: 409 },
      );
    }

    const linkedTx = await Transactions.find({ "collabRef.caseId": collabCase._id })
      .select("transactionCategory costType amount date method receivableId collabRef")
      .lean();

    const ourReceivedTotal = linkedTx.reduce(
      (sum, t) =>
        sum +
        (t.costType === "Revenue" && t.method !== "paid_to_external" && !t.receivableId
          ? t.amount || 0
          : 0),
      0,
    );

    const payableIds = [
      collabCase.clinicSharePayable,
      ...linkedTx.map((t) => t.collabRef?.payableId).filter(Boolean),
    ].filter(Boolean);
    const receivableIds = [collabCase.clinicShareReceivable].filter(Boolean);

    await DeleteLog.create({
      entityType: "CollabSettlement",
      entityId: String(collabCase._id),
      entityName: `Collab case — ${collabCase.clinic}`,
      entityDetails: {
        kind: "CollabCase",
        clinic: collabCase.clinic,
        procedure: collabCase.procedure,
        packageAmount: collabCase.packageAmount,
        clinicShare: collabCase.clinicShare,
        status: collabCase.status,
        patient: String(collabCase.patient || ""),
        clinicCollections: (collabCase.clinicCollections || []).map((c) => ({
          amount: c.amount,
          date: c.date,
          mode: c.mode,
        })),
        deletedTransactions: linkedTx.map((t) => ({
          id: String(t._id),
          category: t.transactionCategory,
          costType: t.costType,
          amount: t.amount,
          date: t.date,
        })),
        deletedPayables: payableIds.map(String),
        deletedReceivables: receivableIds.map(String),
        createdBy: collabCase.createdBy?.name,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: collabCase.clinic,
    });

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        if (linkedTx.length) {
          await Transactions.deleteMany(
            { _id: { $in: linkedTx.map((t) => t._id) } },
            { session: dbSession },
          );
        }
        if (payableIds.length) {
          await Payable.deleteMany({ _id: { $in: payableIds } }, { session: dbSession });
        }
        if (receivableIds.length) {
          await Receivable.deleteMany({ _id: { $in: receivableIds } }, { session: dbSession });
        }
        if (ourReceivedTotal > 0 && collabCase.patient) {
          const patient = await Patient.findById(collabCase.patient).session(dbSession);
          if (patient) {
            patient.payments = patient.payments || {};
            patient.payments.amountReceived = Math.max(
              0,
              Math.round(((patient.payments.amountReceived || 0) - ourReceivedTotal) * 100) / 100,
            );
            patient.payments.transactions = (patient.payments.transactions || []).filter(
              (txId) => !linkedTx.some((t) => String(t._id) === String(txId)),
            );
            const total = patient.payments.totalAmount || patient.counselling?.finlpackage || 0;
            patient.payments.pendingAmount = Math.max(
              0,
              total - patient.payments.amountReceived - (patient.payments.discount || 0),
            );
            await patient.save({ session: dbSession });
          }
        }
        await CollabCase.deleteOne({ _id: collabCase._id }, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      message: "Collab case deleted",
      deletedTransactions: linkedTx.length,
      deletedPayables: payableIds.length,
      deletedReceivables: receivableIds.length,
    });
  } catch (error) {
    console.error("Error deleting collab case:", error);
    return NextResponse.json({ error: "Failed to delete collab case" }, { status: 500 });
  }
}
