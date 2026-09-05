// One place for the guard order the Phase B brief specifies: session -> role -> branch
// scope -> period lock -> back-date guard -> duplicate-submit key. Used only by
// /api/entries/create — the legacy routes keep their own (already-audited, per-route)
// guard calls untouched; see AUDIT.md for what each legacy route currently does or skips.

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getEntryType } from "@/lib/entryEngine/registry";
import { checkPeriodLock } from "@/lib/periodLock";
import { backDateGuard } from "@/lib/backDateGuard";
import { COLLAB_BRANCHES } from "@/lib/branches";

export class GuardError extends Error {
  constructor(status, body) {
    super(body?.error || "Blocked");
    this.status = status;
    this.body = body;
  }
}

// Single-instance, best-effort de-dupe window — same caveat class as masterData/index.js's
// cache: a serverless deployment with multiple instances only catches duplicates that hit
// the same instance. A durable de-dupe table would be a schema addition; not introduced
// here without a separate proposal (see the response's "could not do" notes).
const recentSubmits = new Map();
const DUPLICATE_WINDOW_MS = 15_000;

function pruneRecentSubmits(now) {
  for (const [key, ts] of recentSubmits) {
    if (now - ts > DUPLICATE_WINDOW_MS) recentSubmits.delete(key);
  }
}

/**
 * Runs every guard for one /api/entries/create call, in the mandated order. Throws
 * GuardError (with .status/.body ready for NextResponse.json) on the first failure.
 * Returns { session } for the caller to thread into the entryCore function.
 */
export async function runGuards({ typeKey, draft, idempotencyKey }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new GuardError(401, { error: "Unauthorized" });

  const def = getEntryType(typeKey);
  if (!def) throw new GuardError(400, { error: `Unknown entry type "${typeKey}"` });
  if (!def.roles.includes(session.user.role)) {
    throw new GuardError(403, { error: "Forbidden — your role can't record this entry type" });
  }

  // Branch scope — new, additive: no legacy write route enforces this today (AUDIT.md
  // flagged it as unverified/absent everywhere). Mirrors resolveBranchFilter's existing
  // READ-side rule (lib/branches.js) rather than inventing a new policy: a "Collab" session
  // is pinned to a COLLAB_BRANCHES city, any other non-"All" branch session is pinned to
  // exactly that branch, admin/super-admin are unrestricted (matching every legacy route's
  // own ALLOWED_ROLES gate, which is already admin/super-admin for everything this scope
  // check would otherwise touch).
  const userBranch = session.user.branch;
  if (draft?.branch && userBranch && userBranch !== "All" && !["admin", "super-admin"].includes(session.user.role)) {
    if (userBranch === "Collab") {
      if (!COLLAB_BRANCHES.includes(draft.branch)) {
        throw new GuardError(403, { error: `Your session is scoped to collab branches; "${draft.branch}" isn't one.` });
      }
    } else if (draft.branch !== userBranch) {
      throw new GuardError(403, { error: `Your session is scoped to ${userBranch}; you can't record an entry for ${draft.branch}.` });
    }
  }

  const dateForLock = draft?.date ? new Date(draft.date) : new Date();
  const accountForLock = draft?.routing?.furtherMode || draft?.account || draft?.fromAccount || null;
  const lockReason = await checkPeriodLock({ furtherMode: accountForLock, date: dateForLock });
  if (lockReason) throw new GuardError(423, { error: lockReason, periodLocked: true });

  const backDateError = backDateGuard(session.user.role, dateForLock);
  if (backDateError) throw new GuardError(backDateError.status, backDateError.body);

  if (idempotencyKey) {
    const now = Date.now();
    pruneRecentSubmits(now);
    if (recentSubmits.has(idempotencyKey)) {
      throw new GuardError(409, {
        error: "This looks like a duplicate submission of the same entry — reload and check before retrying.",
      });
    }
    recentSubmits.set(idempotencyKey, now);
  }

  return { session };
}
