import Employee from "@/models/Employee";
import { withDB } from "@/lib/withDB";
import { NAME_COLLATION } from "@/lib/sortOptions";
import {
  canonicalEmployeeRole,
  EMPLOYEE_ROLE_OPTIONS,
  OTHER_EMPLOYEE_ROLE,
} from "@/constants/employeeRoles";
import { NextResponse } from "next/server";

const handler = async (req) => {
  try {
    const data = await Employee.find({}).sort({ name: 1 }).collation(NAME_COLLATION);

    // Seed every canonical bucket so consumers can safely read e.g. `employees.Counsellor`
    // even when no employee currently holds that role.
    const employeesByRole = {};
    for (const r of [...EMPLOYEE_ROLE_OPTIONS, OTHER_EMPLOYEE_ROLE]) employeesByRole[r] = [];

    for (const employee of data) {
      // Role is free-form text — fold "counsellor" / "Counsellor" / "COUNSELLOR" etc. into
      // one bucket; anything unrecognised goes to "Others".
      const role = canonicalEmployeeRole(employee.role);
      employeesByRole[role].push({
        name: employee.name,
        _id: employee._id,
      });
    }

    return NextResponse.json({
      success: true,
      data: employeesByRole,
      roles: Object.keys(employeesByRole),
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch employees",
      },
      { status: 500 }
    );
  }
};

export const GET = withDB(handler);
