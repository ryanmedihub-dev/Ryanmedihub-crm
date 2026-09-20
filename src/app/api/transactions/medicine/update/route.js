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
import Stock from "@/models/Stock";
import { cacheInvalidate } from "@/lib/cache";

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
      medicineId,
      quantity,
      perUnitCost,
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

    const proposedAmount = (Number(quantity) || 0) * (Number(perUnitCost) || 0) - (Number(discount) || 0);
    const linkedWarning = await checkCascadeOnUpdate(existingTransaction, { amount: proposedAmount });
    if (linkedWarning && !updateLinked) {
      return NextResponse.json(linkedWarning, { status: 409 });
    }

    if (existingTransaction.transactionCategory !== "MEDICINE") {
      return NextResponse.json(
        { error: "This is not a medicine transaction" },
        { status: 400 }
      );
    }

    if (!medicineId || !quantity || !perUnitCost) {
      return NextResponse.json(
        { error: "Missing required fields" },
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

    const oldMedicineId = (existingTransaction.medicineId || existingTransaction.stock)?.toString();
    const oldQuantity = existingTransaction.quantity;
    const newMedicineId = medicineId.toString();
    const newQuantity = parseInt(quantity);

    const newMedicine = await Stock.findById(newMedicineId);
    if (!newMedicine) {
      return NextResponse.json(
        { error: "Medicine not found" },
        { status: 404 }
      );
    }

    if (oldMedicineId !== newMedicineId) {

      if (oldMedicineId) {
        await Stock.findByIdAndUpdate(oldMedicineId, {
          $inc: { totalQuantity: oldQuantity },
        });
      }

      if (newMedicine.totalQuantity < newQuantity) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${newMedicine.name}. Available: ${newMedicine.totalQuantity}`,
          },
          { status: 400 }
        );
      }

      await Stock.findByIdAndUpdate(newMedicineId, {
        $inc: { totalQuantity: -newQuantity },
      });
    } else if (oldQuantity !== newQuantity) {
      const quantityDifference = newQuantity - oldQuantity;

      if (quantityDifference > 0 && newMedicine.totalQuantity < quantityDifference) {
        return NextResponse.json(
          {
            error: `Insufficient stock for ${newMedicine.name}. Available: ${newMedicine.totalQuantity}, Additional needed: ${quantityDifference}`,
          },
          { status: 400 }
        );
      }

      await Stock.findByIdAndUpdate(newMedicineId, {
        $inc: { totalQuantity: -quantityDifference },
      });
    }

    const subtotal = newQuantity * parseFloat(perUnitCost);
    const finalAmount = subtotal - (discount || 0);

    const updatedFields = [];
    const trackChange = (fieldName, oldValue, newValue) => {
      if (String(oldValue) !== String(newValue)) {
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
    trackChange("medicineId", existingTransaction.medicineId, medicineId);
    trackChange("quantity", existingTransaction.quantity, quantity);
    trackChange("perUnitCost", existingTransaction.perUnitCost, perUnitCost);
    trackChange("discount", existingTransaction.discount, discount);
    trackChange("amount", existingTransaction.amount, finalAmount);
    trackChange("method", existingTransaction.method, method);
    trackChange("paymentId", existingTransaction.paymentId, paymentId);
    trackChange("branch", existingTransaction.branch, branch);
    trackChange("date", existingTransaction.date, date);
    trackChange("remarks", existingTransaction.remarks, remarks);

    existingTransaction.patient = patientId || null;
    existingTransaction.patientName = patientName || "";
    existingTransaction.patientPhone = patientPhone || "";
    existingTransaction.medicineId = medicineId;
    existingTransaction.quantity = newQuantity;
    existingTransaction.perUnitCost = parseFloat(perUnitCost);
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
    existingTransaction.stock = medicineId;

    if (updatedFields.length > 0) {
      const editorInfo = {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
        updatedFields,
      };

      existingTransaction.editors = existingTransaction.editors || [];
      existingTransaction.editors.push(editorInfo);
      existingTransaction.totalEdits = (existingTransaction.totalEdits || 0) + 1;
      existingTransaction.lastEditedBy = editorInfo;
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
          transactionCategory: "MEDICINE",
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

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({
      success: true,
      message: "Medicine sale updated successfully",
      transaction: existingTransaction,
    });
  } catch (error) {
    console.error("Error updating medicine transaction:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update transaction" },
      { status: 500 }
    );
  }
}