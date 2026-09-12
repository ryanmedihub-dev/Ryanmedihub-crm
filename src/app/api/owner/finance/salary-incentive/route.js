import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Employee from "@/models/Employee";
import Payable from "@/models/Payable";
import { buildCompensationMetrics } from "@/lib/owner/employeeReportQuery";
import {
  parseEmployeeFilters, parsePageParams, parseSortParams, pagedFacet, unpackFacet, pageMeta,
} from "@/lib/owner/pagination";

const ALLOWED_ROLES = ["owner", "super-admin"];

// Per-employee salary/incentive for the period — uses the IMPORTED
// buildCompensationMetrics (Part 1's src/lib/owner/employeeReportQuery.js),
// the exact function the Employees pages' salaryPaid/incentivePaid columns
// call, so this page agrees with those by construction, not by coincidence
// (Owner Panel v2, Part 5 brief).
//
// Shape of a request: the compensation rollup is one grouped Payable
// aggregation (≤ one row per employee); those rows are attached to the
// Employee documents inside one Employee.aggregate() whose $facet does the
// sort / page slice, the four rollups (branch / operating unit / role / month)
// and the KPI totals — all over the whole filtered set, in one round trip.
// Default page 25, max 200 (src/lib/owner/pagination.js).
//
// Operating-unit note: scripts/import-salary-data.mjs mapped the salary
// sheet's 7 operating units (Backend/Vaishali/GD/CD/Collab/Noida/Hyd) onto
// real ALL_BRANCHES values — 5 of them (Backend/Vaishali/GD/CD/Collab)
// collapse onto "Delhi" — and preserved the original unit as free text in
// Payable.remarks ("... — <unit> unit — ..."). Parsed back out here so the
// Delhi bucket's internal split isn't silently lost.
const UNIT_RE = /—\s*([A-Za-z]+)\s*unit\s*—/;

