import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { getOpeningBalances, computeContraMovements, computeSuspenseMovements, round2 } from "@/lib/accountBalances";

const ALLOWED_ROLES = ["admin", "super-admin"];
const LOAN_ACCOUNTS = ["Bajaj Loan", "Fibe Loan"];
const CASH_ACCOUNTS = accountsSync().filter((a) => !LOAN_ACCOUNTS.includes(a));

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || new Date().toISOString();
    const branchParam = searchParams.get("branch") || "";
    const branch = branchParam && ALL_BRANCHES.includes(branchParam) ? branchParam : null;

    if (!from) {
      return NextResponse.json({ error: "from is required" }, { status: 400 });
    }

    const toPlusInstant = new Date(new Date(to).getTime() + 1);

    const [openings, closings, contraRows, suspenseRows] = await Promise.all([
      getOpeningBalances(CASH_ACCOUNTS, from, branch),
      getOpeningBalances(CASH_ACCOUNTS, toPlusInstant, branch),
      Promise.all(CASH_ACCOUNTS.map((a) => computeContraMovements(a, from, to, null, branch))),
      Promise.all(CASH_ACCOUNTS.map((a) => computeSuspenseMovements(a, from, to, null, branch))),
    ]);

    const opening = round2(
      CASH_ACCOUNTS.reduce((s, a) => s + (openings[a]?.openingBalance || 0), 0),
    );
    const closing = round2(
      CASH_ACCOUNTS.reduce((s, a) => s + (closings[a]?.openingBalance || 0), 0),
    );
    const contraNet = round2(contraRows.reduce((s, c) => s + (c.totalIn - c.totalOut), 0));
    const suspenseNet = round2(suspenseRows.reduce((s, c) => s + (c.totalIn - c.totalOut), 0));

    return NextResponse.json({ success: true, opening, closing, contraNet, suspenseNet });
  } catch (error) {
    console.error("Error building receipts/payments reconciliation:", error);
    return NextResponse.json({ error: "Failed to build reconciliation" }, { status: 500 });
  }
}
