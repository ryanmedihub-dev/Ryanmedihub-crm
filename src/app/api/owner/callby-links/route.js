import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Employee from "@/models/Employee";
import { fetchCallby, CallbyError } from "@/lib/callby";
import { isCallerRole } from "@/lib/owner/callerRoles";
import { cacheKey, cached } from "@/lib/cache";

const ALLOWED_ROLES = ["owner", "super-admin"];

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const callbyId = (a) => {
  const s = String(a?.employeeId ?? "").trim();
  return OBJECT_ID.test(s) ? s : null;
};

async function loadCallbyAgents() {
  const result = await fetchCallby("/api/leads/workforce-summary");
  const agents = result?.data?.agents || [];
  return agents
    .map((a) => ({
      callbyUserId: callbyId(a),
      name: a?.name || "",
      tlName: a?.tlName || "",
      
      
      ryanEmployeeCode: a?.ryanEmployeeCode || "",
      isActive: a?.isActive ?? true,
    }))
    .filter((a) => a.callbyUserId);
}

function callbyErrorResponse(err) {
  if (err instanceof CallbyError) {
    return NextResponse.json({ success: false, message: err.message }, { status: err.status === 500 ? 500 : 502 });
  }
  console.error("callby-links error:", err);
  return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
}

const getHandler = async () => {
  const { session, error } = await requireSession();
  if (error) return error;

  const meta = {};
  const key = cacheKey("owner", { route: "callby-links" }, session);
  let data;
  try {
    data = await cached(key, 60, async () => {
      const agents = await loadCallbyAgents();

      
      
      const allEmployees = await Employee.find({ mergedInto: null })
        .select("name phone employeeId role branch callbyUserId tlName isactive")
        .sort({ name: 1 })
        .lean();
      const employees = allEmployees.filter((e) => e.isactive !== false);

      const agentById = new Map(agents.map((a) => [a.callbyUserId, a]));
      const linkedEmpByCallbyId = new Map(
        allEmployees.filter((e) => e.callbyUserId).map((e) => [String(e.callbyUserId), e]),
      );

      const linked = allEmployees
        .filter((e) => e.callbyUserId)
        .map((e) => ({
          employee: e,
          callbyAgent: agentById.get(String(e.callbyUserId)) || { callbyUserId: String(e.callbyUserId), name: "(not in callby roster)", tlName: "", stale: true },
        }));

      
      
      const unlinkedEmployees = employees
        .filter((e) => !e.callbyUserId)
        .map((e) => ({ ...e, isCaller: isCallerRole(e.role) }));
      const unlinkedCallbyAgents = agents.filter((a) => !linkedEmpByCallbyId.has(a.callbyUserId));

      const callers = employees.filter((e) => isCallerRole(e.role));
      const callersLinked = callers.filter((e) => e.callbyUserId).length;

      return {
        success: true,
        linked,
        unlinkedEmployees,
        unlinkedCallbyAgents,
        counts: {
          employees: employees.length,
          linked: linked.length,
          unlinkedEmployees: unlinkedEmployees.length,
          unlinkedCallers: unlinkedEmployees.filter((e) => e.isCaller).length,
          callers: callers.length,
          callersLinked,
          unlinkedCallbyAgents: unlinkedCallbyAgents.length,
        },
      };
    }, meta);
  } catch (err) {
    return callbyErrorResponse(err);
  }

  const res = NextResponse.json(data);
  res.headers.set("X-Cache", meta.status);
  return res;
};

const postHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { employeeId, callbyUserId } = await req.json();
  if (!employeeId || !callbyUserId) {
    return NextResponse.json({ success: false, message: "employeeId and callbyUserId are required" }, { status: 400 });
  }
  if (!OBJECT_ID.test(String(employeeId))) {
    return NextResponse.json({ success: false, message: "employeeId must be an Employee ObjectId" }, { status: 400 });
  }

  const cid = String(callbyUserId).trim();
  if (!OBJECT_ID.test(cid)) {
    return NextResponse.json({ success: false, message: "callbyUserId must be a callby user ObjectId" }, { status: 400 });
  }

  const taken = await Employee.findOne({ callbyUserId: cid, _id: { $ne: employeeId } })
    .select("name")
    .lean();
  if (taken) {
    return NextResponse.json(
      { success: false, message: `That callby user is already linked to ${taken.name}. Unlink it first.` },
      { status: 409 },
    );
  }

  const employee = await Employee.findByIdAndUpdate(
    employeeId,
    { callbyUserId: cid },
    { new: true, runValidators: true },
  ).select("name callbyUserId");

  if (!employee) {
    return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, employee });
};

const deleteHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  if (!employeeId || !OBJECT_ID.test(employeeId)) {
    return NextResponse.json({ success: false, message: "employeeId must be an Employee ObjectId" }, { status: 400 });
  }

  const employee = await Employee.findByIdAndUpdate(
    employeeId,
    { callbyUserId: null },
    { new: true },
  ).select("name callbyUserId");

  if (!employee) {
    return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, employee });
};

export const GET = withDB(getHandler);
export const POST = withDB(postHandler);
export const DELETE = withDB(deleteHandler);
