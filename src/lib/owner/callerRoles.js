

export const CALLER_ROLES = [
  "agent",
  "team leader",
  "sales manager",
  "patient calling",
  "customer support",
  "bde",
  "agm",
];

const SET = new Set(CALLER_ROLES);

export function isCallerRole(role) {
  return SET.has(String(role ?? "").trim().toLowerCase());
}
