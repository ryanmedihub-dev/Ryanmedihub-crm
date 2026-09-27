import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { runGuards, GuardError } from "@/lib/entryCore/guards";
import { dispatchEntry } from "@/lib/entryCore";
import { validateEntry } from "@/lib/entryEngine/validate";
import { nonCashMethodsSync, unsettledMethodsSync } from "@/lib/masterData";
import { cacheInvalidate } from "@/lib/cache";

export async function POST(req) {
  try {
    const body = await req.json();
    const { type, draft, documentId, idempotencyKey } = body || {};

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "A registry `type` is required" }, { status: 400 });
    }

    await connectDB();

    let session;
    try {
      ({ session } = await runGuards({ typeKey: type, draft, idempotencyKey }));
    } catch (err) {
      if (err instanceof GuardError) return NextResponse.json(err.body, { status: err.status });
      throw err;
    }

    const masterData = { nonCashMethods: nonCashMethodsSync(), unsettledMethods: unsettledMethodsSync() };
    const validationError = validateEntry(draft || {}, type, { masterData });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const { buildPayload } = await import("@/lib/entryEngine/buildPayload");
    const payload = buildPayload(draft || {}, type, body.context || {});

    const result = await dispatchEntry(type, { payload, session, documentId });
    if (result?.error) {
      return NextResponse.json(
        { error: result.error, ...(result.periodLocked ? { periodLocked: true } : {}), ...(result.pending !== undefined ? { pending: result.pending } : {}) },
        { status: result.status || 400 },
      );
    }

    await cacheInvalidate("finance", "owner", "patients");
    const { status, ...rest } = result;
    return NextResponse.json({ success: true, ...rest }, { status: status || 201 });
  } catch (error) {
    console.error("Error recording entry via /api/entries/create:", error);
    return NextResponse.json({ error: error?.message || "Failed to record entry" }, { status: 500 });
  }
}
