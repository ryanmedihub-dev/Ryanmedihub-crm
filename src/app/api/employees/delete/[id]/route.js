import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Interviewer from "@/models/Interviewer";
import Payable from "@/models/Payable";
import Advance from "@/models/Advance";
import Borrowing from "@/models/Borrowing";
import Receivable from "@/models/Receivable";
import Transactions from "@/models/Transactions";
import DeleteLog from "@/models/DeleteLog";
import { EMPLOYEE_REFERENCES } from "@/constants/employeeReferences";

const ALLOWED_ROLES = ["hr", "super-admin", "admin"];
const MODELS = { Patient, Interviewer, Payable, Advance, Borrowing, Receivable, Transactions };

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid employee ID" }, { status: 400 });
    }
    const oid = new mongoose.Types.ObjectId(id);

    const employee = await Employee.findById(oid);
    if (!employee) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    // --- pre-flight: every place an employee id can live ---
    const perPath = await Promise.all(
      EMPLOYEE_REFERENCES.map(async (ref) => {
        const Model = MODELS[ref.model];
        if (!Model) return { model: ref.model, path: ref.path, count: 0 };
        const count = await Model.countDocuments({ [ref.path]: oid, ...(ref.guard || {}) });
        return { model: ref.model, path: ref.path, count };
      }),
    );
    const byModel = {};
    let total = 0;
    for (const r of perPath) {
      total += r.count;
      byModel[r.model] = (byModel[r.model] || 0) + r.count;
    }

    if (total > 0) {
      const parts = Object.entries(byModel)
        .filter(([, n]) => n > 0)
        .map(([m, n]) => `${n} ${m.toLowerCase()}`)
        .join(", ");
      return NextResponse.json(
        {
          success: false,
          blocked: true,
          totalReferences: total,
          byModel,
          canDeactivate: true,
          message:
            `"${employee.name}" is referenced by ${total} document(s) (${parts}). ` +
            `Deleting would orphan them. Deactivate this employee instead, or merge them into another record.`,
        },
        { status: 409 },
      );
    }

    // --- genuinely unreferenced — hard delete ---
    await Employee.findByIdAndDelete(oid);
    await DeleteLog.create({
      entityType: "Employee",
      entityId: id,
      entityName: employee.name,
      entityDetails: { role: employee.role, employeeId: employee.employeeId || "", branch: employee.branch },
      deletedBy: { name: session.user.name, email: session.user.email, branch: session.user.branch },
      branch: employee.branch,
    });

    return NextResponse.json({ success: true, message: `"${employee.name}" deleted` });
  } catch (error) {
    if (error.name === "CastError") {
      return NextResponse.json({ success: false, message: "Invalid employee ID" }, { status: 400 });
    }
    console.error("Delete employee error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
