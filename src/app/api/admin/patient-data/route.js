import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions.js";
import { cacheKey, cached } from "@/lib/cache";
import { requireSession } from "@/lib/apiGuard";
import { COLLAB_BRANCHES } from "@/lib/branches";

// Roles authorized to view patient medical records
const ALLOWED_ROLES = [
  "super-admin",
  "admin",
  "owner",
  "surgery",
  "reception",
  "sales",
  "counsellor",
  "collab",
];

const handler = async (req) => {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Valid patient ID is required" 
        },
        { status: 400 }
      );
    }

    const isPrivileged = ["super-admin", "admin", "owner"].includes(session.user.role);
    const hasBranchRestriction = !isPrivileged && session.user.branch && session.user.branch !== "All";

    // Apply branch restrictions directly at database-query level
    const query = { _id: id };
    if (hasBranchRestriction) {
      if (session.user.branch === "Collab") {
        query["personal.branch"] = { $in: COLLAB_BRANCHES };
      } else {
        query["personal.branch"] = session.user.branch;
      }
    }

    const branchScope = hasBranchRestriction ? session.user.branch : "all";
    const meta = {};
    const key = cacheKey("patients", { route: "admin-patient-data", id, branch: branchScope });
    const patient = await cached(key, 30, () => Patient.findOne(query)
      .populate({
        path: 'personal.reference',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'counselling.counsellor',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'surgery.doctor',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'surgery.seniorTech',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'surgery.implanterRight',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'surgery.implanterLeft',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'surgery.graftingPerson',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'surgery.helper',
        select: 'name',
        model: 'Employee'
      })
      .populate({
        path: 'payments.transactions',
        select: 'date branch paymentType procedure method amount',
        model: 'Transactions'
      })
      .lean(), meta);

    if (!patient) {
      // Check if patient exists in another branch to accurately return 403 vs 404
      if (hasBranchRestriction) {
        const existsElsewhere = await Patient.exists({ _id: id });
        if (existsElsewhere) {
          return NextResponse.json(
            { 
              success: false, 
              error: "Forbidden: Access to patients outside your assigned branch is denied" 
            },
            { status: 403 }
          );
        }
      }
      return NextResponse.json(
        { 
          success: false, 
          error: "Patient not found" 
        },
        { status: 404 }
      );
    }

    // Defense-in-depth: in-memory branch verification
    if (hasBranchRestriction) {
      const patientBranch = patient.personal?.branch;
      if (session.user.branch === "Collab") {
        if (!COLLAB_BRANCHES.includes(patientBranch)) {
          return NextResponse.json(
            { 
              success: false, 
              error: "Forbidden: Access to patients outside your assigned branch is denied" 
            },
            { status: 403 }
          );
        }
      } else if (patientBranch && patientBranch !== session.user.branch) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Forbidden: Access to patients outside your assigned branch is denied" 
          },
          { status: 403 }
        );
      }
    }

    const res = NextResponse.json({
      patient,
      success: true,
    }, { status: 200 });
    res.headers.set("X-Cache", meta.status);
    return res;

  } catch (error) {
    console.error("Error fetching patient data:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch patient data",
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export const GET = withDB(handler);
