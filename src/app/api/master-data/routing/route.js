import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import BankRoutingRule from "@/models/BankRoutingRule";
import { invalidate } from "@/lib/masterData";
import { ALL_BRANCHES } from "@/lib/branches";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin", "owner"];
const CATEGORIES = ["TRANSPLANT", "SERVICE", "MEDICINE"];

function guard(session) {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: "Forbidden — super-admin only", status: 403 };
  }
  return null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();
  const rules = await BankRoutingRule.find({})
    .sort({ branch: 1, transactionCategory: 1, method: 1 })
    .lean();
  return NextResponse.json({ rules });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const body = await req.json();
  const branch = String(body.branch ?? "").trim();
  const transactionCategory = String(body.transactionCategory ?? "").trim();
  const method = String(body.method ?? "").trim();
  const receiptMode = String(body.receiptMode ?? "");
  const furtherMode = String(body.furtherMode ?? "");

  if (!ALL_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: `branch must be one of: ${ALL_BRANCHES.join(", ")}` }, { status: 400 });
  }
  if (!CATEGORIES.includes(transactionCategory)) {
    return NextResponse.json({ error: `transactionCategory must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (!method) return NextResponse.json({ error: "method is required" }, { status: 400 });

  const performedBy = { name: session.user.name, email: session.user.email };
  const existing = await BankRoutingRule.findOne({ branch, transactionCategory, method });

  if (existing) {
    const before = `${existing.receiptMode || "-"} / ${existing.furtherMode || "-"}`;
    existing.receiptMode = receiptMode;
    existing.furtherMode = furtherMode;
    existing.isActive = true;
    existing.log.push({
      action: "Updated",
      previousValue: before,
      newValue: `${receiptMode || "-"} / ${furtherMode || "-"}`,
      note: body.note || "Edited via Admin → Master Data → Bank Routing",
      performedBy,
      performedAt: new Date(),
    });
    await existing.save();
    invalidate();
    await cacheInvalidate("masterdata", "finance", "owner");
    return NextResponse.json({ message: "Rule updated", rule: existing.toObject() });
  }

  const rule = new BankRoutingRule({
    branch,
    transactionCategory,
    method,
    receiptMode,
    furtherMode,
    isActive: true,
    createdBy: { ...performedBy, branch: session.user.branch, date: new Date() },
    log: [
      {
        action: "Created",
        newValue: `${receiptMode || "-"} / ${furtherMode || "-"}`,
        note: body.note || "Created via Admin → Master Data → Bank Routing",
        performedBy,
        performedAt: new Date(),
      },
    ],
  });

  try {
    await rule.save();
  } catch (err) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "A rule for this branch / category / method already exists" }, { status: 409 });
    }
    if (err?.name === "ValidationError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  invalidate();
  await cacheInvalidate("masterdata", "finance", "owner");
  return NextResponse.json({ message: "Rule created", rule: rule.toObject() }, { status: 201 });
}
