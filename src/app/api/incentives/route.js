import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { recordPatientIncentive, IncentiveError } from "@/lib/incentiveDerivation";
import { cacheInvalidate } from "@/lib/cache";

// Open incentive entry point used by the "Incentive" panel on the role transaction-create
// pages. Any authenticated staff member may record a per-patient incentive here — it tops up
// the linked employee's monthly INCENTIVE payable exactly like the admin patient-page flow.
// Period-lock rules still apply (enforced inside recordPatientIncentive).
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { patient, employee, purpose, amount, date, branch, remarks } = await req.json();

    if (!patient || !mongoose.Types.ObjectId.isValid(patient)) {
      return NextResponse.json({ error: "Select a patient" }, { status: 400 });
    }

    const actor = { name: session.user.name, email: session.user.email, branch: session.user.branch };
    const performedBy = { name: session.user.name, email: session.user.email };

    let result;
    try {
      result = await recordPatientIncentive({
        patientId: patient,
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

    await cacheInvalidate("finance", "owner", "employees");
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
