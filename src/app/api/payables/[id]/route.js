import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Payable from "@/models/Payable";
import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Advance from "@/models/Advance";
import DeleteLog from "@/models/DeleteLog";
import { buildPayableAggregationStages } from "@/lib/payableAggregation";
import { settlementLinesFor } from "@/lib/advanceSettlements";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(req, { params }) {
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
      return NextResponse.json({ error: "Invalid payable ID" }, { status: 400 });
    }

    const [payable] = await Payable.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      ...buildPayableAggregationStages(Transactions.collection.name),
    ]);
    if (!payable) {
      return NextResponse.json({ error: "Payable not found" }, { status: 404 });
    }

    // Human staff code for an EMPLOYEE payee, so callers can show "Ashu · RYN-014".
    if (payable.payee?.kind === "EMPLOYEE" && payable.payee?.refId) {
      const emp = await Employee.findById(payable.payee.refId).select("employeeId role").lean();
      if (emp) {
        payable.payeeCode = emp.employeeId || "";
        payable.payeeRole = emp.role || "";
      }
    }

    // A per-patient incentive payable (findOrCreateIncentivePayable) is a running total —
    // the actual amounts live as rows on Patient.incentives[], each linked back here via
    // payableId. Surface that breakdown so the payable's own total isn't a black box.
    if (payable.purpose === "INCENTIVE" && payable.expenseSubType === "Incentive") {
      payable.incentiveEntries = await Patient.aggregate([
        { $match: { "incentives.payableId": payable._id } },
        { $unwind: "$incentives" },
        { $match: { "incentives.payableId": payable._id } },
        {
          $project: {
            _id: 0,
            incentiveId: "$incentives._id",
            patientId: "$_id",
            patientName: "$personal.name",
            patientPhone: "$personal.phone",
            date: "$incentives.date",
            purpose: "$incentives.purpose",
            amount: "$incentives.amount",
            remarks: "$incentives.remarks",
            isCancelled: "$incentives.isCancelled",
          },
        },
        { $sort: { date: -1 } },
      ]);
    }

    return NextResponse.json({ payable });
  } catch (error) {
    console.error("Error fetching payable:", error);
    return NextResponse.json({ error: "Failed to fetch payable" }, { status: 500 });
  }
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
    const { totalAmount, dueDate, isCancelled, note, cascadeTds } = await req.json();

    const payable = await Payable.findById(id);
    if (!payable) {
      return NextResponse.json({ error: "Payable not found" }, { status: 404 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };

    if (totalAmount != null && parseFloat(totalAmount) !== payable.totalAmount) {
      payable.log.push({
        action: "Amount Revised",
        previousValue: String(payable.totalAmount),
        newValue: String(parseFloat(totalAmount)),
        note,
        performedBy,
        performedAt: new Date(),
      });
      payable.totalAmount = parseFloat(totalAmount);
    }

    if (dueDate !== undefined) {
      const newDue = dueDate ? new Date(dueDate) : null;
      const prevDue = payable.dueDate ? payable.dueDate.toISOString() : null;
      const nextDue = newDue ? newDue.toISOString() : null;
      if (prevDue !== nextDue) {
        payable.log.push({
          action: "Due Date Changed",
          previousValue: prevDue || "none",
          newValue: nextDue || "none",
          note,
          performedBy,
          performedAt: new Date(),
        });
        payable.dueDate = newDue;
      }
    }

    let linkedTdsPayable = null;
    if (isCancelled === true && !payable.isCancelled) {
      const settlingAdvance = await Advance.findOne({
        $or: [{ settlesPayableId: payable._id }, { "settlements.payableId": payable._id }],
        isCancelled: { $ne: true },
      });
      if (settlingAdvance) {
        const line = settlementLinesFor(settlingAdvance).find(
          (l) => String(l.payableId) === String(payable._id),
        );
        return NextResponse.json(
          {
            error:
              `An open advance (₹${(line?.amount ?? settlingAdvance.amount).toLocaleString("en-IN")} to ` +
              `${settlingAdvance.party?.label || "a party"}) is settling this payable. Unsettle it first.`,
          },
          { status: 409 },
        );
      }

      if (payable.tdsLink?.role === "PARENT" && payable.tdsLink?.linkedId) {
        const linked = await Payable.findById(payable.tdsLink.linkedId);
        if (linked && !linked.isCancelled) {
          if (!cascadeTds) {
            return NextResponse.json(
              {
                error:
                  "This payable has a linked TDS payable. Pass cascadeTds: true to cancel both, or handle the TDS payable separately.",
                linkedTdsPayableId: linked._id,
                requiresCascadeConfirmation: true,
              },
              { status: 409 },
            );
          }
          linked.isCancelled = true;
          linked.log.push({
            action: "Cancelled",
            previousValue: "false",
            newValue: "true",
            note: note || `Cascaded from linked payable ${payable._id}`,
            performedBy,
            performedAt: new Date(),
          });
          await linked.save();
          linkedTdsPayable = linked;
        }
      }

      payable.isCancelled = true;
      payable.log.push({
        action: "Cancelled",
        previousValue: "false",
        newValue: "true",
        note,
        performedBy,
        performedAt: new Date(),
      });
    } else if (isCancelled === false && payable.isCancelled) {
      payable.isCancelled = false;
      payable.log.push({
        action: "Cancelled",
        previousValue: "true",
        newValue: "false",
        note: note || "Reinstated",
        performedBy,
        performedAt: new Date(),
      });
    }

    if (note && totalAmount == null && dueDate === undefined && isCancelled === undefined) {
      payable.log.push({
        action: "Note Added",
        note,
        performedBy,
        performedAt: new Date(),
      });
    }

    await payable.save();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Payable updated", payable, linkedTdsPayable });
  } catch (error) {
    console.error("Error updating payable:", error);
    return NextResponse.json({ error: "Failed to update payable" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid payable ID" }, { status: 400 });
    }

    const payable = await Payable.findById(id);
    if (!payable) {
      return NextResponse.json({ error: "Payable not found" }, { status: 404 });
    }

    const linked = await Transactions.countDocuments({ payableId: payable._id });
    if (linked > 0) {
      return NextResponse.json(
        {
          error:
            `${linked} payment(s) have already been made against this payable. ` +
            `Delete or re-link those first, or cancel this payable instead — deleting it now ` +
            `would leave those payments pointing at nothing.`,
        },
        { status: 409 },
      );
    }

    const { default: Borrowing } = await import("@/models/Borrowing");
    const linkedBorrowings = await Borrowing.countDocuments({ payableId: payable._id });
    if (linkedBorrowings > 0) {
      return NextResponse.json(
        {
          error:
            `${linkedBorrowings} borrowing row(s) are recorded against this loan. ` +
            `Cancel those first (see /admin/financing), or cancel this payable instead of ` +
            `deleting it — deleting it now would leave those rows pointing at nothing.`,
        },
        { status: 409 },
      );
    }

    await DeleteLog.create({
      entityType: "Payable",
      entityId: String(payable._id),
      entityName: payable.payee?.label || "Payable",
      entityDetails: {
        purpose: payable.purpose,
        expenseCategory: payable.expenseCategory,
        expenseSubType: payable.expenseSubType,
        totalAmount: payable.totalAmount,
        branch: payable.branch,
        payeeKind: payable.payee?.kind,
        remarks: payable.remarks,
        createdBy: payable.createdBy?.name,
      },
      deletedBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
      },
      branch: payable.branch,
    });

    await payable.deleteOne();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Payable deleted" });
  } catch (error) {
    console.error("Error deleting payable:", error);
    return NextResponse.json({ error: "Failed to delete payable" }, { status: 500 });
  }
}
