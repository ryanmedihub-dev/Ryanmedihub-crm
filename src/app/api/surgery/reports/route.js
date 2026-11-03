import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
import { requireSession, resolveBranchScope } from "@/lib/apiGuard";

const ALLOWED_ROLES = ["super-admin", "admin", "surgery", "owner"];

export async function GET(req) {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const requestedBranch = searchParams.get("branch") || "All";
    const dateRange = searchParams.get("dateRange") || "This Month";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (dateRange === "Today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateFilter = { $gte: today, $lt: tomorrow };
    } else if (dateRange === "This Week") {
      const today = new Date();
      const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
      firstDay.setHours(0, 0, 0, 0);
      dateFilter = { $gte: firstDay };
    } else if (dateRange === "This Month") {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      dateFilter = { $gte: firstDay };
    }

    const branchFilter = resolveBranchScope(session, requestedBranch, "personal.branch");

    const surgeries = await Patient.find({
      ...branchFilter,
      "surgery.surgeryDate": dateFilter,
    })
      .select("personal surgery payments")
      .lean();

    const totalSurgeries = surgeries.length;
    const completedSurgeries = surgeries.filter((s) => s.surgery?.graftsImplanted > 0).length;
    const pendingSurgeries = totalSurgeries - completedSurgeries;

    const totalGrafts = surgeries.reduce((sum, s) => sum + (s.surgery?.graftsImplanted || 0), 0);
    const averageGrafts = totalSurgeries > 0 ? Math.round(totalGrafts / totalSurgeries) : 0;

    const totalRevenue = surgeries.reduce((sum, s) => sum + (s.payments?.totalAmount || 0), 0);
    const averageRevenue = totalSurgeries > 0 ? Math.round(totalRevenue / totalSurgeries) : 0;

    const techniqueBreakdown = {};
    surgeries.forEach((s) => {
      const technique = s.surgery?.technique;
      if (technique) {
        if (!techniqueBreakdown[technique]) {
          techniqueBreakdown[technique] = { count: 0, percentage: 0 };
        }
        techniqueBreakdown[technique].count++;
      }
    });

    Object.keys(techniqueBreakdown).forEach((technique) => {
      techniqueBreakdown[technique].percentage =
        ((techniqueBreakdown[technique].count / totalSurgeries) * 100).toFixed(1);
    });

    const locationBreakdown = {};
    surgeries.forEach((s) => {
      const location = s.surgery?.location || s.personal?.branch;
      if (location) {
        if (!locationBreakdown[location]) {
          locationBreakdown[location] = { count: 0, percentage: 0 };
        }
        locationBreakdown[location].count++;
      }
    });

    Object.keys(locationBreakdown).forEach((location) => {
      locationBreakdown[location].percentage =
        ((locationBreakdown[location].count / totalSurgeries) * 100).toFixed(1);
    });

    const recentSurgeries = surgeries
      .sort((a, b) => new Date(b.surgery?.surgeryDate) - new Date(a.surgery?.surgeryDate))
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        totalSurgeries,
        completedSurgeries,
        pendingSurgeries,
        totalGrafts,
        averageGrafts,
        totalRevenue,
        averageRevenue,
      },
      techniqueBreakdown,
      locationBreakdown,
      recentSurgeries,
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}