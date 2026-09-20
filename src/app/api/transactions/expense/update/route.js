import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/route";
import Transaction from "@/models/Transactions";
import Vendor from "@/models/Vendor";
import connectDB from "@/lib/db";
import { periodLockResponse } from "@/lib/periodLock";
import { checkCascadeOnUpdate, applyCascadeOnUpdate } from "@/lib/cascadeIntegrity";
import { withDbTransaction, syncExternalPartyOnUpdate } from "@/lib/externalPartyDerivation";
import { backDateGuard } from "@/lib/backDateGuard";
import { expenseTypesSync } from "@/lib/masterData";
import { cacheInvalidate } from "@/lib/cache";

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const {
      transactionId,
      expenseCategory,
      expenseType,
      expenseGiver,
      amount,
      method,
      paymentId,
      branch,
      date,
      remarks,
      receipts,
      furtherMode,
    } = body;

    if (!transactionId || !expenseCategory || !expenseGiver || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (expenseTypesSync(expenseCategory).length > 0 && !expenseType) {
      return NextResponse.json(
        { error: "Expense type is required for this category" },
        { status: 400 }
      );
    }

    if (!expenseGiver.type || !expenseGiver.name) {
      return NextResponse.json(
        { error: "Invalid expense giver information" },
        { status: 400 }
      );
    }

    if (expenseGiver.type === "VENDOR" && !expenseGiver.vendorId) {
      return NextResponse.json(
        { error: "Vendor ID is required for vendor expenses" },
        { status: 400 }
      );
    }

    const existingTransaction = await Transaction.findById(transactionId);
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

    if (existingTransaction.transactionCategory !== "EXPENSE") {
      return NextResponse.json(
        { error: "This is not an expense transaction" },
        { status: 400 }
      );
    }

    const linkedWarning = await checkCascadeOnUpdate(existingTransaction, { amount });
    if (linkedWarning && !body.updateLinked) {
      return NextResponse.json(linkedWarning, { status: 409 });
    }

    const updatedFields = [];
    const trackField = (fieldName, oldVal, newVal) => {
      if (String(oldVal) !== String(newVal)) {
        updatedFields.push({
          name: fieldName,
          previousValue: String(oldVal || ""),
          newValue: String(newVal || ""),
        });
      }
    };

    trackField("expenseCategory", existingTransaction.expense, expenseCategory);
    trackField("expenseType", existingTransaction.expenseType, expenseType);
    trackField("expenseGiverType", existingTransaction.expenseGiver?.type, expenseGiver.type);
    trackField("expenseGiverName", existingTransaction.expenseGiver?.name, expenseGiver.name);
    if (expenseGiver.type === "VENDOR") {
      trackField("vendorId", existingTransaction.expenseGiver?.vendorId, expenseGiver.vendorId);
    }
    trackField("amount", existingTransaction.amount, amount);
    trackField("method", existingTransaction.method, method);
    trackField("paymentId", existingTransaction.paymentId, paymentId);
    trackField("branch", existingTransaction.branch, branch);
    trackField("date", existingTransaction.date, date);
    trackField("remarks", existingTransaction.remarks, remarks);
    trackField("furtherMode", existingTransaction.furtherMode, furtherMode);

    const oldVendorId = existingTransaction.expenseGiver?.vendorId || existingTransaction.vendor;
    const newVendorId = expenseGiver.type === "VENDOR" ? expenseGiver.vendorId : null;
    const vendorChanged = String(oldVendorId) !== String(newVendorId);

    if (vendorChanged) {
      if (oldVendorId) {
        const oldVendor = await Vendor.findById(oldVendorId);
        if (oldVendor && oldVendor.Transactions?.toString() === transactionId) {
          oldVendor.Transactions = null;

          oldVendor.editors.push({
            name: session.user.name,
            email: session.user.email,
            branch: session.user.branch,
            date: new Date(),
            updatedFields: [
              {
                name: "Transactions",
                previousValue: transactionId,
                newValue: "null",
              },
            ],
          });

          await oldVendor.save();
        }
      }

      if (newVendorId) {
        const newVendor = await Vendor.findById(newVendorId);
        if (!newVendor) {
          return NextResponse.json(
            { error: "New vendor not found" },
            { status: 404 }
          );
        }

        const previousTransactionId = newVendor.Transactions?.toString() || "null";
        newVendor.Transactions = transactionId;

        newVendor.editors.push({
          name: session.user.name,
          email: session.user.email,
          branch: session.user.branch,
          date: new Date(),
          updatedFields: [
            {
              name: "Transactions",
              previousValue: previousTransactionId,
              newValue: transactionId,
            },
          ],
        });

        await newVendor.save();
      }
    }

    let payableUnlinkedNote = null;
    if (
      existingTransaction.payableId &&
      (existingTransaction.expense !== expenseCategory ||
        (existingTransaction.expenseType || "") !== (expenseType || "") ||
        existingTransaction.branch !== branch)
    ) {
      payableUnlinkedNote =
        "This payment was unlinked from its previous payable — the category, sub-type, or branch changed, so it no longer counts against that payable's pending balance. Use \"Pay against payable\" to re-link it to the correct one if this is still meant to settle a specific payable.";
      existingTransaction.payableId = null;
    }

    existingTransaction.expense = expenseCategory;
    existingTransaction.expenseType = expenseType || "";
    existingTransaction.expenseGiver = {
      type: expenseGiver.type,
      vendorId: expenseGiver.type === "VENDOR" ? expenseGiver.vendorId : null,
      name: expenseGiver.name,
    };
    existingTransaction.amount = amount;
    existingTransaction.method = method;
    existingTransaction.paymentId = paymentId || "";
    existingTransaction.branch = branch;
    existingTransaction.date = date;
    existingTransaction.remarks = remarks || "";
    existingTransaction.furtherMode = furtherMode || "";
    existingTransaction.vendor = expenseGiver.type === "VENDOR" ? expenseGiver.vendorId : null;
    if (receipts !== undefined) existingTransaction.receipts = receipts || [];

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
          nextExternalParty: body.externalParty,
          branch: existingTransaction.branch,
          transactionCategory: "EXPENSE",
          relatedPatient: existingTransaction.patient,
          actor: { name: session.user.name, email: session.user.email, branch: session.user.branch },
        });
        if (patch) existingTransaction.set(patch);
        await existingTransaction.save({ session: dbSession });
        if (linkedWarning && body.updateLinked) {
          await applyCascadeOnUpdate(existingTransaction, { amount }, dbSession, {
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
      message: "Expense transaction updated successfully",
      transaction: existingTransaction,
      ...(payableUnlinkedNote ? { warning: payableUnlinkedNote } : {}),
    });
  } catch (error) {
    console.error("Error updating expense transaction:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update transaction" },
      { status: 500 }
    );
  }
}