import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Transactions from "@/models/Transactions";
import Employee from "@/models/Employee";
import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";
const VALID_BRANCHES = ["All", "Delhi", "Mumbai", "Hyderabad", "Noida"];

const getISTStartOfDay = (date = null) => {
  const d = date ? new Date(date) : new Date();
  const istDate = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const year = istDate.getFullYear();
  const month = istDate.getMonth();
  const day = istDate.getDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

const getISTEndOfDay = (date = null) => {
  const d = date ? new Date(date) : new Date();
  const istDate = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const year = istDate.getFullYear();
  const month = istDate.getMonth();
  const day = istDate.getDate();
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
};

const handler = async (req) => {
  try {
    const data = await req.json();
    const { branch = "All", from, to } = data;

    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json(
        { error: "Invalid branch specified" },
        { status: 400 },
      );
    }

    const fromDate = from ? getISTStartOfDay(from) : getISTStartOfDay();
    const toDate = to ? getISTEndOfDay(to) : getISTEndOfDay();

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date provided" },
        { status: 400 },
      );
    }

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: "From date cannot be after to date" },
        { status: 400 },
      );
    }

    const daysDifference =
      Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

    const comparisonEnd = new Date(fromDate);
    comparisonEnd.setDate(comparisonEnd.getDate() - 1);
    comparisonEnd.setHours(23, 59, 59, 999);

    const comparisonStart = new Date(comparisonEnd);
    comparisonStart.setDate(comparisonStart.getDate() - (daysDifference - 1));
    comparisonStart.setHours(0, 0, 0, 0);

    const branchFilter = branch === "All" ? {} : { "personal.branch": branch };

    const getPatientStats = async () => {
      try {
        const result = await Patient.aggregate([
          {
            $match: {
              ...branchFilter,
              $or: [
                { "personal.visitDate": { $gte: fromDate, $lte: toDate } },
                { "personal.visitDate": { $gte: comparisonStart, $lte: comparisonEnd } },
              ],
            },
          },
          {
            $facet: {
              currentTotalLeads: [
                { $match: { "personal.visitDate": { $gte: fromDate, $lte: toDate } } },
                { $count: "count" },
              ],
              currentNewPatients: [
                {
                  $match: {
                    "personal.visitDate": { $gte: fromDate, $lte: toDate },
                    "ops.status": { $in: ["NEW", "NOT_VISITED"] },
                  },
                },
                { $count: "count" },
              ],
              currentContacted: [
                {
                  $match: {
                    "personal.visitDate": { $gte: fromDate, $lte: toDate },
                    "ops.status": {
                      $in: [
                        "CONSULTED",
                        "NOT_CONVERTED",
                        "SURGERY_BOOKED",
                        "CLOSED",
                      ],
                    },
                  },
                },
                { $count: "count" },
              ],
              currentConverted: [
                {
                  $match: {
                    "personal.visitDate": { $gte: fromDate, $lte: toDate },
                    "counselling.counsellor": {
                      $exists: true,
                      $ne: "",
                      $ne: null,
                    },
                    "payments.transactions": { $exists: true, $ne: [] },
                  },
                },
                { $count: "count" },
              ],
              currentNotConverted: [
                {
                  $match: {
                    "personal.visitDate": { $gte: fromDate, $lte: toDate },
                    "ops.status": "NOT_CONVERTED",
                  },
                },
                { $count: "count" },
              ],
              comparisonTotalLeads: [
                {
                  $match: {
                    "personal.visitDate": { $gte: comparisonStart, $lte: comparisonEnd },
                  },
                },
                { $count: "count" },
              ],
              comparisonNewPatients: [
                {
                  $match: {
                    "personal.visitDate": { $gte: comparisonStart, $lte: comparisonEnd },
                    "ops.status": { $in: ["NEW", "NOT_VISITED"] },
                  },
                },
                { $count: "count" },
              ],
              comparisonContacted: [
                {
                  $match: {
                    "personal.visitDate": { $gte: comparisonStart, $lte: comparisonEnd },
                    "ops.status": {
                      $in: [
                        "CONSULTED",
                        "NOT_CONVERTED",
                        "SURGERY_BOOKED",
                        "CLOSED",
                      ],
                    },
                  },
                },
                { $count: "count" },
              ],
              comparisonConverted: [
                {
                  $match: {
                    "personal.visitDate": { $gte: comparisonStart, $lte: comparisonEnd },
                    "ops.status": { $in: ["SURGERY_BOOKED", "CLOSED"] },
                  },
                },
                { $count: "count" },
              ],
            },
          },
        ]);

        return result[0] || {};
      } catch (error) {
        console.error("Error in getPatientStats:", error);
        return {};
      }
    };

    const getRevenueStats = async () => {
      try {
        const result = await Transactions.aggregate([
          {
            $match: {
              costType: "Revenue",
              ...(branch === "All" ? {} : { branch }),
              method: { $nin: unsettledMethodsSync() }, ...SETTLEMENT_EXCLUSION,
              $or: [
                { date: { $gte: fromDate, $lte: toDate } },
                { date: { $gte: comparisonStart, $lte: comparisonEnd } },
              ],
            },
          },
          {
            $facet: {
              current: [
                { $match: { date: { $gte: fromDate, $lte: toDate } } },
                { $group: { _id: null, total: { $sum: "$amount" } } },
              ],
              comparison: [
                {
                  $match: {
                    date: { $gte: comparisonStart, $lte: comparisonEnd },
                  },
                },
                { $group: { _id: null, total: { $sum: "$amount" } } },
              ],
            },
          },
        ]);

        return result[0] || {};
      } catch (error) {
        console.error("Error in getRevenueStats:", error);
        return {};
      }
    };

    const getAgentPerformance = async () => {
      try {
        const agents = await Employee.find({
          role: "Agent",
          isactive: true,
          ...(branch === "All" ? {} : { branch }),
        })
          .select("name email phone branch")
          .lean();

        const agentPerformance = await Promise.all(
          agents.map(async (agent) => {
            const patientStats = await Patient.aggregate([
              {
                $match: {
                  ...branchFilter,
                  "personal.visitDate": { $gte: fromDate, $lte: toDate },
                  $or: [
                    { "counselling.counsellor": agent._id },
                    { "personal.reference": agent._id },
                  ],
                },
              },
              {
                $facet: {
                  totalLeads: [{ $count: "count" }],
                  converted: [
                    {
                      $match: {
                        "ops.status": { $in: ["SURGERY_BOOKED", "CLOSED"] },
                      },
                    },
                    { $count: "count" },
                  ],
                },
              },
            ]);

            const totalLeads = patientStats[0]?.totalLeads[0]?.count || 0;
            const converted = patientStats[0]?.converted[0]?.count || 0;
            const conversionRate =
              totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

            return {
              name: agent.name,
              email: agent.email,
              phone: agent.phone,
              branch: agent.branch,
              totalLeads,
              converted,
              conversionRate,
            };
          }),
        );

        return agentPerformance.sort(
          (a, b) => b.conversionRate - a.conversionRate,
        );
      } catch (error) {
        console.error("Error in getAgentPerformance:", error);
        return [];
      }
    };

    const getUpcomingAppointments = async () => {
      try {
        const now = new Date();
        const next7Days = new Date();
        next7Days.setDate(next7Days.getDate() + 7);

        const appointments = await Patient.find({
          ...branchFilter,
          "personal.visitDate": { $gte: now, $lte: next7Days },
          "ops.status": { $in: ["NEW", "NOT_VISITED", "CONSULTED"] },
        })
          .select(
            "personal.name personal.visitDate personal.phone personal.branch ops.status",
          )
          .sort({ "personal.visitDate": 1 })
          .limit(10)
          .lean();

        return appointments;
      } catch (error) {
        console.error("Error in getUpcomingAppointments:", error);
        return [];
      }
    };

    const [patientStats, revenueStats, agentPerformance, upcomingAppointments] =
      await Promise.allSettled([
        getPatientStats(),
        getRevenueStats(),
        getAgentPerformance(),
        getUpcomingAppointments(),
      ]);

    const patientStatsResult =
      patientStats.status === "fulfilled" ? patientStats.value : {};
    const revenueStatsResult =
      revenueStats.status === "fulfilled" ? revenueStats.value : {};
    const agentPerformanceResult =
      agentPerformance.status === "fulfilled" ? agentPerformance.value : [];
    const upcomingAppointmentsResult =
      upcomingAppointments.status === "fulfilled"
        ? upcomingAppointments.value
        : [];

    const currentTotalLeads =
      patientStatsResult.currentTotalLeads?.[0]?.count || 0;
    const currentNewPatients =
      patientStatsResult.currentNewPatients?.[0]?.count || 0;
    const currentContacted =
      patientStatsResult.currentContacted?.[0]?.count || 0;
    const currentConverted =
      patientStatsResult.currentConverted?.[0]?.count || 0;
    const currentNotConverted =
      patientStatsResult.currentNotConverted?.[0]?.count || 0;
    const currentRevenue = revenueStatsResult.current?.[0]?.total || 0;

    const comparisonTotalLeads =
      patientStatsResult.comparisonTotalLeads?.[0]?.count || 0;
    const comparisonNewPatients =
      patientStatsResult.comparisonNewPatients?.[0]?.count || 0;
    const comparisonContacted =
      patientStatsResult.comparisonContacted?.[0]?.count || 0;
    const comparisonConverted =
      patientStatsResult.comparisonConverted?.[0]?.count || 0;
    const comparisonRevenue = revenueStatsResult.comparison?.[0]?.total || 0;

    const calculateGrowth = (current, comparison) => {
      if (comparison === 0 && current > 0) return 100;
      if (comparison === 0 && current === 0) return 0;
      return Math.round(((current - comparison) / comparison) * 100);
    };

    const totalLeadsGrowth = calculateGrowth(
      currentTotalLeads,
      comparisonTotalLeads,
    );
    const newPatientsGrowth = calculateGrowth(
      currentNewPatients,
      comparisonNewPatients,
    );
    const contactedGrowth = calculateGrowth(
      currentContacted,
      comparisonContacted,
    );
    const convertedGrowth = calculateGrowth(
      currentConverted,
      comparisonConverted,
    );
    const revenueGrowth = calculateGrowth(currentRevenue, comparisonRevenue);

    const conversionRate =
      currentTotalLeads > 0
        ? Math.round((currentConverted / currentTotalLeads) * 100)
        : 0;

    const response = {
      success: true,
      data: {
        totalLeads: currentTotalLeads,
        newPatients: currentNewPatients,
        contacted: currentContacted,
        converted: currentConverted,
        notConverted: currentNotConverted,
        revenue: currentRevenue,
        activeAgents: agentPerformanceResult.length,
        conversionRate: conversionRate,

        trends: {
          totalLeads: totalLeadsGrowth,
          newPatients: newPatientsGrowth,
          contacted: contactedGrowth,
          converted: convertedGrowth,
          revenue: revenueGrowth,
        },

        agentPerformance: agentPerformanceResult,
        upcomingAppointments: upcomingAppointmentsResult,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Admin Dashboard API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    );
  }
};

export const POST = withDB(handler);
