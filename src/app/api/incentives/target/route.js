import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Payable from "@/models/Payable";
import Employee from "@/models/Employee";
import { ALL_BRANCHES } from "@/lib/branches";
import { checkPeriodLock } from "@/lib/periodLock";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin", "reception", "stock"];

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

    const { employee, target, amount, date, branch, remarks } = await req.json();

    if (!employee || !mongoose.Types.ObjectId.isValid(employee)) {
      return NextResponse.json({ error: "Select an employee" }, { status: 400 });
    }
    const targetText = String(target || "").trim();
    if (!targetText) {
      return NextResponse.json({ error: "Describe the target that was achieved" }, { status: 400 });
    }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }
    if (!branch || !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: "Select a valid branch" }, { status: 400 });
    }

    const employeeDoc = await Employee.findById(employee).select("name").lean();
    if (!employeeDoc) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const when = date ? new Date(date) : new Date();
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const period = { month: when.getMonth() + 1, year: when.getFullYear() };

    const lockReason = await checkPeriodLock({ furtherMode: null, date: when });
    if (lockReason) {
      return NextResponse.json({ error: lockReason, periodLocked: true }, { status: 423 });
    }

    const actor = { name: session.user.name, email: session.user.email, branch: session.user.branch };
    const performedBy = { name: session.user.name, email: session.user.email };
    const note = remarks ? `${targetText} — ${remarks}` : targetText;

    const [payable] = await Payable.create([
      {
        payee: { kind: "EMPLOYEE", refId: employeeDoc._id, label: employeeDoc.name },
        purpose: "INCENTIVE",
        expenseCategory: "Incentive",
        expenseSubType: "Target Incentive",
        period,
        totalAmount: parsedAmount,
        branch,
        costAlreadyRecognised: false,
        remarks: `Target incentive — ${note}`,
        createdBy: { ...actor, date: new Date() },
        log: [
          {
            action: "Created",
            newValue: String(parsedAmount),
            note: `Target achieved: ${note}`,
            performedBy,
            performedAt: new Date(),
          },
        ],
      },
    ]);

    await cacheInvalidate("finance", "owner", "employees");
    return NextResponse.json(
      { message: "Target incentive payable created", payable },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating target incentive:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create target incentive" },
      { status: 500 },
    );
  }
}
