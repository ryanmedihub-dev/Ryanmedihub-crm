import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import { accountsSync } from "@/lib/masterData";
import { getAccountBalance } from "@/lib/accountBalances";
import { cacheKey, cached } from "@/lib/cache";

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

    const meta = {};
    const key = cacheKey("finance", { route: "account-transfers-balances", asOf }, session);
    const data = await cached(key, 45, async () => {
      const entries = await Promise.all(
        accountsSync().map(async (account) => [account, await getAccountBalance(account, asOf)]),
      );
      return { success: true, asOf, balances: Object.fromEntries(entries) };
    }, meta);
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error computing account balances:", error);
    return NextResponse.json({ error: "Failed to compute balances" }, { status: 500 });
  }
}
