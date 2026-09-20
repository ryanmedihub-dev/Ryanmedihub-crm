import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Borrowing, { BORROWING_PARTY_KINDS } from "@/models/Borrowing";
import Payable from "@/models/Payable";
import { ALL_BRANCHES } from "@/lib/branches";
import { accountsSync, expenseTypesSync } from "@/lib/masterData";
import { checkPeriodLock } from "@/lib/periodLock";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];
const borrowingSubtypes = () => expenseTypesSync("Borrowings");
const REFID_REQUIRED_KINDS = ["VENDOR", "EMPLOYEE", "PATIENT"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const {
      direction,
      account,
      amount,
      party,
      payableId,
      subType,
      branch,
      date,
      reference,
      remarks,
      receipts,
      allowOverpayment,
    } = await req.json();

    if (!["IN", "OUT"].includes(direction)) {
      return NextResponse.json({ error: "direction must be IN or OUT" }, { status: 400 });
    }
    if (!accountsSync().includes(account)) {
      return NextResponse.json({ error: `account must be one of: ${accountsSync().join(", ")}` }, { status: 400 });
    }
    const parsedAmount = parseFloat(amount);
    if (!(parsedAmount > 0)) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }
    if (!party?.kind || !BORROWING_PARTY_KINDS.includes(party.kind)) {
      return NextResponse.json(
        { error: `party.kind must be one of: ${BORROWING_PARTY_KINDS.join(", ")}` },
        { status: 400 },
      );
    }
    if (!party?.label?.trim()) {
      return NextResponse.json({ error: "party.label is required" }, { status: 400 });
    }
    if (REFID_REQUIRED_KINDS.includes(party.kind) && !party.refId) {
      return NextResponse.json(
        { error: `party.refId is required when party.kind is "${party.kind}"` },
        { status: 400 },
      );
    }
    if (branch && !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` }, { status: 400 });
    }

    const borrowingDate = date ? new Date(date) : new Date();
    const lockReason = await checkPeriodLock({ furtherMode: account, date: borrowingDate });
    if (lockReason) {
      return NextResponse.json({ error: lockReason, periodLocked: true }, { status: 423 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };
    const createdBy = {
      name: session.user.name,
      email: session.user.email,
      branch: session.user.branch,
      date: new Date(),
    };
    const partyDoc = { kind: party.kind, refId: party.refId || null, label: party.label.trim() };
    const baseFields = {
      direction,
      account,
      amount: parsedAmount,
      date: borrowingDate,
      party: partyDoc,
      branch: branch || null,
      reference: reference || "",
      remarks: remarks || "",
      receipts: Array.isArray(receipts) ? receipts : [],
      createdBy,
    };

    if (direction === "OUT") {
      if (!payableId || !mongoose.Types.ObjectId.isValid(payableId)) {
        return NextResponse.json({ error: "A valid payableId is required for a repayment" }, { status: 400 });
      }
      const payable = await Payable.findById(payableId);
      if (!payable) {
        return NextResponse.json({ error: "Loan (payable) not found" }, { status: 404 });
      }
      if (payable.isCancelled) {
        return NextResponse.json({ error: "This loan has been cancelled" }, { status: 400 });
      }
      const hasBorrowingIn = await Borrowing.exists({
        payableId: payable._id,
        direction: "IN",
        isCancelled: { $ne: true },
      });
      if (!hasBorrowingIn) {
        return NextResponse.json(
          { error: "This payable was not created as a borrowing — cannot record a repayment against it here" },
          { status: 400 },
        );
      }

      const [paidAgg] = await Borrowing.aggregate([
        { $match: { payableId: payable._id, direction: "OUT", isCancelled: { $ne: true } } },
        { $group: { _id: null, paid: { $sum: "$amount" } } },
      ]);
      const alreadyPaid = paidAgg?.paid || 0;
      const pending = Math.max(0, Math.round((payable.totalAmount - alreadyPaid) * 100) / 100);
      if (parsedAmount > pending && !allowOverpayment) {
        return NextResponse.json(
          {
            error: `Repaying ₹${parsedAmount.toLocaleString("en-IN")} would exceed the outstanding balance of ₹${pending.toLocaleString("en-IN")}. Pass allowOverpayment to record it anyway.`,
            pending,
          },
          { status: 400 },
        );
      }

      const borrowing = new Borrowing({ ...baseFields, payableId: payable._id });
      borrowing.log.push({
        action: "Created",
        newValue: String(parsedAmount),
        note: `Repayment — ${account}`,
        performedBy,
        performedAt: new Date(),
      });
      await borrowing.save();

      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Repayment recorded", borrowing, payable }, { status: 201 });
    }

    if (payableId) {
      if (!mongoose.Types.ObjectId.isValid(payableId)) {
        return NextResponse.json({ error: "Invalid payableId" }, { status: 400 });
      }
      const dbSession = await mongoose.startSession();
      let borrowing;
      let payable;
      try {
        await dbSession.withTransaction(async () => {
          payable = await Payable.findById(payableId).session(dbSession);
          if (!payable) throw new Error("__NOT_FOUND__");
          if (payable.isCancelled) throw new Error("__CANCELLED__");
          const hasBorrowingIn = await Borrowing.exists({
            payableId: payable._id,
            direction: "IN",
            isCancelled: { $ne: true },
          }).session(dbSession);
          if (!hasBorrowingIn) throw new Error("__NOT_A_BORROWING__");

          const previousTotal = payable.totalAmount;
          payable.totalAmount = Math.round((previousTotal + parsedAmount) * 100) / 100;
          payable.log.push({
            action: "Amount Revised",
            previousValue: String(previousTotal),
            newValue: String(payable.totalAmount),
            note: `Additional tranche received — ${account}`,
            performedBy,
            performedAt: new Date(),
          });
          await payable.save({ session: dbSession });

          const doc = new Borrowing({ ...baseFields, payableId: payable._id });
          doc.log.push({
            action: "Created",
            newValue: String(parsedAmount),
            note: `Additional tranche — ${account}`,
            performedBy,
            performedAt: new Date(),
          });
          await doc.save({ session: dbSession });
          borrowing = doc;
        });
      } catch (err) {
        if (err.message === "__NOT_FOUND__") {
          return NextResponse.json({ error: "Loan (payable) not found" }, { status: 404 });
        }
        if (err.message === "__CANCELLED__") {
          return NextResponse.json({ error: "This loan has been cancelled" }, { status: 400 });
        }
        if (err.message === "__NOT_A_BORROWING__") {
          return NextResponse.json(
            { error: "This payable was not created as a borrowing — cannot add a tranche to it here" },
            { status: 400 },
          );
        }
        throw err;
      } finally {
        await dbSession.endSession();
      }

      await cacheInvalidate("finance", "owner");
      return NextResponse.json({ message: "Tranche recorded", borrowing, payable }, { status: 201 });
    }

    if (!subType || !borrowingSubtypes().includes(subType)) {
      return NextResponse.json(
        { error: `subType must be one of: ${borrowingSubtypes().join(", ")}` },
        { status: 400 },
      );
    }

    const dbSession = await mongoose.startSession();
    let borrowing;
    let payable;
    try {
      await dbSession.withTransaction(async () => {
        const newPayable = new Payable({
          payee: partyDoc,
          purpose: "OTHER",
          expenseCategory: "Borrowings",
          expenseSubType: subType,
          totalAmount: parsedAmount,
          branch: branch || session.user.branch,
          costAlreadyRecognised: false,
          excludeFromPnl: true,
          remarks: remarks || "",
          createdBy,
        });
        newPayable.log.push({
          action: "Created",
          newValue: String(parsedAmount),
          note: `Borrowing received — ${subType} from ${partyDoc.label}`,
          performedBy,
          performedAt: new Date(),
        });
        await newPayable.save({ session: dbSession });

        const doc = new Borrowing({ ...baseFields, payableId: newPayable._id });
        doc.log.push({
          action: "Created",
          newValue: String(parsedAmount),
          note: `New loan — ${account}`,
          performedBy,
          performedAt: new Date(),
        });
        await doc.save({ session: dbSession });

        payable = newPayable;
        borrowing = doc;
      });
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Borrowing created", borrowing, payable }, { status: 201 });
  } catch (error) {
    if (error?.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating borrowing:", error);
    return NextResponse.json({ error: "Failed to create borrowing" }, { status: 500 });
  }
}
