import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import MasterData, { MASTER_DATA_KINDS } from "@/models/MasterData";
import { invalidate } from "@/lib/masterData";
import { computeUsage } from "@/lib/masterData/guardrails";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin", "owner"];

function guard(session) {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: "Forbidden — super-admin only", status: 403 };
  }
  return null;
}

// GET /api/master-data?kind=PAYMENT_METHOD&withUsage=1
// Admin table feed: every row (active + retired) for one kind, optionally with usage counts.
export async function GET(req) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const withUsage = searchParams.get("withUsage") === "1";

  const query = {};
  if (kind) {
    if (!MASTER_DATA_KINDS.includes(kind)) {
      return NextResponse.json({ error: `Unknown kind "${kind}"` }, { status: 400 });
    }
    query.kind = kind;
  }

  const rows = await MasterData.find(query).sort({ kind: 1, sortOrder: 1, value: 1 }).lean();

  let usage = null;
  if (withUsage) {
    const counts = await Promise.all(rows.map((r) => computeUsage(r.kind, r.value)));
    usage = {};
    rows.forEach((r, i) => (usage[r._id] = counts[i]));
  }

  return NextResponse.json({ rows, usage });
}

// POST /api/master-data  — create a new master-data row.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const body = await req.json();
  const kind = body.kind;
  const value = String(body.value ?? "").trim();
  const label = String(body.label ?? "").trim();

  if (!MASTER_DATA_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${MASTER_DATA_KINDS.join(", ")}` }, { status: 400 });
  }
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  const isSubType = kind === "EXPENSE_SUBTYPE";
  const parent = isSubType ? String(body.parent ?? "").trim() || null : null;
  if (isSubType && !parent) {
    return NextResponse.json({ error: "EXPENSE_SUBTYPE requires a parent category value" }, { status: 400 });
  }
  if (isSubType) {
    const parentRow = await MasterData.findOne({ kind: "EXPENSE_CATEGORY", value: parent }).lean();
    if (!parentRow) {
      return NextResponse.json({ error: `parent category "${parent}" does not exist` }, { status: 400 });
    }
  }

  const performedBy = { name: session.user.name, email: session.user.email };

  const doc = new MasterData({
    kind,
    value,
    label,
    parent,
    // Category-only classification fields — ignored by the schema for other kinds, but only
    // meaningful for EXPENSE_CATEGORY.
    settlementType: kind === "EXPENSE_CATEGORY" ? body.settlementType ?? null : null,
    ownedElsewhere: kind === "EXPENSE_CATEGORY" ? !!body.ownedElsewhere : false,
    payablePurpose: kind === "EXPENSE_CATEGORY" ? body.payablePurpose ?? null : null,
    // Method-only behavioural flags.
    isNonCash: kind === "PAYMENT_METHOD" ? !!body.isNonCash : false,
    isUnsettled: kind === "PAYMENT_METHOD" ? !!body.isUnsettled : false,
    appliesTo: kind === "PAYMENT_METHOD" ? body.appliesTo || "BOTH" : "BOTH",
    // A new row is never a system row — that flag is set only by the seed.
    isSystem: false,
    isActive: true,
    sortOrder: Number.isFinite(body.sortOrder) ? body.sortOrder : 0,
    createdBy: { ...performedBy, branch: session.user.branch, date: new Date() },
    log: [
      {
        action: "Created",
        newValue: value,
        note: body.note || "Created via Admin → Master Data",
        performedBy,
        performedAt: new Date(),
      },
    ],
  });

  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: `A ${kind} with value "${value}"${parent ? ` under "${parent}"` : ""} already exists` },
        { status: 409 },
      );
    }
    if (err?.name === "ValidationError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  invalidate();
  await cacheInvalidate("masterdata", "finance", "owner");
  return NextResponse.json({ message: "Created", row: doc.toObject() }, { status: 201 });
}
