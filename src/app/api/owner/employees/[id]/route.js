import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import { SECTION_LABELS } from "@/lib/owner/employeeSections";
import { loadEmployeeDetail } from "@/lib/owner/employeeDetailQuery";
import { parseEmployeeFilters, parsePageParams, pageMeta } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// One detail route for all six Employees roles (Owner Panel v2, Part 1) — the
// role-specific KPIs/rows/trend/compensation come from src/lib/owner/employeeDetailQuery.js.
//
// Not wrapped in withDB() — that helper only forwards `req`, dropping the
// dynamic route's `{ params }` — so this connects directly, same as the other
// `[id]` routes in this app (e.g. src/app/api/employees/update/[id]/route.js).

export async function GET(req, { params }) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }
    const employee = await Employee.findOne({ _id: id, mergedInto: null }).lean();
    if (!employee) {
      return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo } = parseEmployeeFilters(searchParams);
    const { page, pageSize } = parsePageParams(searchParams);

    const detail = await loadEmployeeDetail(employee, { from: dateFrom, to: dateTo, searchParams });

    return NextResponse.json({
      success: true,
      employee: {
        id: String(employee._id),
        name: employee.name,
        phone: employee.phone,
        email: employee.email,
        employeeId: employee.employeeId,
        role: employee.role,
        section: detail.section,
        sectionLabel: SECTION_LABELS[detail.section] || detail.section,
        branch: employee.branch,
        isactive: employee.isactive,
        dateOfJoining: employee.dateOfJoining,
        tlName: employee.tlName,
        managerName: employee.managerName,
        callbyLinked: !!employee.callbyUserId,
        salary: employee.salaryStructure?.baseSalary || 0,
        incentiveRate: employee.incentiveRate || 0,
        performance: detail.performance,
      },
      kpis: detail.kpis,
      compensation: detail.compensation,
      trend: detail.trend,
      rows: detail.rows,
      rowsLabel: detail.rowsLabel,
      sortBy: detail.sortBy || null,
      sortDir: detail.sortDir || null,
      ...pageMeta({ page, pageSize, total: detail.total || 0 }),
      recentCalls: detail.recentCalls || [],
      recentLeadChangelog: detail.recentLeadChangelog || [],
      callbyError: detail.callbyError || null,
    });
  } catch (error) {
    console.error("owner employee detail error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
