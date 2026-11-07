import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Patient from "@/models/Patient";
// side-effect import: registers the Employee schema for the populate() calls below
import "@/models/Employee";
import { requireSession } from "@/lib/apiGuard";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin", "admin", "surgery", "owner"];

export async function GET(req, { params }) {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    await connectDB();
    const { id } = await params;

    const patient = await Patient.findById(id)
      .populate("personal.reference", "name")
      .populate("counselling.counsellor", "name")
      .populate("surgery.doctor", "name")
      .populate("surgery.seniorTech", "name")
      .lean();

    if (!patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    // Branch authorization check
    const isPrivileged = ["super-admin", "admin", "owner"].includes(session.user.role);
    if (!isPrivileged && session.user.branch && session.user.branch !== "All") {
      if (patient.personal?.branch && patient.personal.branch !== session.user.branch) {
        return NextResponse.json(
          { error: "Forbidden: Access to patients outside your assigned branch is denied" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ patient });
  } catch (error) {
    console.error("Error fetching patient:", error);
    return NextResponse.json(
      { error: "Failed to fetch patient" },
      { status: 500 }
    );
  }
}

export async function PUT(req, { params }) {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    await connectDB();
    const { id } = await params;

    const existingPatient = await Patient.findById(id);
    if (!existingPatient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    // Branch authorization check
    const isPrivileged = ["super-admin", "admin", "owner"].includes(session.user.role);
    if (!isPrivileged && session.user.branch && session.user.branch !== "All") {
      if (existingPatient.personal?.branch && existingPatient.personal.branch !== session.user.branch) {
        return NextResponse.json(
          { error: "Forbidden: Modifying patients outside your assigned branch is denied" },
          { status: 403 }
        );
      }
    }

    const data = await req.json();

    const updateData = {};
    if (data.surgery) updateData.surgery = data.surgery;
    if (data.medical) updateData.medical = data.medical;
    if (data.documents) updateData.documents = data.documents;

    const patient = await Patient.findByIdAndUpdate(
      id,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );

    await cacheInvalidate("finance", "owner", "patients");

    return NextResponse.json({
      success: true,
      patient,
    });
  } catch (error) {
    console.error("Error updating patient:", error);
    return NextResponse.json(
      { error: "Failed to update patient" },
      { status: 500 }
    );
  }
}