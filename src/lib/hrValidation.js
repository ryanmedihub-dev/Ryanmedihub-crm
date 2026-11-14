export const HR_REFERENCE_OTHER_ID = "69bd3e186706eb9cf318ffc9";

export const EXCLUDED_HR_IDS = Object.freeze([
  "6a8c1c9f4b81eed5d782715a", // Anamta
  "69bd264a9777c5b4424121d9", // Muskan
  "6a8842144f9e384454479956", // Shubham Chitransh
]);

export const EXCLUDED_HR_NAMES = Object.freeze([
  "shubham chitransh",
  "anamta",
  "muskan",
]);

/**
 * Checks whether an employee record is eligible to be a public HR referral.
 *
 * Rules:
 * 1. Must exist.
 * 2. Role must be "Hr".
 * 3. Special "Other" record (69bd3e186706eb9cf318ffc9) is accepted.
 * 4. All other HR employees must be active (isactive: true).
 * 5. Must not be in the excluded IDs list.
 * 6. Must not match excluded names (case-insensitive, trimmed, stripping 'hr' prefixes/suffixes).
 *
 * @param {{ _id: any, name?: string, role?: string, isactive?: boolean } | null} employee
 * @returns {boolean}
 */
export function isEligibleHrReference(employee) {
  if (!employee) return false;

  const employeeId = String(employee._id);
  const employeeRole = String(employee.role || "").trim();
  const rawName = String(employee.name || "").trim();
  const lowerName = rawName.toLowerCase();

  // Role must be "Hr"
  if (employeeRole !== "Hr") {
    return false;
  }

  // Check if it is the dedicated "Other" HR bucket
  if (employeeId === HR_REFERENCE_OTHER_ID && lowerName === "other") {
    return true;
  }

  // Active status is required for all normal HR employees
  if (!employee.isactive) {
    return false;
  }

  // Must not be an explicitly excluded HR ID
  if (EXCLUDED_HR_IDS.includes(employeeId)) {
    return false;
  }

  // Must not match excluded names
  const stripped = lowerName
    .replace(/^hr[\s._-]+/i, "")
    .replace(/[\s._-]+hr$/i, "")
    .trim();

  if (EXCLUDED_HR_NAMES.includes(stripped) || EXCLUDED_HR_NAMES.includes(lowerName)) {
    return false;
  }

  return true;
}

/**
 * Validates a submitted assignedHr ID against the database.
 * Confirms that the referenced employee exists in the Employee collection,
 * is an eligible HR reference, is active (or is the legitimate 'Other' record),
 * and is not an arbitrary employee ID.
 *
 * @param {string|any} assignedHrId
 * @param {any} [EmployeeModel] Optional Employee model injection for testing
 * @returns {Promise<boolean>}
 */
export async function validatePublicAssignedHr(assignedHrId, EmployeeModel = null) {
  if (!assignedHrId) return false;

  const idStr = String(assignedHrId).trim();
  if (!/^[0-9a-fA-F]{24}$/.test(idStr)) {
    return false;
  }

  const Model = EmployeeModel || (await import("@/models/Employee")).default;
  const employee = await Model.findById(idStr)
    .select("_id name role isactive")
    .lean();

  return isEligibleHrReference(employee);
}
