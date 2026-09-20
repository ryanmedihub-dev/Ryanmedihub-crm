import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import MasterData from "@/models/MasterData";
import MasterDataAudit from "@/models/MasterDataAudit";
import { invalidate } from "@/lib/masterData";
import {
  computeUsage,
  computeAccountReferences,
  hasPayablesUnderCategory,
  computeMethodFlagImpact,
} from "@/lib/masterData/guardrails";
import { cacheInvalidate } from "@/lib/cache";

const ALLOWED_ROLES = ["super-admin", "owner"];

function guard(session) {
  if (!session?.user) return { error: "Unauthorized", status: 401 };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: "Forbidden — super-admin only", status: 403 };
  }
  return null;
}

// PATCH /api/master-data/:id
export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await MasterData.findById(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const performedBy = { name: session.user.name, email: session.user.email };

  // value is immutable — changing it would orphan every document holding it.
  if (body.value !== undefined && String(body.value) !== row.value) {
    return NextResponse.json(
      { error: "`value` is immutable. Rename the label instead; retire this row and create a new one if the stored value must change." },
      { status: 400 },
    );
  }

  // System rows: label and sortOrder only.
  if (row.isSystem) {
    const allowed = new Set(["label", "sortOrder", "value", "note", "confirmImpact"]);
    const attempted = Object.keys(body).filter((k) => !allowed.has(k));
    if (attempted.length) {
      return NextResponse.json(
        {
          error: `"${row.value}" is a system value — only its label and sort order can change (blocked: ${attempted.join(", ")}). Code depends on this value by name.`,
        },
        { status: 403 },
      );
    }
  }

  const logs = [];
  const auditRecords = [];

  // --- label -------------------------------------------------------------------------------
  if (body.label !== undefined) {
    const next = String(body.label).trim();
    if (!next) return NextResponse.json({ error: "label cannot be blank" }, { status: 400 });
    if (next !== row.label) {
      logs.push({ action: "Label Changed", previousValue: row.label, newValue: next });
      row.label = next;
    }
  }

  // --- sortOrder -------------------------------------------------------------------------
  if (body.sortOrder !== undefined && Number.isFinite(body.sortOrder) && body.sortOrder !== row.sortOrder) {
    logs.push({ action: "Sort Changed", previousValue: String(row.sortOrder), newValue: String(body.sortOrder) });
    row.sortOrder = body.sortOrder;
  }

  // --- parent (EXPENSE_SUBTYPE re-home) -----------------------------------------------
  if (body.parent !== undefined && row.kind === "EXPENSE_SUBTYPE") {
    const next = String(body.parent).trim() || null;
    if (next !== row.parent) {
      if (next) {
        const parentRow = await MasterData.findOne({ kind: "EXPENSE_CATEGORY", value: next }).lean();
        if (!parentRow) {
          return NextResponse.json({ error: `parent category "${next}" does not exist` }, { status: 400 });
        }
      }
      logs.push({ action: "Note Added", note: `Re-homed from "${row.parent}" to "${next}"` });
      row.parent = next;
    }
  }

  // --- settlementType (EXPENSE_CATEGORY) — blocked while payables exist ---------------
  if (body.settlementType !== undefined && row.kind === "EXPENSE_CATEGORY") {
    const next = body.settlementType || null;
    if (next !== (row.settlementType || null)) {
      if (await hasPayablesUnderCategory(row.value)) {
        return NextResponse.json(
          {
            error: `Cannot reclassify "${row.value}" — payables already exist under this category. Changing DIRECT/PAYABLE would reclassify money already raised.`,
          },
          { status: 409 },
        );
      }
      auditRecords.push({ field: "settlementType", previousValue: String(row.settlementType || ""), newValue: String(next || ""), affectedCount: 0 });
      logs.push({ action: "Classification Changed", previousValue: String(row.settlementType || "—"), newValue: String(next || "—") });
      row.settlementType = next;
    }
  }

  // --- ownedElsewhere / payablePurpose (EXPENSE_CATEGORY) ---------------------------
  if (body.ownedElsewhere !== undefined && row.kind === "EXPENSE_CATEGORY" && !!body.ownedElsewhere !== !!row.ownedElsewhere) {
    logs.push({ action: "Note Added", note: `ownedElsewhere ${row.ownedElsewhere} → ${!!body.ownedElsewhere}` });
    row.ownedElsewhere = !!body.ownedElsewhere;
  }
  if (body.payablePurpose !== undefined && row.kind === "EXPENSE_CATEGORY" && (body.payablePurpose || null) !== (row.payablePurpose || null)) {
    logs.push({ action: "Purpose Changed", previousValue: String(row.payablePurpose || "—"), newValue: String(body.payablePurpose || "—") });
    row.payablePurpose = body.payablePurpose || null;
  }

  // --- appliesTo (PAYMENT_METHOD) ---------------------------------------------------
  if (body.appliesTo !== undefined && row.kind === "PAYMENT_METHOD" && body.appliesTo !== row.appliesTo) {
    if (!["REVENUE", "EXPENSE", "BOTH"].includes(body.appliesTo)) {
      return NextResponse.json({ error: "appliesTo must be REVENUE, EXPENSE or BOTH" }, { status: 400 });
    }
    logs.push({ action: "Note Added", note: `appliesTo ${row.appliesTo} → ${body.appliesTo}` });
    row.appliesTo = body.appliesTo;
  }

  // --- isNonCash / isUnsettled (PAYMENT_METHOD) — gated by impact + confirm --------
  const flagChanges = [];
  for (const flag of ["isNonCash", "isUnsettled"]) {
    if (body[flag] !== undefined && row.kind === "PAYMENT_METHOD" && !!body[flag] !== !!row[flag]) {
      flagChanges.push(flag);
    }
  }
  if (flagChanges.length) {
    if (body.confirmImpact !== true) {
      return NextResponse.json(
        {
          error: "Changing a behavioural flag retroactively changes the accounting treatment of every existing transaction on this method. Re-send with confirmImpact: true.",
          requiresConfirm: true,
        },
        { status: 428 },
      );
    }
    const next = {
      isNonCash: body.isNonCash !== undefined ? !!body.isNonCash : row.isNonCash,
      isUnsettled: body.isUnsettled !== undefined ? !!body.isUnsettled : row.isUnsettled,
    };
    const impact = await computeMethodFlagImpact(
      row.value,
      { isNonCash: row.isNonCash, isUnsettled: row.isUnsettled },
      next,
    );
    for (const flag of flagChanges) {
      auditRecords.push({
        field: flag,
        previousValue: String(!!row[flag]),
        newValue: String(!!next[flag]),
        affectedCount: impact.transactionCount,
        impact,
      });
      logs.push({ action: "Flag Changed", previousValue: `${flag}=${!!row[flag]}`, newValue: `${flag}=${!!next[flag]}` });
      row[flag] = next[flag];
    }
  }

  // --- isActive (retire / restore) -------------------------------------------------
  if (body.isActive !== undefined && !!body.isActive !== row.isActive) {
    if (row.isActive) {
      const usage = await computeUsage(row.kind, row.value);
      logs.push({ action: "Retired", note: `Retired with ${usage.total} live reference(s). Value stays valid on existing documents.` });
      row.isActive = false;
    } else {
      logs.push({ action: "Restored", note: "Re-activated — value is a picker option again." });
      row.isActive = true;
    }
  }

  if (!logs.length) {
    return NextResponse.json({ message: "No changes", row: row.toObject() });
  }

  const now = new Date();
  for (const l of logs) row.log.push({ ...l, performedBy, performedAt: now });

  try {
    await row.save();
  } catch (err) {
    if (err?.name === "ValidationError") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (auditRecords.length) {
    await MasterDataAudit.insertMany(
      auditRecords.map((a) => ({
        kind: row.kind,
        value: row.value,
        masterDataId: row._id,
        performedBy: { ...performedBy, role: session.user.role },
        ...a,
      })),
    );
  }

  invalidate();
  await cacheInvalidate("masterdata", "finance", "owner");
  return NextResponse.json({ message: "Updated", row: row.toObject() });
}

// DELETE /api/master-data/:id  — hard delete, only when nothing references the value.
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  const denied = guard(session);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  await connectDB();

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await MasterData.findById(id).lean();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.isSystem) {
    return NextResponse.json(
      { error: `"${row.value}" is a system value — it can never be deleted. Code branches on it by name.` },
      { status: 403 },
    );
  }

  // A category with sub-types would orphan them.
  if (row.kind === "EXPENSE_CATEGORY") {
    const children = await MasterData.countDocuments({ kind: "EXPENSE_SUBTYPE", parent: row.value });
    if (children > 0) {
      return NextResponse.json(
        { error: `"${row.value}" still has ${children} sub-type(s). Delete or re-home them first.` },
        { status: 409 },
      );
    }
  }

  const usage = await computeUsage(row.kind, row.value);
  const accountRefs = row.kind === "ACCOUNT" ? await computeAccountReferences(row.value) : null;
  const blockingTotal = accountRefs ? accountRefs.total : usage.total;

  if (blockingTotal > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${row.value}" — it is referenced by ${blockingTotal} document(s). Retire it instead (it stays valid on those documents and disappears from every picker).`,
        usage: usage.byCollection,
        ...(accountRefs ? { references: accountRefs.blocking } : {}),
      },
      { status: 409 },
    );
  }

  // Re-check inside a transaction so a concurrent write can't slip a reference in.
  const dbSession = await mongoose.startSession();
  try {
    let deleted = false;
    await dbSession.withTransaction(async () => {
      const recheck = await computeUsage(row.kind, row.value);
      const recheckAccount =
        row.kind === "ACCOUNT" ? await computeAccountReferences(row.value) : null;
      if ((recheckAccount ? recheckAccount.total : recheck.total) > 0) {
        throw new Error("__NOW_REFERENCED__");
      }
      await MasterData.deleteOne({ _id: id }).session(dbSession);
      deleted = true;
    });
    if (!deleted) throw new Error("__NOT_DELETED__");
  } catch (err) {
    if (err?.message === "__NOW_REFERENCED__") {
      return NextResponse.json(
        { error: "A reference to this value was created while deleting. Retire it instead." },
        { status: 409 },
      );
    }
    throw err;
  } finally {
    await dbSession.endSession();
  }

  invalidate();
  await cacheInvalidate("masterdata", "finance", "owner");
  return NextResponse.json({ message: "Deleted", deleted: { _id: row._id, kind: row.kind, value: row.value } });
}
