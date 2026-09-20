import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import BankRoutingRule from "@/models/BankRoutingRule";
import { invalidate } from "@/lib/masterData";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin", "owner"];

function guard(session) {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: "Forbidden — super-admin only", status: 403 };
  }
  return null;
}

// PATCH /api/master-data/routing/:id  — edit a rule's receiptMode / furtherMode / isActive.
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const rule = await BankRoutingRule.findById(id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const performedBy = { name: session.user.name, email: session.user.email };
  const before = `${rule.receiptMode || "-"} / ${rule.furtherMode || "-"} (${rule.isActive ? "active" : "retired"})`;
  let changed = false;

  if (body.receiptMode !== undefined) {
    rule.receiptMode = String(body.receiptMode ?? "");
    changed = true;
  }
  if (body.furtherMode !== undefined) {
    rule.furtherMode = String(body.furtherMode ?? "");
    changed = true;
  }
  if (body.isActive !== undefined && !!body.isActive !== rule.isActive) {
    rule.isActive = !!body.isActive;
    changed = true;
  }

  if (!changed) return NextResponse.json({ message: "No changes", rule: rule.toObject() });

  rule.log.push({
    action: body.isActive === false ? "Retired" : body.isActive === true ? "Restored" : "Updated",
    previousValue: before,
    newValue: `${rule.receiptMode || "-"} / ${rule.furtherMode || "-"} (${rule.isActive ? "active" : "retired"})`,
    note: body.note || "Edited via Admin → Master Data → Bank Routing",
    performedBy,
    performedAt: new Date(),
  });

  try {
    await rule.save();
  } catch (err) {
    if (err?.name === "ValidationError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  invalidate();
  await cacheInvalidate("masterdata", "finance", "owner");
  return NextResponse.json({ message: "Rule updated", rule: rule.toObject() });
}

// DELETE /api/master-data/routing/:id  — a routing rule has no downstream references, so a hard
// delete is safe: the cell simply reverts to the blank pre-fill.
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const rule = await BankRoutingRule.findById(id).lean();
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await BankRoutingRule.deleteOne({ _id: id });
  invalidate();
  await cacheInvalidate("masterdata", "finance", "owner");
  return NextResponse.json({
    message: "Rule deleted",
    deleted: {
      _id: rule._id,
      branch: rule.branch,
      transactionCategory: rule.transactionCategory,
      method: rule.method,
    },
  });
}
