import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { cacheEnabled, cacheGet, CACHE_VERSION } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session?.user?.role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  }

  const enabled = cacheEnabled();
  let pingMs = null;
  if (enabled) {
    const start = Date.now();
    await cacheGet("ryan:health:ping"); 
    pingMs = Date.now() - start;
  }

  return NextResponse.json({ enabled, version: CACHE_VERSION, pingMs });
}
