import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import { INCENTIVE_PURPOSES } from "@/constants/incentivePurposes";
import { findOrCreateIncentivePayable, recomputeIncentivePayable, IncentiveError } from "@/lib/incentiveDerivation";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

function samePeriod(a, b) {
  return a.month === b.month && a.year === b.year;
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

    const { id, incentiveId } = await params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(incentiveId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { amount, purpose, remarks, date, note } = await req.json();

    if (purpose !== undefined && !INCENTIVE_PURPOSES.includes(purpose)) {
      return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
    }
    let parsedAmount;
    if (amount !== undefined) {
      parsedAmount = parseFloat(amount);
      if (!parsedAmount || parsedAmount <= 0) {
        return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
      }
    }

    const performedBy = { name: session.user.name, email: session.user.email };
    const actor = { name: session.user.name, email: session.user.email, branch: session.user.branch };

    let updatedRow = null;

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const patient = await Patient.findById(id).session(dbSession);
        if (!patient) throw new IncentiveError(404, { error: "Patient not found" });

        const row = patient.incentives.id(incentiveId);
        if (!row) throw new IncentiveError(404, { error: "Incentive not found" });
        if (row.isCancelled) {
          throw new IncentiveError(400, { error: "This incentive was cancelled — reinstate is not supported, record a new one instead" });
        }

        const oldPayableId = row.payableId;
        const oldPeriod = { month: row.date.getMonth() + 1, year: row.date.getFullYear() };
        const newDate = date ? new Date(date) : row.date;
        const newPeriod = { month: newDate.getMonth() + 1, year: newDate.getFullYear() };
        const monthChanged = date !== undefined && !samePeriod(oldPeriod, newPeriod);
        const amountChanged = parsedAmount !== undefined && parsedAmount !== row.amount;

        if (parsedAmount !== undefined && parsedAmount !== row.amount) {
          row.log.push({
            action: "Amount Revised",
            previousValue: String(row.amount),
            newValue: String(parsedAmount),
            note,
            performedBy,
            performedAt: new Date(),
          });
          row.amount = parsedAmount;
        }
        if (purpose !== undefined && purpose !== row.purpose) {
          row.log.push({
            action: "Note Added",
            note: `Purpose changed from ${row.purpose} to ${purpose}${note ? ` — ${note}` : ""}`,
            performedBy,
            performedAt: new Date(),
          });
          row.purpose = purpose;
        }
        if (remarks !== undefined) row.remarks = remarks;
        if (monthChanged) {
          row.log.push({
            action: "Note Added",
            note: `Date moved to ${newDate.toDateString()} — reassigned to that month's payable${note ? ` — ${note}` : ""}`,
            performedBy,
            performedAt: new Date(),
          });
          row.date = newDate;

          const newPayable = await findOrCreateIncentivePayable({
            session: dbSession,
            employeeId: row.employee,
            employeeLabel: row.employeeName,
            branch: row.branch,
            period: newPeriod,
            relatedPatient: patient._id,
            date: newDate,
            actor,
          });
          row.payableId = newPayable._id;
        } else if (date !== undefined) {
          row.date = newDate;
        }

        await patient.save({ session: dbSession });

        if (monthChanged) {
          await recomputeIncentivePayable({ session: dbSession, payableId: oldPayableId, actor });
          await recomputeIncentivePayable({ session: dbSession, payableId: row.payableId, actor });
        } else if (amountChanged) {
          await recomputeIncentivePayable({ session: dbSession, payableId: row.payableId, actor });
        }

        updatedRow = row;
      });
    } catch (err) {
      if (err instanceof IncentiveError) {
        return NextResponse.json(err.body, { status: err.status });
      }
      throw err;
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({ message: "Incentive updated", incentive: updatedRow });
  } catch (error) {
    console.error("Error updating incentive:", error);
    return NextResponse.json({ error: error.message || "Failed to update incentive" }, { status: 500 });
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

    const { id, incentiveId } = await params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(incentiveId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    let reason = "";
    try {
      const body = await req.json();
      reason = body?.reason || "";
    } catch {
    }

    const performedBy = { name: session.user.name, email: session.user.email };
    const actor = { name: session.user.name, email: session.user.email, branch: session.user.branch };

    let cancelledRow = null;

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const patient = await Patient.findById(id).session(dbSession);
        if (!patient) throw new IncentiveError(404, { error: "Patient not found" });

        const row = patient.incentives.id(incentiveId);
        if (!row) throw new IncentiveError(404, { error: "Incentive not found" });
        if (row.isCancelled) throw new IncentiveError(400, { error: "This incentive is already cancelled" });

        row.isCancelled = true;
        row.log.push({
          action: "Cancelled",
          previousValue: "false",
          newValue: "true",
          note: reason || "Cancelled",
          performedBy,
          performedAt: new Date(),
        });
        await patient.save({ session: dbSession });

        await recomputeIncentivePayable({ session: dbSession, payableId: row.payableId, actor });

        cancelledRow = row;
      });
    } catch (err) {
      if (err instanceof IncentiveError) {
        return NextResponse.json(err.body, { status: err.status });
      }
      throw err;
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json({ message: "Incentive cancelled", incentive: cancelledRow });
  } catch (error) {
    console.error("Error cancelling incentive:", error);
    return NextResponse.json({ error: error.message || "Failed to cancel incentive" }, { status: 500 });
  }
}
