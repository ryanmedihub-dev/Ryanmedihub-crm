

export const EMPLOYEE_ROLE_OPTIONS = [
  "Agent",
  "Counsellor",
  "Doctor",
  "Technician",
  "Implanter",
  "Hr",
];

export const OTHER_EMPLOYEE_ROLE = "Others";

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

export function canonicalEmployeeRole(role) {
  const key = String(role || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return OTHER_EMPLOYEE_ROLE;
  return ALIAS_TO_CANON.get(key) || OTHER_EMPLOYEE_ROLE;
}

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

export function isEmployeeRole(role, canonical) {
  return canonicalEmployeeRole(role) === canonical;
}

export function normalizeEmployeeRoleForSave(role) {
  const trimmed = String(role || "").trim().replace(/\s+/g, " ");
  const canon = canonicalEmployeeRole(trimmed);
  return canon !== OTHER_EMPLOYEE_ROLE ? canon : trimmed;
}
