import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import Receivable, { RECEIVABLE_KIND_VALUES, RECEIVABLE_PURPOSE_VALUES } from "@/models/Receivable";
import { ALL_BRANCHES } from "@/lib/branches";
import { checkPeriodLock } from "@/lib/periodLock";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];
const PATIENT_REQUIRED_PURPOSES = ["PATIENT_DUE", "REFUND_DUE", "ADVANCE_RECOVERY"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const {
      payer,
      purpose,
      revenueCategory,
      period,
      relatedPatient,
      totalAmount,
      dueDate,
      branch,
      remarks,
      costAlreadyRecognised,
      receipts,
    } = await req.json();

    if (!payer?.kind || !payer?.label || !purpose || !totalAmount || totalAmount <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!RECEIVABLE_KIND_VALUES.includes(payer.kind)) {
      return NextResponse.json({ error: "Invalid payer.kind" }, { status: 400 });
    }
    if (!RECEIVABLE_PURPOSE_VALUES.includes(purpose)) {
      return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
    }
    const REFID_REQUIRED_KINDS = ["PATIENT", "EMPLOYEE", "VENDOR"];
    if (REFID_REQUIRED_KINDS.includes(payer.kind) && !payer.refId) {
      return NextResponse.json(
        { error: `payer.refId is required when payer.kind is "${payer.kind}"` },
        { status: 400 },
      );
    }
    if (PATIENT_REQUIRED_PURPOSES.includes(purpose) && !relatedPatient) {
      return NextResponse.json(
        { error: "relatedPatient is required for this purpose" },
        { status: 400 },
      );
    }
    if (branch && !ALL_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
    }
    const lockReason = await checkPeriodLock({ furtherMode: null, date: dueDate || new Date() });
    if (lockReason) {
      return NextResponse.json({ error: lockReason, periodLocked: true }, { status: 423 });
    }

    const performedBy = { name: session.user.name, email: session.user.email };

    const receivable = new Receivable({
      payer: {
        kind: payer.kind,
        refId: payer.refId || null,
        label: payer.label,
      },
      purpose,
      revenueCategory,
      period: period?.month && period?.year ? period : undefined,
      relatedPatient: relatedPatient || undefined,
      totalAmount: parseFloat(totalAmount),
      
      
      dueDate: dueDate ? new Date(dueDate) : new Date(),
      branch: branch || session.user.branch,
      remarks: remarks || "",
      costAlreadyRecognised: costAlreadyRecognised === true,
      receipts: receipts || [],
      createdBy: {
        name: session.user.name,
        email: session.user.email,
        branch: session.user.branch,
        date: new Date(),
      },
    });

    receivable.log.push({
      action: "Created",
      newValue: String(receivable.totalAmount),
      performedBy,
      performedAt: new Date(),
    });

    await receivable.save();

    await cacheInvalidate("finance", "owner");
    return NextResponse.json({ message: "Receivable created", receivable }, { status: 201 });
  } catch (error) {
    console.error("Error creating receivable:", error);
    return NextResponse.json({ error: "Failed to create receivable" }, { status: 500 });
  }
}
