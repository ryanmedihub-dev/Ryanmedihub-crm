import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Employee from "@/models/Employee";
import { normalizeEmployeeRoleForSave } from "@/constants/employeeRoles";

const handler = async (req) => {

    const { name, phone, email, employeeId, role, patient, salaryStructure, incentiveRate } = await req.json();

    if (!name || !phone || !role) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }

    const newEmployee = new Employee({
      name,
      phone,
      email,
      employeeId: (employeeId || "").trim(),
      role: normalizeEmployeeRoleForSave(role),
      patient,
      salaryStructure,
      incentiveRate,
    });

    await newEmployee.save();

    return NextResponse.json(
      { message: "Employee created successfully", employee: newEmployee },
      { status: 201 }
    );
  
};

export const POST = withDB(handler);
