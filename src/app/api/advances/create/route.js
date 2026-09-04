import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Advance, { ADVANCE_PARTY_KINDS } from "@/models/Advance";
import Receivable from "@/models/Receivable";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { ADVANCE_TYPES, ADVANCE_REVENUE_CATEGORY } from "@/constants/advanceTypes";
import { checkPeriodLock } from "@/lib/periodLock";

const ALLOWED_ROLES = ["admin", "super-admin"];
const REFID_REQUIRED_KINDS = ["EMPLOYEE", "VENDOR", "PATIENT"];

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
      receivableId,
      subType,
      branch,
      date,
      dueDate,
      reference,
      remarks,
      receipts,
      allowOverRecovery,
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
    if (!party?.kind || !ADVANCE_PARTY_KINDS.includes(party.kind)) {
      return NextResponse.json(
        { error: `party.kind must be one of: ${ADVANCE_PARTY_KINDS.join(", ")}` },
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

    const advanceDate = date ? new Date(date) : new Date();
    const lockReason = await checkPeriodLock({ furtherMode: account, date: advanceDate });
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
      date: advanceDate,
      party: partyDoc,
      branch: branch || null,
      reference: reference || "",
      remarks: remarks || "",
      receipts: Array.isArray(receipts) ? receipts : [],
      createdBy,
    };

    if (direction === "IN") {
      if (!receivableId || !mongoose.Types.ObjectId.isValid(receivableId)) {
        return NextResponse.json({ error: "A valid receivableId is required for a recovery" }, { status: 400 });
      }
      const receivable = await Receivable.findById(receivableId);
      if (!receivable) {
        return NextResponse.json({ error: "Advance (receivable) not found" }, { status: 404 });
      }
      if (receivable.isCancelled) {
        return NextResponse.json({ error: "This advance has been cancelled" }, { status: 400 });
      }
      const hasAdvanceOut = await Advance.exists({
        receivableId: receivable._id,
        direction: "OUT",
        isCancelled: { $ne: true },
      });
      if (!hasAdvanceOut) {
        return NextResponse.json(
          { error: "This receivable was not created as an advance — cannot record a recovery against it here" },
          { status: 400 },
        );
      }

      const [recoveredAgg] = await Advance.aggregate([
        { $match: { receivableId: receivable._id, direction: "IN", isCancelled: { $ne: true } } },
        { $group: { _id: null, recovered: { $sum: "$amount" } } },
      ]);
      // Amounts already applied to a payable are a non-cash recovery of this advance and
      // reduce what's still owed back, exactly like a cash recovery.
      const [settledAgg] = await Advance.aggregate([
        {
          $match: {
            receivableId: receivable._id,
            direction: "OUT",
            isCancelled: { $ne: true },
            settlesPayableId: { $ne: null },
          },
        },
        { $group: { _id: null, settled: { $sum: { $ifNull: ["$settlesPayableAmount", "$amount"] } } } },
      ]);
      const alreadyRecovered = (recoveredAgg?.recovered || 0) + (settledAgg?.settled || 0);
      const pending = Math.max(0, Math.round((receivable.totalAmount - alreadyRecovered) * 100) / 100);
      if (parsedAmount > pending && !allowOverRecovery) {
        return NextResponse.json(
          {
            error: `Recovering ₹${parsedAmount.toLocaleString("en-IN")} would exceed the outstanding balance of ₹${pending.toLocaleString("en-IN")}. Pass allowOverRecovery to record it anyway.`,
            pending,
          },
          { status: 400 },
        );
      }

      const advance = new Advance({ ...baseFields, receivableId: receivable._id });
      advance.log.push({
        action: "Created",
        newValue: String(parsedAmount),
        note: `Recovery — ${account}`,
        performedBy,
        performedAt: new Date(),
      });
      await advance.save();

      return NextResponse.json({ message: "Recovery recorded", advance, receivable }, { status: 201 });
    }

    if (receivableId) {
      if (!mongoose.Types.ObjectId.isValid(receivableId)) {
        return NextResponse.json({ error: "Invalid receivableId" }, { status: 400 });
      }
      const dbSession = await mongoose.startSession();
      let advance;
      let receivable;
      try {
        await dbSession.withTransaction(async () => {
          receivable = await Receivable.findById(receivableId).session(dbSession);
          if (!receivable) throw new Error("__NOT_FOUND__");
          if (receivable.isCancelled) throw new Error("__CANCELLED__");
          const hasAdvanceOut = await Advance.exists({
            receivableId: receivable._id,
            direction: "OUT",
            isCancelled: { $ne: true },
          }).session(dbSession);
          if (!hasAdvanceOut) throw new Error("__NOT_AN_ADVANCE__");

          const previousTotal = receivable.totalAmount;
          receivable.totalAmount = Math.round((previousTotal + parsedAmount) * 100) / 100;
          receivable.log.push({
            action: "Amount Revised",
            previousValue: String(previousTotal),
            newValue: String(receivable.totalAmount),
            note: `Further advance paid out — ${account}`,
            performedBy,
            performedAt: new Date(),
          });
          await receivable.save({ session: dbSession });

          const doc = new Advance({ ...baseFields, receivableId: receivable._id });
          doc.log.push({
            action: "Created",
            newValue: String(parsedAmount),
            note: `Further advance — ${account}`,
            performedBy,
            performedAt: new Date(),
          });
          await doc.save({ session: dbSession });
          advance = doc;
        });
      } catch (err) {
        if (err.message === "__NOT_FOUND__") {
          return NextResponse.json({ error: "Advance (receivable) not found" }, { status: 404 });
        }
        if (err.message === "__CANCELLED__") {
          return NextResponse.json({ error: "This advance has been cancelled" }, { status: 400 });
        }
        if (err.message === "__NOT_AN_ADVANCE__") {
          return NextResponse.json(
            { error: "This receivable was not created as an advance — cannot add to it here" },
            { status: 400 },
          );
        }
        throw err;
      } finally {
        await dbSession.endSession();
      }

      return NextResponse.json({ message: "Further advance recorded", advance, receivable }, { status: 201 });
    }

    if (!subType || !ADVANCE_TYPES.includes(subType)) {
      return NextResponse.json(
        { error: `subType must be one of: ${ADVANCE_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const dbSession = await mongoose.startSession();
    let advance;
    let receivable;
    try {
      await dbSession.withTransaction(async () => {
        const newReceivable = new Receivable({
          payer: partyDoc,
          purpose: "ADVANCE_RECOVERY",
          revenueCategory: ADVANCE_REVENUE_CATEGORY,
          revenueSubType: subType,
          totalAmount: parsedAmount,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          branch: branch || session.user.branch,
          costAlreadyRecognised: false,
          excludeFromPnl: true,
          remarks: remarks || "",
          createdBy,
        });
        newReceivable.log.push({
          action: "Created",
          newValue: String(parsedAmount),
          note: `Advance paid out — ${subType} to ${partyDoc.label}`,
          performedBy,
          performedAt: new Date(),
        });
        await newReceivable.save({ session: dbSession });

        const doc = new Advance({ ...baseFields, receivableId: newReceivable._id });
        doc.log.push({
          action: "Created",
          newValue: String(parsedAmount),
          note: `New advance — ${account}`,
          performedBy,
          performedAt: new Date(),
        });
        await doc.save({ session: dbSession });

        receivable = newReceivable;
        advance = doc;
      });
    } finally {
      await dbSession.endSession();
    }

    return NextResponse.json({ message: "Advance created", advance, receivable }, { status: 201 });
  } catch (error) {
    if (error?.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating advance:", error);
    return NextResponse.json({ error: "Failed to create advance" }, { status: 500 });
  }
}
