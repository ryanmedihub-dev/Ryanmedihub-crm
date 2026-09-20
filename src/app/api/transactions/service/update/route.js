import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { periodLockResponse } from "@/lib/periodLock";
import { checkCascadeOnUpdate, applyCascadeOnUpdate } from "@/lib/cascadeIntegrity";
import { withDbTransaction, syncExternalPartyOnUpdate } from "@/lib/externalPartyDerivation";
import { backDateGuard } from "@/lib/backDateGuard";
import Transactions from "@/models/Transactions";
import Patient from "@/models/Patient";
import { cacheInvalidate } from "@/lib/cache";

async function recalculatePatientPayments(patient, session) {
  const allTransactions = await Transactions.find({
    _id: { $in: patient.payments.transactions },
    costType: "Revenue",
  });

  patient.payments.amountReceived = allTransactions.reduce(
    (sum, t) => sum + (t.amount || 0),
    0
  );
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

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const {
      transactionId,
      patientId,
      patientName,
      patientPhone,
      procedure,
      quantity,
      perSessionCost,
      discount,
      method,
      paymentId,
      branch,
      date,
      remarks,
      receiptMode,
      furtherMode,
      receipts,
      receivableId,
      externalParty,
      updateLinked,
    } = await req.json();

    const existingTransaction = await Transactions.findById(transactionId);
    if (!existingTransaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const backDateError = backDateGuard(session.user.role, existingTransaction.date, date);
    if (backDateError) {
      return NextResponse.json(backDateError.body, { status: backDateError.status });
    }

    const locked = await periodLockResponse(existingTransaction, { date, furtherMode });
    if (locked) {
      return NextResponse.json(locked.body, { status: locked.status });
    }

    const proposedAmount = (Number(quantity) || 0) * (Number(perSessionCost) || 0) - (Number(discount) || 0);
    const linkedWarning = await checkCascadeOnUpdate(existingTransaction, { amount: proposedAmount });
    if (linkedWarning && !updateLinked) {
      return NextResponse.json(linkedWarning, { status: 409 });
    }

    if (!procedure || !quantity || !perSessionCost) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const oldPatientId = existingTransaction.patient
      ? existingTransaction.patient.toString()
      : null;
    const newPatientId = patientId || null;
    const patientChanged = oldPatientId !== (newPatientId?.toString() || null);

    const subtotal = quantity * parseFloat(perSessionCost);
    const finalAmount = subtotal - (discount || 0);

    const updatedFields = [];
    const trackChange = (fieldName, oldValue, newValue) => {
      if (String(oldValue ?? "") !== String(newValue ?? "")) {
        updatedFields.push({
          name: fieldName,
          previousValue: String(oldValue || ""),
          newValue: String(newValue || ""),
        });
      }
    };

    trackChange("patient", existingTransaction.patient, patientId);
    trackChange("patientName", existingTransaction.patientName, patientName);
    trackChange("patientPhone", existingTransaction.patientPhone, patientPhone);
    trackChange("procedure", existingTransaction.procedure, procedure);
    trackChange("quantity", existingTransaction.quantity, quantity);
    trackChange("perSessionCost", existingTransaction.perSessionCost, perSessionCost);
    trackChange("discount", existingTransaction.discount, discount);
    trackChange("method", existingTransaction.method, method);
    trackChange("paymentId", existingTransaction.paymentId, paymentId);
    trackChange("branch", existingTransaction.branch, branch);
    trackChange("remarks", existingTransaction.remarks, remarks);

    existingTransaction.patient = newPatientId;
    existingTransaction.patientName = patientName || "";
    existingTransaction.patientPhone = patientPhone || "";
    existingTransaction.procedure = procedure;
    existingTransaction.quantity = quantity;
    existingTransaction.perSessionCost = parseFloat(perSessionCost);
    existingTransaction.amount = finalAmount;
    existingTransaction.discount = discount || 0;
    existingTransaction.method = method;
    existingTransaction.paymentId = paymentId || "";
    existingTransaction.branch = branch;
    existingTransaction.date = date ? new Date(date) : existingTransaction.date;
    existingTransaction.remarks = remarks || "";
    if (receiptMode !== undefined) existingTransaction.receiptMode = receiptMode || "";
    if (furtherMode !== undefined) existingTransaction.furtherMode = furtherMode || "";
    if (receipts !== undefined) existingTransaction.receipts = receipts || [];
    if (receivableId !== undefined) existingTransaction.receivableId = receivableId || null;

    if (updatedFields.length > 0) {
      existingTransaction.editors.push({
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
        updatedFields,
      });
    }

    try {
      await withDbTransaction(async (dbSession) => {
        const patch = await syncExternalPartyOnUpdate({
          session: dbSession,
          transaction: existingTransaction,
          nextMethod: existingTransaction.method,
          nextAmount: existingTransaction.amount,
          nextExternalParty: externalParty,
          branch: existingTransaction.branch,
          transactionCategory: "SERVICE",
          relatedPatient: existingTransaction.patient,
          actor: { name: session.user.name, email: session.user.email, branch: session.user.branch },
        });
        if (patch) existingTransaction.set(patch);
        await existingTransaction.save({ session: dbSession });
        if (linkedWarning && updateLinked) {
          await applyCascadeOnUpdate(existingTransaction, { amount: existingTransaction.amount }, dbSession, {
            name: session.user.name,
            email: session.user.email,
          });
        }
      });
    } catch (syncError) {
      return NextResponse.json({ error: syncError.message }, { status: 400 });
    }

    let updatedPatients = {};

    if (patientChanged) {
      if (oldPatientId) {
        const oldPatient = await Patient.findById(oldPatientId);
        if (oldPatient?.payments) {
          oldPatient.payments.transactions = oldPatient.payments.transactions.filter(
            (id) => id.toString() !== transactionId.toString()
          );
          await recalculatePatientPayments(oldPatient, session);
          updatedPatients.oldPatient = {
            _id: oldPatient._id,
            payments: oldPatient.payments,
          };
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
          const alreadyLinked = newPatient.payments.transactions.some(
            (id) => id.toString() === transactionId.toString()
          );
          if (!alreadyLinked) {
            newPatient.payments.transactions.push(transactionId);
          }
          await recalculatePatientPayments(newPatient, session);
          updatedPatients.newPatient = {
            _id: newPatient._id,
            payments: newPatient.payments,
          };
        }
      }
    } else if (newPatientId) {
      const samePatient = await Patient.findById(newPatientId);
      if (samePatient?.payments) {
        await recalculatePatientPayments(samePatient, session);
        updatedPatients.updatedPatient = {
          _id: samePatient._id,
          payments: samePatient.payments,
        };
      }
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      message: "Service transaction updated successfully",
      transaction: existingTransaction,
      updatedPatients,
    });
  } catch (error) {
    console.error("Error updating service transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}