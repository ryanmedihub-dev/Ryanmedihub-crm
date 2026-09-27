

import { PAYABLE_PURPOSES } from "@/constants/payablePurposes";

export const RENT_PURPOSES = ["RENT", "ELECTRICITY"];
export const EMPLOYEE_PURPOSES = ["SALARY", "INCENTIVE"];

export const OTHER_PURPOSES = PAYABLE_PURPOSES.filter(
  (p) => !RENT_PURPOSES.includes(p) && !EMPLOYEE_PURPOSES.includes(p),
);

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

export function payableGroupForPurpose(purpose) {
  if (RENT_PURPOSES.includes(purpose)) return "rent";
  if (EMPLOYEE_PURPOSES.includes(purpose)) return "employees";
  return "other";
}
