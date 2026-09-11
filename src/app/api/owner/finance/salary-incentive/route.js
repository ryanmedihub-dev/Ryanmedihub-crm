import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import Payable from "@/models/Payable";
import { buildCompensationMetrics } from "@/lib/owner/employeeReportQuery";
import { parseEmployeeFilters } from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Per-employee salary/incentive for the period — uses the IMPORTED
// buildCompensationMetrics (Part 1's src/lib/owner/employeeReportQuery.js),
// the exact function the Employees pages' salaryPaid/incentivePaid columns
// call, so this page agrees with those by construction, not by coincidence
// (Owner Panel v2, Part 5 brief).
//
// Operating-unit note: scripts/import-salary-data.mjs mapped the salary
// sheet's 7 operating units (Backend/Vaishali/GD/CD/Collab/Noida/Hyd) onto
// real ALL_BRANCHES values — 5 of them (Backend/Vaishali/GD/CD/Collab)
// collapse onto "Delhi" — and preserved the original unit as free text in
// Payable.remarks ("... — <unit> unit — ..."). Parsed back out here so the
// Delhi bucket's internal split isn't silently lost.
const UNIT_RE = /—\s*([A-Za-z]+)\s*unit\s*—/;

export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch } = parseEmployeeFilters(searchParams);
    const period = { from: dateFrom, to: dateTo };

    const employeeMatch = { mergedInto: null };
    if (branch && branch !== "All") employeeMatch.branch = branch;
    const employees = await Employee.find(employeeMatch).select("name role branch isactive").lean();

    const compById = await buildCompensationMetrics(employees, period);

    // Pull the raw SALARY payables in scope, for remarks (operating unit) and
    // per-payable dueDate/period, matched by the same employee set + window.
    const payableMatch = { purpose: "SALARY", "payee.kind": "EMPLOYEE", "payee.refId": { $in: employees.map((e) => e._id) }, isCancelled: { $ne: true } };
    if (dateFrom || dateTo) {
      payableMatch.createdAt = {};
      if (dateFrom) { const f = new Date(dateFrom); f.setHours(0, 0, 0, 0); payableMatch.createdAt.$gte = f; }
      if (dateTo) { const t = new Date(dateTo); t.setHours(23, 59, 59, 999); payableMatch.createdAt.$lte = t; }
    }
    const salaryPayables = await Payable.find(payableMatch).select("payee.refId remarks dueDate period").lean();

    const unitByEmployee = new Map();
    const monthKeyByEmployee = new Map();
    for (const p of salaryPayables) {
      const empId = String(p.payee.refId);
      const m = UNIT_RE.exec(p.remarks || "");
      if (m && !unitByEmployee.has(empId)) unitByEmployee.set(empId, m[1]);
      if (p.period?.month && p.period?.year && !monthKeyByEmployee.has(empId)) {
        monthKeyByEmployee.set(empId, `${p.period.year}-${String(p.period.month).padStart(2, "0")}`);
      }
    }

    const rows = employees
      .map((e) => {
        const id = String(e._id);
        const comp = compById.get(id) || { salaryPayable: 0, salaryPaid: 0, incentivePayable: 0, incentivePaid: 0 };
        return {
          id,
          name: e.name,
          role: e.role,
          branch: e.branch,
          operatingUnit: unitByEmployee.get(id) || null,
          isactive: e.isactive,
          baseSalaryDue: comp.salaryPayable,
          salaryPaid: comp.salaryPaid,
          salaryPending: Math.max(0, comp.salaryPayable - comp.salaryPaid),
          incentiveDue: comp.incentivePayable,
          incentivePaid: comp.incentivePaid,
          incentivePending: Math.max(0, comp.incentivePayable - comp.incentivePaid),
          monthKey: monthKeyByEmployee.get(id) || null,
        };
      })
      .filter((r) => r.baseSalaryDue > 0 || r.salaryPaid > 0 || r.incentiveDue > 0 || r.incentivePaid > 0);

    const rollup = (keyFn) => {
      const map = new Map();
      for (const r of rows) {
        const key = keyFn(r) || "Unspecified";
        if (!map.has(key)) map.set(key, { key, salaryDue: 0, salaryPaid: 0, incentiveDue: 0, incentivePaid: 0, count: 0 });
        const g = map.get(key);
        g.salaryDue += r.baseSalaryDue;
        g.salaryPaid += r.salaryPaid;
        g.incentiveDue += r.incentiveDue;
        g.incentivePaid += r.incentivePaid;
        g.count += 1;
      }
      return [...map.values()].sort((a, b) => b.salaryDue - a.salaryDue);
    };

    return NextResponse.json({
      success: true,
      rows,
      byBranch: rollup((r) => r.branch),
      byOperatingUnit: rollup((r) => r.operatingUnit || r.branch),
      byRole: rollup((r) => r.role),
      byMonth: rollup((r) => r.monthKey),
    });
  } catch (err) {
    console.error("owner finance salary-incentive error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
