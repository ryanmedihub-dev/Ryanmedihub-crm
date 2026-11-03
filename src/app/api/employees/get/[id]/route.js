import { NextResponse } from "next/server";
import Employee from "@/models/Employee";
import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/apiGuard";

const COMPENSATION_ROLES = ["super-admin", "admin", "owner"];

export async function GET(request, { params }) {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    await dbConnect();

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Employee ID is required" },
        { status: 400 }
      );
    }

    const employee = await Employee.findById(id).lean();

    if (!employee) {
      return NextResponse.json(
        { success: false, message: "Employee not found" },
        { status: 404 }
      );
    }

    // Mask compensation data for non-privileged roles
    if (!COMPENSATION_ROLES.includes(session.user.role)) {
      delete employee.salaryStructure;
      delete employee.incentiveRate;
    }

    return NextResponse.json(
      {
        success: true,
        data: employee,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching employee:", error);

    if (error.name === "CastError") {
      return NextResponse.json(
        { success: false, message: "Invalid employee ID format" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to fetch employee data" },
      { status: 500 }
    );
  }
}