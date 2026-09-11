import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db";
import Interviewer from "@/models/Interviewer";
import Employee from "@/models/Employee";
import { normalizePhone } from "@/lib/phone";

const ALLOWED_ROLES = ["owner", "super-admin"];

// PATCH /api/owner/hr/interviews/[id] — "Mark as Joined" / unmark on the
// Selected page (Owner Panel v2, Part 5). There was no Interviewer<->Employee
// link for "did they actually join" — this adds one, matched by phone then
// exact name, same confident-match-only convention as
// scripts/link-employees-to-callby.mjs. Never guesses: no match -> a clear
// error, not a wrong link.
export async function PATCH(req, { params }) {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);
    if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    if (body.hiredEmployeeId === null) {
      const interview = await Interviewer.findByIdAndUpdate(id, { hiredEmployeeId: null }, { new: true });
      if (!interview) return NextResponse.json({ success: false, message: "Interview not found" }, { status: 404 });
      return NextResponse.json({ success: true, interview });
    }

    if (body.action !== "markJoined") {
      return NextResponse.json({ success: false, message: "Unsupported action" }, { status: 400 });
    }

    const interview = await Interviewer.findById(id).lean();
    if (!interview) return NextResponse.json({ success: false, message: "Interview not found" }, { status: 404 });
    if (interview.status !== "Selected") {
      return NextResponse.json({ success: false, message: "Only Selected candidates can be marked as joined" }, { status: 400 });
    }

    let employee = null;
    const normPhone = normalizePhone(interview.phone);
    if (normPhone) {
      const candidates = await Employee.find({ mergedInto: null }).select("name phone").lean();
      const phoneMatches = candidates.filter((e) => normalizePhone(e.phone) === normPhone);
      if (phoneMatches.length === 1) employee = phoneMatches[0];
      else if (phoneMatches.length === 0) {
        const nameMatches = candidates.filter((e) => e.name.trim().toLowerCase() === (interview.name || "").trim().toLowerCase());
        if (nameMatches.length === 1) employee = nameMatches[0];
      }
    }

    if (!employee) {
      return NextResponse.json(
        { success: false, message: `No confident Employee match by phone or name for "${interview.name}" — link them manually in Employees, then re-run.` },
        { status: 409 },
      );
    }

    const updated = await Interviewer.findByIdAndUpdate(id, { hiredEmployeeId: employee._id }, { new: true });
    return NextResponse.json({ success: true, interview: updated, employee: { name: employee.name } });
  } catch (err) {
    console.error("owner hr interview patch error:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
