// Employee.role is free-form text (any designation can be typed on the add / edit employee
// form). But a handful of roles drive role-specific pickers across the app — the patient
// "Reference Source (Agent)" picker, the Counsellor picker, the Doctor / Technician /
// Implanter multi-selects, the staff roster tabs — and the same role gets entered many ways
// ("counsellor", "Counsellor", "COUNSELLOR", "Councellor"). Every role-keyed lookup funnels
// through canonicalEmployeeRole() / employeeRoleBucket() so casing and spelling variants
// land in one bucket instead of fragmenting.

export const EMPLOYEE_ROLE_OPTIONS = [
  "Agent",
  "Counsellor",
  "Doctor",
  "Technician",
  "Implanter",
  "Hr",
];

export const OTHER_EMPLOYEE_ROLE = "Others";

// canonical bucket -> the (lower-cased) spellings that should map into it
const ROLE_ALIASES = {
  Agent: ["agent", "agents", "sales agent", "sales-agent", "reference agent"],
  Counsellor: ["counsellor", "counselor", "councellor", "councelor", "counseller", "counsellar"],
  Doctor: ["doctor", "dr", "dr.", "physician", "surgeon"],
  Technician: ["technician", "technitian", "tech", "senior technician"],
  Implanter: ["implanter", "implantor", "implant", "implanter/technician"],
  Hr: ["hr", "h.r.", "h r", "human resource", "human resources", "hr executive", "hr manager"],
};

const ALIAS_TO_CANON = (() => {
  const m = new Map();
  for (const canon of EMPLOYEE_ROLE_OPTIONS) m.set(canon.toLowerCase(), canon);
  for (const [canon, aliases] of Object.entries(ROLE_ALIASES)) {
    for (const a of aliases) m.set(a, canon);
  }
  return m;
})();

/**
 * Free-form role text -> one of EMPLOYEE_ROLE_OPTIONS, or "Others" for anything unrecognised.
 * Case- and whitespace-insensitive. Use for the patient forms, whose pickers only ever read
 * the six canonical buckets plus "Others".
 */
export function canonicalEmployeeRole(role) {
  const key = String(role || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return OTHER_EMPLOYEE_ROLE;
  return ALIAS_TO_CANON.get(key) || OTHER_EMPLOYEE_ROLE;
}

/**
 * Like canonicalEmployeeRole, but keeps an unrecognised designation as its own bucket
 * (Title-cased so "manager" / "MANAGER" / "Manager" still merge). Use for the staff roster,
 * which shows a tab per real designation with "Others" only as a fallback.
 */
export function employeeRoleBucket(role) {
  const canon = canonicalEmployeeRole(role);
  if (canon !== OTHER_EMPLOYEE_ROLE) return canon;
  const raw = String(role || "").trim().replace(/\s+/g, " ");
  if (!raw) return OTHER_EMPLOYEE_ROLE;
  return raw
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** True when a free-form role belongs to the given canonical bucket. */
export function isEmployeeRole(role, canonical) {
  return canonicalEmployeeRole(role) === canonical;
}

/**
 * What to actually persist on Employee.role: the canonical spelling when the typed value is
 * a known role variant ("counsellor" -> "Counsellor"), otherwise the text as typed (trimmed)
 * so genuinely custom designations ("SEO Specialist") are kept verbatim.
 */
export function normalizeEmployeeRoleForSave(role) {
  const trimmed = String(role || "").trim().replace(/\s+/g, " ");
  const canon = canonicalEmployeeRole(trimmed);
  return canon !== OTHER_EMPLOYEE_ROLE ? canon : trimmed;
}
