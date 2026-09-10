// The three-way split behind /admin/liabilities/payables/{rent,employees,other}.
//
// "Other" is the COMPLEMENT of the two named sets, never a hand-written list — so a purpose
// added to PAYABLE_PURPOSES next month lands in "Other" automatically instead of silently
// vanishing from every sub-page (and breaking "rent + employees + other === total").
//
// Client- and server-safe: derives from the plain constant, not the mongoose model.

import { PAYABLE_PURPOSES } from "@/constants/payablePurposes";

export const RENT_PURPOSES = ["RENT", "ELECTRICITY"];
export const EMPLOYEE_PURPOSES = ["SALARY", "INCENTIVE"];

export const OTHER_PURPOSES = PAYABLE_PURPOSES.filter(
  (p) => !RENT_PURPOSES.includes(p) && !EMPLOYEE_PURPOSES.includes(p),
);

// key used in the URL / config -> its purpose set
export const PAYABLE_GROUP_PURPOSES = {
  rent: RENT_PURPOSES,
  employees: EMPLOYEE_PURPOSES,
  other: OTHER_PURPOSES,
};

export const PAYABLE_GROUP_LABELS = {
  rent: "Rent & Utilities",
  employees: "Employee Payables",
  other: "Other Payables",
};

/** Which sub-page a payable's purpose belongs on. */
export function payableGroupForPurpose(purpose) {
  if (RENT_PURPOSES.includes(purpose)) return "rent";
  if (EMPLOYEE_PURPOSES.includes(purpose)) return "employees";
  return "other";
}
