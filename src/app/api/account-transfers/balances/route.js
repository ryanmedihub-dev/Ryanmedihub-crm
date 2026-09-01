import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { accountsSync } from "@/lib/masterData";
import { getAccountBalance } from "@/lib/accountBalances";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf") || new Date().toISOString();

    const entries = await Promise.all(
      accountsSync().map(async (account) => [account, await getAccountBalance(account, asOf)]),
    );

    return NextResponse.json({
      success: true,
      asOf,
      balances: Object.fromEntries(entries),
    });
  } catch (error) {
    console.error("Error computing account balances:", error);
    return NextResponse.json({ error: "Failed to compute balances" }, { status: 500 });
  }
}
