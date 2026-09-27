import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Employee from "@/models/Employee";
import { normalizeEmployeeRoleForSave } from "@/constants/employeeRoles";
import { cacheInvalidate } from "@/lib/cache";

const handler = async (req) => {

    const {
      name, phone, email, employeeId, role, patient, salaryStructure, incentiveRate,
      dateOfJoining, tlName, managerName,
    } = await req.json();

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
      
      
      
      dateOfJoining: dateOfJoining || undefined,
      tlName: (tlName ?? "").trim() || undefined,
      managerName: (managerName ?? "").trim() || undefined,
    });

    await newEmployee.save();

    await cacheInvalidate("employees", "owner");
    return NextResponse.json(
      { message: "Employee created successfully", employee: newEmployee },
      { status: 201 }
    );
  
};

export const POST = withDB(handler);
