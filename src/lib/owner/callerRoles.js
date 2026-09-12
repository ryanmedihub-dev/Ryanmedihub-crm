// Which Employee.role values can ever exist in callby. callby is calling-staff
// only, so link coverage is judged against THESE employees — OT staff, doctors,
// counsellors, reception, housekeeping etc. are never in callby and are not
// misses. Employee.role is free-form text, so compare case-insensitively.
//
// Shared by scripts/link-employees-to-callby.mjs (match-rate denominator) and
// /api/owner/callby-links + /owner/employees/links (default filter), so the
// script's number and the screen's number can't drift apart.
// Plain ESM with no "@/" imports on purpose — the script imports it directly.

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
