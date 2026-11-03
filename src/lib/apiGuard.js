/**
 * src/lib/apiGuard.js
 *
 * Lightweight server-side auth & branch scoping helpers for API route handlers.
 * Every sensitive API must call one of these independently of the proxy/middleware.
 */

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { COLLAB_BRANCHES } from "@/lib/branches";

// All recognised internal roles
export const ALL_ROLES = [
  "super-admin", "admin", "sales", "reception",
  "collab", "surgery", "counsellor", "stock", "hr", "owner"
];

/**
 * Resolves the current NextAuth session.
 * Returns { session } on success, or { error: NextResponse } on failure.
 *
 * @param {string[]} [allowedRoles]  If supplied, the session role must be in this list.
 * @returns {Promise<{ session?: object, error?: NextResponse }>}
 */
export async function requireSession(allowedRoles) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Unauthorized. Please sign in." },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(session.user.role)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Forbidden. Insufficient role permissions." },
        { status: 403 }
      ),
    };
  }

  return { session };
}

/**
 * Convenience guard for super-admin only endpoints.
 */
export async function requireSuperAdmin() {
  return requireSession(["super-admin"]);
}

/**
 * Convenience guard for admin, super-admin, or owner.
 */
export async function requireAdmin() {
  return requireSession(["super-admin", "admin", "owner"]);
}

/**
 * Convenience guard for any authenticated internal user regardless of role.
 */
export async function requireAuth() {
  return requireSession(ALL_ROLES);
}

/**
 * Enforces branch scoping on MongoDB queries based on user's assigned branch.
 *
 * - Admin/super-admin/owner: can query any requested branch (or "All" = unrestricted).
 * - Collab branch user: restricted to COLLAB_BRANCHES (or requested collab branch).
 * - Specific branch user: always locked to their assigned branch, ignoring any override attempt.
 *
 * @param {object} session The NextAuth session object
 * @param {string|null} [requestedBranch] The branch requested in query parameters or request body
 * @param {string} [field="personal.branch"] The MongoDB field to filter on
 * @returns {object} MongoDB query filter object, e.g. { "personal.branch": "Delhi" }
 */
export function resolveBranchScope(session, requestedBranch, field = "personal.branch") {
  const user = session?.user;
  const userRole = user?.role;
  const userBranch = user?.branch;

  const isPrivileged = ["super-admin", "admin", "owner"].includes(userRole);

  if (isPrivileged) {
    if (requestedBranch && requestedBranch !== "All") {
      return { [field]: requestedBranch };
    }
    return {};
  }

  if (userBranch === "Collab") {
    if (requestedBranch && COLLAB_BRANCHES.includes(requestedBranch)) {
      return { [field]: requestedBranch };
    }
    return { [field]: { $in: COLLAB_BRANCHES } };
  }

  if (userBranch && userBranch !== "All") {
    return { [field]: userBranch };
  }

  if (requestedBranch && requestedBranch !== "All") {
    return { [field]: requestedBranch };
  }

  return {};
}