const SORTABLE = {
  name: "name", role: "role", branch: "branch", operatingUnit: "_m.operatingUnit",
  baseSalaryDue: "_m.baseSalaryDue", salaryPaid: "_m.salaryPaid", salaryPending: "_m.salaryPending",
  incentiveDue: "_m.incentiveDue", incentivePaid: "_m.incentivePaid", incentivePending: "_m.incentivePending",
  monthKey: "_m.monthKey",
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const rollupStages = (keyExpr) => [
  {
    $group: {
      _id: keyExpr,
      salaryDue: { $sum: "$_m.baseSalaryDue" },
      salaryPaid: { $sum: "$_m.salaryPaid" },
      incentiveDue: { $sum: "$_m.incentiveDue" },
      incentivePaid: { $sum: "$_m.incentivePaid" },
      count: { $sum: 1 },
    },
  },
  { $project: { _id: 0, key: { $ifNull: ["$_id", "Unspecified"] }, salaryDue: 1, salaryPaid: 1, incentiveDue: 1, incentivePaid: 1, count: 1 } },
  { $sort: { salaryDue: -1, key: 1 } },
];

export async function GET(req) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { dateFrom, dateTo, branch, search } = parseEmployeeFilters(searchParams);
    const { page, pageSize, skip, limit } = parsePageParams(searchParams);
    const { sortBy, sortDir, sort } = parseSortParams(searchParams, { allowed: SORTABLE, defaultKey: "name" });
    const period = { from: dateFrom, to: dateTo };

    const employeeMatch = { mergedInto: null };
    if (branch && branch !== "All") employeeMatch.branch = branch;
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      employeeMatch.$or = [{ name: re }, { role: re }];
    }
    const cohort = await Employee.find(employeeMatch).select("_id").lean();
    if (!cohort.length) {
      return NextResponse.json({
        success: true, rows: [], total: 0, ...pageMeta({ page, pageSize, total: 0 }), sortBy, sortDir,
        totals: { salaryDue: 0, salaryPaid: 0, incentiveDue: 0, incentivePaid: 0, employees: 0 },
        byBranch: [], byOperatingUnit: [], byRole: [], byMonth: [],
      });
    }

    const payableMatch = { purpose: "SALARY", "payee.kind": "EMPLOYEE", "payee.refId": { $in: cohort.map((e) => e._id) }, isCancelled: { $ne: true } };
    if (dateFrom || dateTo) {
      payableMatch.createdAt = {};
      if (dateFrom) { const f = new Date(dateFrom); f.setHours(0, 0, 0, 0); payableMatch.createdAt.$gte = f; }
      if (dateTo) { const t = new Date(dateTo); t.setHours(23, 59, 59, 999); payableMatch.createdAt.$lte = t; }
    }

    const [compById, salaryPayables] = await Promise.all([
      buildCompensationMetrics(cohort, period),
      // Raw SALARY payables in scope, for remarks (operating unit) and
      // per-payable period, matched by the same employee set + window.
      Payable.find(payableMatch).select("payee.refId remarks period").lean(),
    ]);

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

    // One small object per employee with activity this period. Employees with
    // nothing due or paid are left out here, so the $match below drops them.
    const metricRows = [];
    for (const e of cohort) {
      const id = String(e._id);
      const c = compById.get(id);
      if (!c) continue;
      if (!(c.salaryPayable > 0 || c.salaryPaid > 0 || c.incentivePayable > 0 || c.incentivePaid > 0)) continue;
      metricRows.push({
        _id: e._id,
        baseSalaryDue: c.salaryPayable,
        salaryPaid: c.salaryPaid,
        salaryPending: Math.max(0, c.salaryPayable - c.salaryPaid),
        incentiveDue: c.incentivePayable,
        incentivePaid: c.incentivePaid,
        incentivePending: Math.max(0, c.incentivePayable - c.incentivePaid),
        operatingUnit: unitByEmployee.get(id) || null,
        monthKey: monthKeyByEmployee.get(id) || null,
      });
    }

    const [result] = await Employee.aggregate([
      { $match: { ...employeeMatch, _id: { $in: metricRows.map((r) => r._id) } } },
      {
        $addFields: {
          _m: {
            $arrayElemAt: [
              { $filter: { input: { $literal: metricRows }, as: "m", cond: { $eq: ["$$m._id", "$_id"] } } },
              0,
            ],
          },
        },
      },
      {
        $facet: {
          rows: [
            { $sort: { ...sort } },
            { $skip: skip },
            { $limit: limit },
            { $project: { name: 1, role: 1, branch: 1, isactive: 1, _m: 1 } },
          ],
          count: [{ $count: "n" }],
          totals: [
            {
              $group: {
                _id: null,
                employees: { $sum: 1 },
                salaryDue: { $sum: "$_m.baseSalaryDue" },
                salaryPaid: { $sum: "$_m.salaryPaid" },
                incentiveDue: { $sum: "$_m.incentiveDue" },
                incentivePaid: { $sum: "$_m.incentivePaid" },
              },
            },
          ],
          byBranch: rollupStages("$branch"),
          byOperatingUnit: rollupStages({ $ifNull: ["$_m.operatingUnit", "$branch"] }),
          byRole: rollupStages("$role"),
          byMonth: rollupStages("$_m.monthKey"),
        },
      },
    ]).collation({ locale: "en", strength: 2 });

    const { rows: pageRows, totals, total } = unpackFacet(result);
    const rows = pageRows.map((r) => {
      const { _id, _m, ...doc } = r;
      const { _id: _ignored, ...metrics } = _m || {};
      return { id: String(_id), ...doc, ...metrics };
    });

    return NextResponse.json({
      success: true,
      rows,
      total,
      ...pageMeta({ page, pageSize, total }),
      sortBy,
      sortDir,
      totals: {
        employees: totals?.employees || 0,
        salaryDue: totals?.salaryDue || 0,
        salaryPaid: totals?.salaryPaid || 0,
        incentiveDue: totals?.incentiveDue || 0,
        incentivePaid: totals?.incentivePaid || 0,
      },
      byBranch: result?.byBranch || [],
      byOperatingUnit: result?.byOperatingUnit || [],
      byRole: result?.byRole || [],
      byMonth: result?.byMonth || [],
    });
  } catch (err) {
    console.error("owner finance salary-incentive error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
