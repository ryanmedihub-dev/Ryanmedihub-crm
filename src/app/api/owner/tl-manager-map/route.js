import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import TlManagerMap from "@/models/TlManagerMap";
import Employee from "@/models/Employee";

const ALLOWED_ROLES = ["owner", "super-admin"];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

// POST { tlName, managerName } -> upsert by normalized tlNameKey.
//
// TlManagerMap is the source of truth for TL -> Manager. Employee.managerName
// (shown in the Agents "Manager" column and on detail pages) is kept in sync
// here so the two never disagree.
const postHandler = async (req) => {
  const { session, error } = await requireSession();
  if (error) return error;

  const { tlName, managerName } = await req.json();
  if (!tlName?.trim() || !managerName?.trim()) {
    return NextResponse.json({ success: false, message: "tlName and managerName are required" }, { status: 400 });
  }
  const tlNameKey = tlName.trim().toLowerCase();
  const nextManager = managerName.trim();
  const who = { name: session.user.name, email: session.user.email };

  let row = await TlManagerMap.findOne({ tlNameKey });
  if (row) {
    const previousValue = row.managerName;
    row.tlName = tlName.trim();
    row.managerName = nextManager;
    row.isActive = true;
    if (previousValue !== nextManager) {
      row.log.push({ action: "Manager Changed", previousValue, newValue: nextManager, performedBy: who, performedAt: new Date() });
    }
    await row.save();
  } else {
    row = await TlManagerMap.create({
      tlNameKey,
      tlName: tlName.trim(),
      managerName: nextManager,
      createdBy: { ...who, date: new Date() },
      log: [{ action: "Created", newValue: nextManager, performedBy: who, performedAt: new Date() }],
    });
  }

  const { modifiedCount } = await Employee.updateMany(
    { mergedInto: null, tlName: new RegExp(`^\\s*${escapeRegex(tlName.trim())}\\s*$`, "i") },
    { $set: { managerName: nextManager } },
  );

  return NextResponse.json({ success: true, row, employeesUpdated: modifiedCount });
};

export const POST = withDB(postHandler);
