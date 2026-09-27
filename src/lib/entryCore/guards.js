

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

const recentSubmits = new Map();
const DUPLICATE_WINDOW_MS = 15_000;

function pruneRecentSubmits(now) {
  for (const [key, ts] of recentSubmits) {
    if (now - ts > DUPLICATE_WINDOW_MS) recentSubmits.delete(key);
  }
}

export async function runGuards({ typeKey, draft, idempotencyKey }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new GuardError(401, { error: "Unauthorized" });

  const def = getEntryType(typeKey);
  if (!def) throw new GuardError(400, { error: `Unknown entry type "${typeKey}"` });
  if (!def.roles.includes(session.user.role)) {
    throw new GuardError(403, { error: "Forbidden — your role can't record this entry type" });
  }

  
  
  
  
  
  
  
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
