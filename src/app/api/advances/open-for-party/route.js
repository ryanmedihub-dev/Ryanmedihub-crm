

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Advance, { ADVANCE_PARTY_KINDS } from "@/models/Advance";
import { totalSettledAmount, settlementLinesFor } from "@/lib/advanceSettlements";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["admin", "super-admin"];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const partyKind = searchParams.get("partyKind") || "";
    const partyRefId = searchParams.get("partyRefId") || "";
    const partyLabel = searchParams.get("partyLabel") || "";
    const branch = searchParams.get("branch") || "";

    const meta = {};
    const key = cacheKey("finance", { route: "advances-open-for-party", ...Object.fromEntries(searchParams) }, session);
    let data;
    try {
      data = await cached(key, 45, () => computeOpenAdvancesForParty({ partyKind, partyRefId, partyLabel, branch }), meta);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
    const res = NextResponse.json(data);
    res.headers.set("X-Cache", meta.status);
    return res;
  } catch (error) {
    console.error("Error listing open advances for party:", error);
    return NextResponse.json({ error: "Failed to list advances" }, { status: 500 });
  }
}

async function computeOpenAdvancesForParty({ partyKind, partyRefId, partyLabel, branch }) {
    if (!ADVANCE_PARTY_KINDS.includes(partyKind)) {
      throw NextResponse.json({ error: `partyKind must be one of: ${ADVANCE_PARTY_KINDS.join(", ")}` }, { status: 400 });
    }
    if (!partyRefId && !partyLabel) {
      throw NextResponse.json({ error: "partyRefId or partyLabel is required" }, { status: 400 });
    }

    const match = { direction: "OUT", isCancelled: { $ne: true }, "party.kind": partyKind };
    if (partyRefId) {
      if (!mongoose.Types.ObjectId.isValid(partyRefId)) {
        throw NextResponse.json({ error: "Invalid partyRefId" }, { status: 400 });
      }
      match["party.refId"] = new mongoose.Types.ObjectId(partyRefId);
    } else {
      match["party.label"] = partyLabel; 
    }
    if (branch) match.branch = branch;

    const rows = await Advance.find(match).sort({ date: 1 }).lean();
    if (rows.length === 0) {
      return { success: true, advances: [], totalRemaining: 0 };
    }

    
    const receivableIds = [...new Set(rows.map((r) => String(r.receivableId)))].map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const cashAgg = await Advance.aggregate([
      { $match: { receivableId: { $in: receivableIds }, direction: "IN", isCancelled: { $ne: true } } },
      { $group: { _id: "$receivableId", cash: { $sum: "$amount" } } },
    ]);
    const cashByReceivable = new Map(cashAgg.map((c) => [String(c._id), c.cash || 0]));

    const advances = [];
    for (const r of rows) {
      const settledTotal = totalSettledAmount(r);
      const cashRecovered = round2(cashByReceivable.get(String(r.receivableId)) || 0);
      const remaining = Math.max(0, round2(r.amount - settledTotal - cashRecovered));
      if (remaining <= 0.005) continue; 

      advances.push({
        _id: String(r._id),
        date: r.date,
        amount: round2(r.amount),
        account: r.account || "",
        branch: r.branch || null,
        reference: r.reference || "",
        remarks: r.remarks || "",
        receivableId: String(r.receivableId),
        settledTotal,
        cashRecovered,
        remaining,
        settlements: settlementLinesFor(r).map((l) => ({
          payableId: String(l.payableId),
          amount: l.amount,
          note: l.note || "",
          settledAt: l.settledAt,
        })),
        party: { kind: r.party?.kind, refId: r.party?.refId ? String(r.party.refId) : null, label: r.party?.label || "" },
      });
    }

    const totalRemaining = round2(advances.reduce((s, a) => s + a.remaining, 0));
    return { success: true, advances, totalRemaining };
}
