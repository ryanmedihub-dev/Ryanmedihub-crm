export const INCENTIVE_PURPOSES = [
  "Agent (Patient Consult)",
  "Agent (Patient Surgery)",
  "Counsellor",
  "Doctor",
  "Technician",
  "Implanter",
  "Referral",
  "Other",
];

import { canonicalEmployeeRole } from "@/constants/employeeRoles";

const ROLE_TO_PURPOSE = {
  Agent: "Agent",
  Counsellor: "Counsellor",
  Doctor: "Doctor",
  Technician: "Technician",
  Implanter: "Implanter",
};

export function purposeForRole(role) {
  return ROLE_TO_PURPOSE[canonicalEmployeeRole(role)] || "Other";
}
