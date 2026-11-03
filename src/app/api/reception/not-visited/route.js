import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import { requireSession, resolveBranchScope } from "@/lib/apiGuard";

const ALLOWED_ROLES = ["super-admin", "admin", "reception", "counsellor", "owner"];

const handler = async (req) => {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const requestedBranch = searchParams.get("branch");

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const branchFilter = resolveBranchScope(session, requestedBranch, "personal.branch");

    const query = {
      ...branchFilter,
      $or: [
        { "counselling.counsellor": { $exists: false } },
        { "counselling.counsellor": null },
      ],
    };

    const [patients, total] = await Promise.all([
      Patient.find(query)
        .select("personal ops createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Patient.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      patients,
      count: patients.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("Not visited patients error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};

export const GET = withDB(handler);