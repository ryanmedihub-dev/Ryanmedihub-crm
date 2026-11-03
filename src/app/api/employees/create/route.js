import { NextResponse } from "next/server";
import { withDB } from "@/lib/withDB";
import Employee from "@/models/Employee";
import { normalizeEmployeeRoleForSave } from "@/constants/employeeRoles";
import { cacheInvalidate } from "@/lib/cache";
import { requireSession } from "@/lib/apiGuard";

const ALLOWED_ROLES = ["super-admin", "admin", "hr", "owner"];
const COMPENSATION_ROLES = ["super-admin", "admin", "owner"];

const handler = async (req) => {
  const { session, error: authError } = await requireSession(ALLOWED_ROLES);
  if (authError) return authError;

  const {
    name,
    phone,
    email,
    employeeId,
    role,
    branch,
    patient,
    salaryStructure,
    incentiveRate,
    dateOfJoining,
    tlName,
    managerName,
  } = await req.json();

  if (!name || !phone || !role) {
    return NextResponse.json(
      { message: "Name, phone, and role are required fields" },
      { status: 400 }
    );
  }

  // Only super-admin, admin, and owner can set compensation data
  const canSetCompensation = COMPENSATION_ROLES.includes(session.user.role);
  const safeSalary = canSetCompensation ? salaryStructure : undefined;
  const safeIncentive = canSetCompensation ? incentiveRate : undefined;

  const newEmployee = new Employee({
    name: name.trim(),
    phone: phone.trim(),
    email: email?.trim()?.toLowerCase() || undefined,
    employeeId: (employeeId || "").trim(),
    role: normalizeEmployeeRoleForSave(role),
    branch: branch || (session.user.branch && session.user.branch !== "All" ? session.user.branch : "Delhi"),
    patient,
    salaryStructure: safeSalary,
    incentiveRate: safeIncentive,
    dateOfJoining: dateOfJoining || undefined,
    tlName: (tlName ?? "").trim() || undefined,
    managerName: (managerName ?? "").trim() || undefined,
  });

  await newEmployee.save();

  await cacheInvalidate("employees", "owner");
  return NextResponse.json(
    { message: "Employee created successfully", employee: newEmployee },
    { status: 201 }
  );
};

export const POST = withDB(handler);
