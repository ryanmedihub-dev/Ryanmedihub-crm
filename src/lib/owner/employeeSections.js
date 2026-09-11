import { canonicalEmployeeRole } from "@/constants/employeeRoles";

// Which of the six Owner Panel v2 Employees pages an Employee.role belongs on.
// src/constants/employeeRoles.js already canonicalizes free-form role text for
// the PATIENT-FORM pickers (Agent/Counsellor/Doctor/Technician/Implanter/Hr),
// but that grouping doesn't match what this section needs — there's no
// "Surgery staff" bucket there, and its "Hr" alias list doesn't catch
// "HR RECRUITER". This layers a second classification on top, reverse-engineered
// against the real role strings seen in the Part 0 reconciliation dump (OT
// STAFF, MDS, BDS Doctor, HR RECRUITER, RECEPTIONIST, HOUSE KEEPING, ...).

export const EMPLOYEE_SECTIONS = ["Agent", "Counsellor", "Surgery", "HR", "Other"];

const SURGERY_PATTERN = /\bot\s*staff\b|senior\s*tech|nursh?ing|lab\s*tech|\bprp\b|\bmds\b|\bbds\b/i;
const HR_PATTERN = /hr\s*recruiter|hr\s*generalist|human\s*resource/i;

/**
 * Free-form Employee.role -> one of EMPLOYEE_SECTIONS. Never throws; unrecognised
 * designations (reception, housekeeping, accountant, office boy, developer,
 * director, sales manager, MIS, driver, maid, ...) fall into "Other" rather than
 * being force-fit into a bucket they don't belong in.
 */
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
