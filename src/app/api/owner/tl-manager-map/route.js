import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import TlManagerMap from "@/models/TlManagerMap";

const ALLOWED_ROLES = ["owner", "super-admin"];

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

// GET -> every active TL->Manager mapping, for the Leadership page.
const getHandler = async () => {
  const { error } = await requireSession();
  if (error) return error;

  const rows = await TlManagerMap.find({ isActive: true }).sort({ tlName: 1 }).lean();
  return NextResponse.json({
    success: true,
    rows: rows.map((r) => ({ tlNameKey: r.tlNameKey, tlName: r.tlName, managerName: r.managerName })),
  });
};

// POST { tlName, managerName } -> upsert by normalized tlNameKey.
const postHandler = async (req) => {
  const { session, error } = await requireSession();
  if (error) return error;

  const { tlName, managerName } = await req.json();
  if (!tlName?.trim() || !managerName?.trim()) {
    return NextResponse.json({ success: false, message: "tlName and managerName are required" }, { status: 400 });
  }
  const tlNameKey = tlName.trim().toLowerCase();
  const who = { name: session.user.name, email: session.user.email };

  const existing = await TlManagerMap.findOne({ tlNameKey });
  if (existing) {
    const changed = existing.managerName !== managerName.trim();
    existing.tlName = tlName.trim();
    existing.managerName = managerName.trim();
    existing.isActive = true;
    if (changed) {
      existing.log.push({
        action: "Manager Changed",
        previousValue: existing.managerName,
        newValue: managerName.trim(),
        performedBy: who,
        performedAt: new Date(),
      });
    }
    await existing.save();
    return NextResponse.json({ success: true, row: existing });
  }

  const created = await TlManagerMap.create({
    tlNameKey,
    tlName: tlName.trim(),
    managerName: managerName.trim(),
    createdBy: { ...who, date: new Date() },
    log: [{ action: "Created", newValue: managerName.trim(), performedBy: who, performedAt: new Date() }],
  });
  return NextResponse.json({ success: true, row: created });
};

// DELETE ?tlNameKey= -> retire (not hard-delete).
const deleteHandler = async (req) => {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const tlNameKey = searchParams.get("tlNameKey");
  if (!tlNameKey) return NextResponse.json({ success: false, message: "tlNameKey is required" }, { status: 400 });

  const row = await TlManagerMap.findOneAndUpdate(
    { tlNameKey },
    { isActive: false, $push: { log: { action: "Retired", performedBy: { name: session.user.name, email: session.user.email }, performedAt: new Date() } } },
    { new: true },
  );
  if (!row) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
};

export const GET = withDB(getHandler);
export const POST = withDB(postHandler);
export const DELETE = withDB(deleteHandler);
