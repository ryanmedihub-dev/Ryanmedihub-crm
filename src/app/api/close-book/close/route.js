import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import AccountPeriod from "@/models/AccountPeriod";
import { accountsSync } from "@/lib/masterData";
import { computePeriodFigures } from "@/lib/accountPeriods";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];

function parseAccounts(param) {
  if (!param) return accountsSync();
  const wanted = param.split(",").map((a) => a.trim()).filter(Boolean);
  return wanted.filter((a) => accountsSync().includes(a));
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }
    await connectDB();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const accounts = parseAccounts(searchParams.get("accounts"));
    if (!from || !to) {
      return NextResponse.json({ error: "from and to dates are required" }, { status: 400 });
    }
    if (new Date(from).getTime() >= new Date(to).getTime()) {
      return NextResponse.json(
        { error: "A closing period must span time — 'to' has to be after 'from'." },
        { status: 400 },
      );
    }

    const preview = await Promise.all(
      accounts.map(async (account) => {
        const figures = await computePeriodFigures(account, from, to);
        const existing = await AccountPeriod.findOne({
          account,
          branch: null,
          periodStart: new Date(from),
          periodEnd: new Date(to),
        }).lean();
        return {
          account,
          ...figures,
          alreadyClosed: !!existing?.isClosed,
          existingClosedAt: existing?.closedAt || null,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      period: { from, to },
      accounts: preview,
      grandTotal: preview.reduce(
        (a, p) => ({
          openingBalance: a.openingBalance + p.openingBalance,
          totalIn: a.totalIn + p.totalIn,
          totalOut: a.totalOut + p.totalOut,
          closingBalance: a.closingBalance + p.closingBalance,
          transactionCount: a.transactionCount + p.transactionCount,
        }),
        { openingBalance: 0, totalIn: 0, totalOut: 0, closingBalance: 0, transactionCount: 0 },
      ),
    });
  } catch (error) {
    console.error("Error previewing period close:", error);
    return NextResponse.json({ error: "Failed to preview period close" }, { status: 500 });
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

    const { from, to, accounts: requested, notes } = await req.json();
    const accounts = parseAccounts(Array.isArray(requested) ? requested.join(",") : requested);

    if (!from || !to) {
      return NextResponse.json({ error: "from and to dates are required" }, { status: 400 });
    }
    if (!accounts.length) {
      return NextResponse.json({ error: "Select at least one valid account" }, { status: 400 });
    }
    const periodStart = new Date(from);
    const periodEnd = new Date(to);
    if (periodStart.getTime() >= periodEnd.getTime()) {
      return NextResponse.json(
        { error: "A closing period must span time — 'to' has to be after 'from'." },
        { status: 400 },
      );
    }

    const actor = { name: session.user.name, email: session.user.email };

    const already = await AccountPeriod.find({
      account: { $in: accounts },
      branch: null,
      periodStart,
      periodEnd,
      isClosed: true,
    }).lean();
    if (already.length) {
      return NextResponse.json(
        {
          error: `Already closed for this period: ${already.map((a) => a.account).join(", ")}. Reopen before closing again.`,
          alreadyClosed: already.map((a) => a.account),
        },
        { status: 409 },
      );
    }

    const dbSession = await mongoose.startSession();
    let closed = [];
    try {
      await dbSession.withTransaction(async () => {
        closed = [];
        for (const account of accounts) {
          const figures = await computePeriodFigures(account, periodStart, periodEnd, dbSession);
          const [doc] = await AccountPeriod.findOneAndUpdate(
            { account, branch: null, periodStart, periodEnd },
            {
              $set: {
                account,
                branch: null,
                periodStart,
                periodEnd,
                ...figures,
                isClosed: true,
                closedBy: actor,
                closedAt: new Date(),
                notes: notes || "",
              },
              $push: {
                log: {
                  action: "Closed",
                  reason: notes || "Period closed",
                  newClosingBalance: figures.closingBalance,
                  performedBy: actor,
                  performedAt: new Date(),
                },
              },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true, session: dbSession },
          ).then((d) => [d]);
          closed.push(doc);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    await cacheInvalidate("finance", "owner", "reports");
    return NextResponse.json(
      {
        success: true,
        message: `Closed ${closed.length} account${closed.length === 1 ? "" : "s"} for this period`,
        periods: closed,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: "A snapshot already exists for one of these accounts and this period." },
        { status: 409 },
      );
    }
    console.error("Error closing period:", error);
    return NextResponse.json({ error: "Failed to close period" }, { status: 500 });
  }
}
