import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import {
  getISTStartOfDay,
  getISTEndOfDay,
  formatISTDate,
  getDateRangeFromFilter
} from "@/lib/dateHelpers.js";

const VALID_BRANCHES = ["All", "Delhi", "Mumbai", "Hyderabad", "Noida", "Gurgaon"];

const handler = async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch") || "All";
    const dateRange = searchParams.get("dateRange") || "Today";

    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json(
        { error: "Invalid branch specified" },
        { status: 400 }
      );
    }

    const { start: fromDate, end: toDate } = getDateRangeFromFilter(dateRange);

    const daysDifference = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

    const yesterdayEnd = new Date(fromDate);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayStart = new Date(yesterdayEnd);
    yesterdayStart.setDate(yesterdayStart.getDate() - (daysDifference - 1));
    yesterdayStart.setHours(0, 0, 0, 0);

    const branchFilter = branch === "All" ? {} : { "personal.branch": branch };

    const getSurgeryStats = async () => {
      const result = await Patient.aggregate([
        {
          $match: {
            ...branchFilter,
            $or: [
              { "surgery.surgeryDate": { $gte: fromDate, $lte: toDate } },
              { "surgery.surgeryDate": { $gte: yesterdayStart, $lte: yesterdayEnd } },
              { "counselling.readyForSurgery": true }
            ],
          },
        },
        {
          $facet: {
            currentScheduled: [
              {
                $match: {
                  "surgery.surgeryDate": { $gte: fromDate, $lte: toDate },
                  $or: [
                    { "surgery.doctor": { $exists: false } },
                    { "surgery.doctor": null }
                  ]
                },
              },
              { $count: "count" },
            ],
            currentCompleted: [
              {
                $match: {
                  "surgery.surgeryDate": { $gte: fromDate, $lte: toDate },
                  "surgery.doctor": { $exists: true, $ne: null }
                },
              },
              { $count: "count" },
            ],
            currentPending: [
              {
                $match: {
                  "counselling.readyForSurgery": true,
                  $or: [
                    { "surgery.surgeryDate": { $exists: false } },
                    { "surgery.surgeryDate": null }
                  ]
                },
              },
              { $count: "count" },
            ],
            readyForSurgery: [
              {
                $match: {
                  "counselling.readyForSurgery": true,
                  "surgery.surgeryDate": { $exists: true, $ne: null },
                  $or: [
                    { "surgery.doctor": { $exists: false } },
                    { "surgery.doctor": null }
                  ]
                },
              },
              { $count: "count" },
            ],
            currentGrafts: [
              {
                $match: {
                  "surgery.surgeryDate": { $gte: fromDate, $lte: toDate },
                  "surgery.graftsImplanted": { $exists: true }
                },
              },
              {
                $group: {
                  _id: null,
                  totalGrafts: { $sum: "$surgery.graftsImplanted" },
                  avgGrafts: { $avg: "$surgery.graftsImplanted" }
                }
              }
            ],
            comparisonScheduled: [
              {
                $match: {
                  "surgery.surgeryDate": { $gte: yesterdayStart, $lte: yesterdayEnd },
                  $or: [
                    { "surgery.doctor": { $exists: false } },
                    { "surgery.doctor": null }
                  ]
                },
              },
              { $count: "count" },
            ],
            comparisonCompleted: [
              {
                $match: {
                  "surgery.surgeryDate": { $gte: yesterdayStart, $lte: yesterdayEnd },
                  "surgery.doctor": { $exists: true, $ne: null }
                },
              },
              { $count: "count" },
            ],
            comparisonGrafts: [
              {
                $match: {
                  "surgery.surgeryDate": { $gte: yesterdayStart, $lte: yesterdayEnd },
                  "surgery.graftsImplanted": { $exists: true }
                },
              },
              {
                $group: {
                  _id: null,
                  totalGrafts: { $sum: "$surgery.graftsImplanted" }
                }
              }
            ],
          },
        },
      ]);

      return {
        current: {
          scheduled: result[0]?.currentScheduled[0]?.count || 0,
          completed: result[0]?.currentCompleted[0]?.count || 0,
          pending: result[0]?.currentPending[0]?.count || 0,
          ready: result[0]?.readyForSurgery[0]?.count || 0,
          totalGrafts: result[0]?.currentGrafts[0]?.totalGrafts || 0,
          avgGrafts: Math.round(result[0]?.currentGrafts[0]?.avgGrafts || 0),
        },
        comparison: {
          scheduled: result[0]?.comparisonScheduled[0]?.count || 0,
          completed: result[0]?.comparisonCompleted[0]?.count || 0,
          totalGrafts: result[0]?.comparisonGrafts[0]?.totalGrafts || 0,
        },
      };
    };

    const getUpcomingSurgeries = async () => {
      const todayStart = getISTStartOfDay();
      const todayEnd = getISTEndOfDay();

      const surgeries = await Patient.find({
        ...branchFilter,
        "surgery.surgeryDate": { $gte: todayStart, $lte: todayEnd },
        $or: [
          { "surgery.doctor": { $exists: false } },
          { "surgery.doctor": null }
        ]
      })
        .select("personal.name personal.phone personal.branch surgery.surgeryDate surgery.technique surgery.graftsneed surgery.location counselling.techniqueSuggested counselling.graftsSuggested")
        .sort({ "surgery.surgeryDate": 1 })
        .lean();

      return surgeries;
    };

    const getPerformedSurgeries = async () => {
      const todayStart = getISTStartOfDay();
      const todayEnd = getISTEndOfDay();

      const surgeries = await Patient.find({
        ...branchFilter,
        "surgery.surgeryDate": { $gte: todayStart, $lte: todayEnd },
        "surgery.doctor": { $exists: true, $ne: null }
      })
        .select("personal.name personal.phone personal.branch surgery.surgeryDate surgery.technique surgery.graftsImplanted surgery.graftsneed surgery.location")
        .populate("surgery.doctor", "name")
        .sort({ "surgery.surgeryDate": 1 })
        .lean();

      return surgeries;
    };

    const getTechniqueDistribution = async () => {
      const distribution = await Patient.aggregate([
        {
          $match: {
            ...branchFilter,
            "surgery.surgeryDate": { $gte: fromDate, $lte: toDate },
            "surgery.technique": { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: "$surgery.technique",
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      const techniqueBreakdown = {};
      distribution.forEach(item => {
        techniqueBreakdown[item._id] = item.count;
      });

      return techniqueBreakdown;
    };

    const getLocationDistribution = async () => {
      const distribution = await Patient.aggregate([
        {
          $match: {
            ...branchFilter,
            "surgery.surgeryDate": { $gte: fromDate, $lte: toDate },
            "surgery.location": { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: "$surgery.location",
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      const locationBreakdown = {};
      distribution.forEach(item => {
        locationBreakdown[item._id] = item.count;
      });

      return locationBreakdown;
    };

    const [
      surgeryStats,
      upcomingSurgeries,
      performedSurgeries,
      techniqueBreakdown,
      locationBreakdown
    ] = await Promise.all([
      getSurgeryStats(),
      getUpcomingSurgeries(),
      getPerformedSurgeries(),
      getTechniqueDistribution(),
      getLocationDistribution()
    ]);

    const calculateGrowth = (current, comparison) => {
      if (comparison === 0 && current > 0) return 100;
      if (comparison === 0 && current === 0) return 0;
      return Math.round(((current - comparison) / comparison) * 100);
    };

    const response = {
      metrics: {
        scheduledSurgeries: surgeryStats.current.scheduled,
        completedSurgeries: surgeryStats.current.completed,
        pendingSurgeries: surgeryStats.current.pending,
        readyForSurgery: surgeryStats.current.ready,
        techniqueBreakdown,
        locationBreakdown,
        totalGrafts: surgeryStats.current.totalGrafts,
        avgGrafts: surgeryStats.current.avgGrafts,
      },
      upcomingSurgeries,
      performedSurgeries,
      growth: {
        scheduled: calculateGrowth(
          surgeryStats.current.scheduled,
          surgeryStats.comparison.scheduled
        ),
        completed: calculateGrowth(
          surgeryStats.current.completed,
          surgeryStats.comparison.completed
        ),
        grafts: calculateGrowth(
          surgeryStats.current.totalGrafts,
          surgeryStats.comparison.totalGrafts
        ),
      },
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        fromIST: formatISTDate(fromDate),
        toIST: formatISTDate(toDate),
      },
      branch,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Surgery Dashboard API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};

export const GET = withDB(handler);