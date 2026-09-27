import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import MasterData from "@/models/MasterData";
import Payable from "@/models/Payable";
import {
  computeUsage,
  computeAccountReferences,
  computeMethodFlagImpact,
} from "@/lib/masterData/guardrails";

const ALLOWED_ROLES = ["super-admin", "owner"];

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden — super-admin only" }, { status: 403 });
  }

  await connectDB();

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const row = await MasterData.findById(id).lean();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const usage = await computeUsage(row.kind, row.value);
  const out = { kind: row.kind, value: row.value, label: row.label, usage };

  if (row.kind === "ACCOUNT") {
    out.accountReferences = await computeAccountReferences(row.value);
  }

  if (row.kind === "PAYMENT_METHOD" && (searchParams.has("isNonCash") || searchParams.has("isUnsettled"))) {
    const next = {};
    if (searchParams.has("isNonCash")) next.isNonCash = searchParams.get("isNonCash") === "true";
    if (searchParams.has("isUnsettled")) next.isUnsettled = searchParams.get("isUnsettled") === "true";
    out.flagImpact = await computeMethodFlagImpact(
      row.value,
      { isNonCash: row.isNonCash, isUnsettled: row.isUnsettled },
      next,
    );
  }

  if (row.kind === "EXPENSE_CATEGORY" && searchParams.has("settlementType")) {
    const requested = searchParams.get("settlementType") || null;
    const payableCount = await Payable.countDocuments({
      expenseCategory: row.value,
      isCancelled: { $ne: true },
    });
    out.settlementTypeChange = {
      from: row.settlementType || null,
      to: requested,
      payableCount,
      blocked: payableCount > 0,
    };
  }

  return NextResponse.json(out);
}
