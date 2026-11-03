import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Patient from "@/models/Patient";
import Employee from "@/models/Employee";
import Transactions from "@/models/Transactions";
import { requireSession, resolveBranchScope } from "@/lib/apiGuard";

const ALLOWED_ROLES = ["super-admin", "admin", "sales", "owner"];

const handler = async (req) => {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const requestedBranch = searchParams.get("branch");
    const branchFilter = resolveBranchScope(session, requestedBranch, "personal.branch");

    const search = searchParams.get("search")?.trim();
    const query = { ...branchFilter };

    if (search) {
      query.$or = [
        { "personal.name": { $regex: search, $options: "i" } },
        { "personal.phone": { $regex: search, $options: "i" } },
      ];
    }

    const [patients, total] = await Promise.all([
      Patient.find(query)
        .select("personal ops counselling payments surgery.surgeryDate surgery.technique surgery.doctor createdAt updatedAt")
        .populate({
          path: "personal.reference",
          select: "name",
          model: "Employee",
        })
        .populate({
          path: "counselling.counsellor",
          select: "name",
          model: "Employee",
        })
        .populate({
          path: "surgery.doctor",
          select: "name",
          model: "Employee",
        })
        .populate({
          path: "payments.transactions",
          select: "amount paymentMode date",
          model: "Transactions",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Patient.countDocuments(query),
    ]);

    const patientsWithSummary = patients.map((patient) => {
      const totalAmount = patient.payments?.totalAmount || 0;
      const amountReceived = patient.payments?.amountReceived || 0;
      const pendingAmount = totalAmount - amountReceived;
      const paymentStatus =
        pendingAmount === 0 ? "PAID" : pendingAmount === totalAmount ? "UNPAID" : "PARTIAL";

      return {
        ...patient,
        payments: {
          ...(patient.payments || {}),
          pendingAmount,
          paymentStatus,
        },
      };
    });

    return NextResponse.json(
      {
        patients: patientsWithSummary,
        success: true,
        count: patientsWithSummary.length,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching sales patients:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch patients",
      },
      { status: 500 }
    );
  }
};

export const GET = withDB(handler);