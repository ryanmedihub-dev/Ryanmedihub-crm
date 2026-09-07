// Superset of /api/transactions/expense/create — same body, plus
// `advanceSettlements: [{ advanceId, amount }]`. With no settlements it delegates straight to
// createExpense(), so the form can always post here. All real work is in
// src/lib/entryCore/createExpenseWithSettlement.js.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { backDateGuard } from "@/lib/backDateGuard";
import { createExpenseWithSettlement } from "@/lib/entryCore/createExpenseWithSettlement";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();
    const payload = await req.json();

    const backDateError = backDateGuard(session.user.role, payload.date);
    if (backDateError) return NextResponse.json(backDateError.body, { status: backDateError.status });

    const res = await createExpenseWithSettlement({ payload, session });
    if (res.error) {
      return NextResponse.json(
        { error: res.error, ...(res.periodLocked ? { periodLocked: true } : {}) },
        { status: res.status || 400 },
      );
    }
    return NextResponse.json({ success: true, ...res.data }, { status: res.status || 201 });
  } catch (error) {
    console.error("Error creating expense with settlement:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}
