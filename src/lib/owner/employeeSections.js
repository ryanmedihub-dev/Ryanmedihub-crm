import { canonicalEmployeeRole } from "@/constants/employeeRoles";

export const EMPLOYEE_SECTIONS = ["Agent", "Counsellor", "Surgery", "HR", "Other"];

const SURGERY_PATTERN = /\bot\s*staff\b|senior\s*tech|nursh?ing|lab\s*tech|\bprp\b|\bmds\b|\bbds\b/i;
const HR_PATTERN = /hr\s*recruiter|hr\s*generalist|human\s*resource/i;

export function employeeSection(role) {
  const canon = canonicalEmployeeRole(role);
  if (canon === "Agent") return "Agent";
  if (canon === "Counsellor") return "Counsellor";
  if (canon === "Doctor" || canon === "Technician" || canon === "Implanter") return "Surgery";
  if (canon === "Hr") return "HR";

  const raw = String(role || "");
  if (SURGERY_PATTERN.test(raw)) return "Surgery";
  if (HR_PATTERN.test(raw)) return "HR";
  return "Other";
}

export const SECTION_LABELS = {
  Agent: "Agents",
  Counsellor: "Counsellors",
  Surgery: "Surgery staff",
  HR: "HR",
  Other: "Other staff",
};
