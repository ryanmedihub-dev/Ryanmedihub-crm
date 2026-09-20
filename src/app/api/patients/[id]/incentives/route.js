import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { recordPatientIncentive, IncentiveError } from "@/lib/incentiveDerivation";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    const { employee, purpose, amount, date, branch, remarks } = await req.json();

    const actor = { name: session.user.name, email: session.user.email, branch: session.user.branch };
    const performedBy = { name: session.user.name, email: session.user.email };

    let result;
    try {
      result = await recordPatientIncentive({
        patientId: id,
        employee,
        purpose,
        amount,
        date,
        branch,
        remarks,
        actor,
        performedBy,
      });
    } catch (err) {
      if (err instanceof IncentiveError) {
        return NextResponse.json(err.body, { status: err.status });
      }
      throw err;
    }

    await cacheInvalidate("finance", "owner", "patients");
    return NextResponse.json(
      {
        message: "Incentive recorded",
        incentive: result.incentive,
        payable: result.payable,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error recording incentive:", error);
    return NextResponse.json({ error: error.message || "Failed to record incentive" }, { status: 500 });
  }
}
