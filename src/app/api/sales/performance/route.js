import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db.js";
import Employee from "@/models/Employee";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions.js";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";
export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);

    const dateFilter = {};
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        dateFilter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.date.$lte = end;
      }
    }

    const branch = searchParams.get("branch");

    const branchFilter = { costType: "Revenue", method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION, ...dateFilter };
    const branches = ["Delhi", "Mumbai", "Hyderabad", "Noida"];
    const targetBranches = branch ? branches.filter((b) => b === branch) : branches;

    const procedures = ["hair transplant", "prp", "beard transplant", "medicine", "gfc"];
    const procedureFilter = {
      costType: "Revenue",
      method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
      procedure: { $in: procedures },
      ...dateFilter,
      ...(branch ? { branch } : {}),
    };

    const now = new Date();
    const monthsToShow = 12;
    const windowStart = new Date(now.getFullYear(), now.getMonth() - (monthsToShow - 1), 1);
    const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthKey = { $dateToString: { format: "%Y-%m", date: "$date" } };
    const revenueMatch = {
      costType: "Revenue",
      method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
      date: { $gte: windowStart, $lte: windowEnd },
    };
    if (branch) revenueMatch.branch = branch;
    const patientMonthMatch = { "personal.visitDate": { $gte: windowStart, $lte: windowEnd } };
    if (branch) patientMonthMatch["personal.branch"] = branch;

    const statusFilter = {};
    if (branch) statusFilter["personal.branch"] = branch;
    if (startDate || endDate) {
      statusFilter["personal.visitDate"] = {};
      if (startDate) statusFilter["personal.visitDate"].$gte = new Date(startDate);
      if (endDate) statusFilter["personal.visitDate"].$lte = new Date(endDate);
    }

    const summaryFilter = {
      costType: "Revenue",
      method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
      ...dateFilter,
      ...(branch ? { branch } : {}),
    };

    const [
      agents,
      branchRevenueAgg,
      procedureAgg,
      revenueByMonth,
      patientsByMonth,
      statusAgg,
      summaryAggArr,
    ] = await Promise.all([
      Employee.find({ role: "Agent" })
        .populate({ path: "patient", select: "personal payments" })
        .lean(),
      targetBranches.length
        ? Transactions.aggregate([
            { $match: { ...branchFilter, branch: { $in: targetBranches } } },
            { $group: { _id: "$branch", total: { $sum: "$amount" } } },
          ])
        : Promise.resolve([]),
      Transactions.aggregate([
        { $match: procedureFilter },
        { $group: { _id: "$procedure", total: { $sum: "$amount" } } },
      ]),
      Transactions.aggregate([
        { $match: revenueMatch },
        { $group: { _id: monthKey, total: { $sum: "$amount" } } },
      ]),
      Patient.aggregate([
        { $match: patientMonthMatch },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$personal.visitDate" } }, count: { $sum: 1 } } },
      ]),
      Patient.aggregate([
        { $match: statusFilter },
        { $group: { _id: "$ops.status", count: { $sum: 1 } } },
      ]),
      Transactions.aggregate([
        { $match: summaryFilter },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const agentPatientSets = agents.map((agent) => {
      let patients = agent.patient || [];

      if (branch) {
        patients = patients.filter((p) => p.personal?.branch === branch);
      }
      if (startDate || endDate) {
        patients = patients.filter((p) => {
          const visitDate = p.personal?.visitDate;
          if (!visitDate) return false;
          const date = new Date(visitDate);
          if (startDate && date < new Date(startDate)) return false;
          if (endDate && date > new Date(endDate)) return false;
          return true;
        });
      }
      return { agent, patients };
    });

    const allPatientIds = [
      ...new Set(agentPatientSets.flatMap(({ patients }) => patients.map((p) => String(p._id)))),
    ];

    const revenueByPatient = allPatientIds.length
      ? await Transactions.aggregate([
          {
            $match: {
              patient: { $in: allPatientIds.map((id) => new mongoose.Types.ObjectId(id)) },
              costType: "Revenue",
              method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
              ...dateFilter,
            },
          },
          { $group: { _id: "$patient", total: { $sum: "$amount" } } },
        ])
      : [];
    const revenueMapByPatient = new Map(revenueByPatient.map((r) => [String(r._id), r.total]));

    const agentPerformance = agentPatientSets.map(({ agent, patients }) => {
      const visitedCount = patients.filter((p) => p.personal?.visitDate).length;
      const revenue = patients.reduce((sum, p) => sum + (revenueMapByPatient.get(String(p._id)) || 0), 0);

      return {
        name: agent.name,
        patients: patients.length,
        visited: visitedCount,
        revenue,
      };
    });

    const branchRevenueMap = new Map(branchRevenueAgg.map((r) => [r._id, r.total]));
    const filteredRevenueByBranch = targetBranches
      .map((branchName) => ({ name: branchName, revenue: branchRevenueMap.get(branchName) || 0 }))
      .filter((b) => b.revenue > 0);

    const procedureRevenueMap = new Map(procedureAgg.map((r) => [r._id, r.total]));
    const revenueByProcedure = procedures.map((procedure) => ({
      procedure,
      revenue: procedureRevenueMap.get(procedure) || 0,
    }));

    const revenueMap = Object.fromEntries(revenueByMonth.map((r) => [r._id, r.total]));
    const patientsMap = Object.fromEntries(patientsByMonth.map((r) => [r._id, r.count]));
    const monthlyRevenue = [];

    for (let i = monthsToShow - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      if (startDate && monthEnd < new Date(startDate)) continue;
      if (endDate && monthStart > new Date(endDate)) continue;

      const key = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

      monthlyRevenue.push({
        month: monthStart.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        revenue: revenueMap[key] || 0,
        patients: patientsMap[key] || 0,
      });
    }

    const statusCountMap = Object.fromEntries(statusAgg.map((r) => [r._id, r.count]));
    const totalPatientsForFunnel = statusAgg.reduce((sum, r) => sum + r.count, 0);

    const statuses = ["NEW", "CONSULTED", "SURGERY_BOOKED", "CLOSED"];
    const patientStatus = statuses.map((status) => ({
      name: status.replace("_", " "),
      count: statusCountMap[status] || 0,
    }));

    const consultedPatients =
      (statusCountMap.CONSULTED || 0) + (statusCountMap.SURGERY_BOOKED || 0) + (statusCountMap.CLOSED || 0);
    const surgeryBookedPatients = (statusCountMap.SURGERY_BOOKED || 0) + (statusCountMap.CLOSED || 0);
    const closedPatients = statusCountMap.CLOSED || 0;

    const conversionFunnel = [
      { stage: "Total Leads", count: totalPatientsForFunnel },
      { stage: "Consulted", count: consultedPatients },
      { stage: "Surgery Booked", count: surgeryBookedPatients },
      { stage: "Closed", count: closedPatients },
    ];

    const summaryAgg = summaryAggArr[0];
    const totalRevenue = summaryAgg?.total || 0;
    const transactionCount = summaryAgg?.count || 0;

    const totalPatients = totalPatientsForFunnel;
    const conversionRate =
      totalPatients > 0
        ? ((closedPatients / totalPatients) * 100).toFixed(2)
        : 0;
    const avgTransaction =
      transactionCount > 0
        ? Math.round(totalRevenue / transactionCount)
        : 0;

    return NextResponse.json({
      success: true,
      agentPerformance: agentPerformance.filter(
        (a) => a.patients > 0 || a.revenue > 0
      ),
      revenueByBranch: filteredRevenueByBranch,
      revenueByProcedure: revenueByProcedure.filter((p) => p.revenue > 0),
      monthlyRevenue,
      patientStatus: patientStatus.filter((s) => s.count > 0),
      conversionFunnel,
      totalRevenue,
      totalPatients,
      conversionRate,
      avgTransaction,
    });
  } catch (error) {
    console.error("Error fetching performance data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch performance data" },
      { status: 500 }
    );
  }
}
