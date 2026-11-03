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
    const branchFilter = resolveBranchScope(session, requestedBranch, "personal.branch");

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const filter = {
      ...branchFilter,
      $or: [
        { "surgery.graftsImplanted": { $exists: false } },
        { "surgery.graftsImplanted": null },
        { "surgery.graftsImplanted": 0 },
      ],
      "ops.status": { $in: ["NEW", "CONSULTED", "SURGERY_BOOKED"] },
    };

    const [patients, total] = await Promise.all([
      Patient.find(filter)
        .select("personal counselling ops")
        .sort({ "personal.visitDate": -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Patient.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      patients,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Error fetching not-visited patients:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch not-visited patients" },
      { status: 500 }
    );
  }
}