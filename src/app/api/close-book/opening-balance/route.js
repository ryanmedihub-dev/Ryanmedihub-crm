import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import AccountPeriod from "@/models/AccountPeriod";
import { accountsSync } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";

const ALLOWED_ROLES = ["admin", "super-admin"];

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const branchParam = searchParams.get("branch") || "";
    if (branchParam && !ALL_BRANCHES.includes(branchParam)) {
      return NextResponse.json(
        { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` },
        { status: 400 },
      );
    }
    const branch = branchParam || null;

    const seeds = await AccountPeriod.find({
      account: { $in: accountsSync() },
      isClosed: true,
      totalIn: 0,
      totalOut: 0,
      transactionCount: 0,
    })
      .sort({ periodEnd: 1 })
      .lean();

    const pick = new Map();
    for (const s of seeds) {
      const key = `${s.account}|${s.branch ?? ""}`;
      if (!pick.has(key)) pick.set(key, s);
    }

    const branchesOf = (account) =>
      [...pick.values()]
        .filter((s) => s.account === account && s.branch)
        .map((s) => ({ branch: s.branch, openingBalance: s.openingBalance, asOf: s.periodEnd }));

    const openingBalances = accountsSync().map((account) => {
      const branchRows = branchesOf(account);

      if (!branch) {
        const companySeed = pick.get(`${account}|`);
        if (branchRows.length > 0) {
          const total = branchRows.reduce((t, b) => t + (b.openingBalance || 0), 0);
          return {
            account,
            branch: null,
            openingBalance: Math.round(total * 100) / 100,
            asOf: branchRows.reduce((l, b) => (!l || b.asOf > l ? b.asOf : l), null),
            notes: "",
            set: true,
            derivedFromBranches: true,
            branches: branchRows,
          };
        }
        return {
          account,
          branch: null,
          openingBalance: companySeed?.openingBalance ?? null,
          asOf: companySeed?.periodEnd ?? null,
          notes: companySeed?.notes || "",
          set: !!companySeed,
          derivedFromBranches: false,
          branches: [],
        };
      }

      const s = pick.get(`${account}|${branch}`);
      return {
        account,
        branch,
        openingBalance: s?.openingBalance ?? null,
        asOf: s?.periodEnd ?? null,
        notes: s?.notes || "",
        set: !!s,
        derivedFromBranches: false,
        branches: branchRows,
      };
    });

    return NextResponse.json({ success: true, branch, openingBalances });
  } catch (error) {
    console.error("Error reading opening balances:", error);
    return NextResponse.json({ error: "Failed to read opening balances" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { account, openingBalance, asOf, notes, branch: branchInput } = await req.json();

    if (!accountsSync().includes(account)) {
      return NextResponse.json(
        { error: `account must be one of: ${accountsSync().join(", ")}` },
        { status: 400 },
      );
    }
    if (branchInput && !ALL_BRANCHES.includes(branchInput)) {
      return NextResponse.json(
        { error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` },
        { status: 400 },
      );
    }
    const branch = branchInput || null;
    const amount = Number(openingBalance);
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "openingBalance must be a number" }, { status: 400 });
    }
    if (!asOf) {
      return NextResponse.json({ error: "asOf date is required" }, { status: 400 });
    }
    const asOfDate = new Date(asOf);
    if (Number.isNaN(asOfDate.getTime())) {
      return NextResponse.json({ error: "asOf is not a valid date" }, { status: 400 });
    }

    const seed = await AccountPeriod.findOneAndUpdate(
      { account, branch, periodStart: asOfDate, periodEnd: asOfDate },
      {
        $set: {
          account,
          branch,
          periodStart: asOfDate,
          periodEnd: asOfDate,
          openingBalance: amount,
          totalIn: 0,
          totalOut: 0,
          closingBalance: amount,
          transactionCount: 0,
          isClosed: true,
          closedBy: { name: session.user.name, email: session.user.email },
          closedAt: new Date(),
          notes:
            notes ||
            (branch
              ? `Manually entered opening balance — ${branch}`
              : "Manually entered opening balance"),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ success: true, openingBalance: seed }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: "An opening balance already exists for this account and date." },
        { status: 409 },
      );
    }
    console.error("Error saving opening balance:", error);
    return NextResponse.json({ error: "Failed to save opening balance" }, { status: 500 });
  }
}
