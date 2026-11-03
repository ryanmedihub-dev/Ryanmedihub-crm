import Employee from "@/models/Employee";
import { withDB } from "@/lib/withDB";
import { NAME_COLLATION } from "@/lib/sortOptions";
import {
  canonicalEmployeeRole,
  EMPLOYEE_ROLE_OPTIONS,
  OTHER_EMPLOYEE_ROLE,
} from "@/constants/employeeRoles";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiGuard";

const handler = async (req) => {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  try {
    const data = await Employee.find({ mergedInto: null })
      .select("_id name role branch")
      .sort({ name: 1 })
      .collation(NAME_COLLATION)
      .lean();

    const employeesByRole = {};
    for (const r of [...EMPLOYEE_ROLE_OPTIONS, OTHER_EMPLOYEE_ROLE]) employeesByRole[r] = [];

    for (const employee of data) {
      const role = canonicalEmployeeRole(employee.role);
      if (employeesByRole[role]) {
        employeesByRole[role].push({
          name: employee.name,
          _id: employee._id,
        });
      }
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
