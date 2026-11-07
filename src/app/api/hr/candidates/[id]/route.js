import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Interviewer from "@/models/Interviewer";

const ALLOWED_ROLES = ["hr", "super-admin", "admin", "owner"];

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. HR access required." },
        { status: 403 }
      );
    }

    await connectDB();

    const { id } = await params;
    const body = await req.json();

    const VALID_STATUSES = ["Applied", "Interview Scheduled", "Selected", "Rejected", "On Hold"];
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      body.status = "Applied";
    }

    const candidate = await Interviewer.findByIdAndUpdate(id, body, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!candidate) {
      return NextResponse.json({ success: false, message: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, candidate });
  } catch (err) {
    console.error("HR candidate PUT error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. HR access required." },
        { status: 403 }
      );
    }

    await connectDB();

    const { id } = await params;
    const candidate = await Interviewer.findByIdAndDelete(id);

    if (!candidate) {
      return NextResponse.json({ success: false, message: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Candidate deleted" });
  } catch (err) {
    console.error("HR candidate DELETE error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
