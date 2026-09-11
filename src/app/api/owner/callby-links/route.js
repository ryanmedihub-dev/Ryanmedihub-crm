import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { withDB } from "@/lib/withDB";
import Employee from "@/models/Employee";
import { fetchCallby, CallbyError } from "@/lib/callby";

// Backs the /owner/employees/links UI — the manual pairing screen for the
// employees the reconciliation script (scripts/link-employees-to-callby.mjs)
// couldn't confidently match to a callby user.

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

// callby's agent id — same field /owner/agent-360 hands to /api/owner/agent-detail/:id
const callbyId = (a) => String(a?.employeeId ?? a?.userId ?? a?.id ?? a?._id ?? "") || null;

async function loadCallbyAgents() {
  const result = await fetchCallby("/api/leads/workforce-summary");
  const agents = result?.data?.agents || [];
  return agents
    .map((a) => ({
      callbyUserId: callbyId(a),
      name: a?.name || "",
      tlName: a?.tlName || "",
      phone: a?.phone ?? a?.mobile ?? a?.contactNumber ?? "",
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

// GET — everything the linking screen needs in one shot.
const getHandler = async () => {
  const { error } = await requireSession();
  if (error) return error;

  let agents;
  try {
    agents = await loadCallbyAgents();
  } catch (err) {
    return callbyErrorResponse(err);
  }

  const employees = await Employee.find({ isactive: { $ne: false }, mergedInto: null })
    .select("name phone employeeId role branch callbyUserId tlName")
    .sort({ name: 1 })
    .lean();

  const agentById = new Map(agents.map((a) => [a.callbyUserId, a]));
  const linkedEmpByCallbyId = new Map(
    employees.filter((e) => e.callbyUserId).map((e) => [String(e.callbyUserId), e]),
  );

  const linked = employees
    .filter((e) => e.callbyUserId)
    .map((e) => ({
      employee: e,
      callbyAgent: agentById.get(String(e.callbyUserId)) || { callbyUserId: String(e.callbyUserId), name: "(not in callby roster)", tlName: "", stale: true },
    }));

  const unlinkedEmployees = employees.filter((e) => !e.callbyUserId);
  const unlinkedCallbyAgents = agents.filter((a) => !linkedEmpByCallbyId.has(a.callbyUserId));

  return NextResponse.json({
    success: true,
    linked,
    unlinkedEmployees,
    unlinkedCallbyAgents,
    counts: {
      employees: employees.length,
      linked: linked.length,
      unlinkedEmployees: unlinkedEmployees.length,
      unlinkedCallbyAgents: unlinkedCallbyAgents.length,
    },
  });
};

// POST { employeeId, callbyUserId } — create one pairing.
const postHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { employeeId, callbyUserId } = await req.json();
  if (!employeeId || !callbyUserId) {
    return NextResponse.json({ success: false, message: "employeeId and callbyUserId are required" }, { status: 400 });
  }

  const cid = String(callbyUserId);

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

// DELETE ?employeeId= — clear one pairing.
const deleteHandler = async (req) => {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json({ success: false, message: "employeeId is required" }, { status: 400 });
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
