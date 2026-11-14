import test from "node:test";
import assert from "node:assert/strict";
import {
  HR_REFERENCE_OTHER_ID,
  EXCLUDED_HR_IDS,
  EXCLUDED_HR_NAMES,
  isEligibleHrReference,
  validatePublicAssignedHr,
} from "./hrValidation.js";

// ── 1. All six currently approved HR references ───────────────────────────────
test("isEligibleHrReference: all six currently approved HR references are accepted", () => {
  const approvedHrs = [
    { _id: "6a27ff34d3eb9b2325233664", name: "Hr Aisha", role: "Hr", isactive: true },
    { _id: "6a8842144f9e384454479954", name: "Farhin Gul", role: "Hr", isactive: true },
    { _id: "6aad1450930151f9f3c42637", name: "HR Kanishka", role: "Hr", isactive: true },
    { _id: "6a8842144f9e384454479955", name: "Hr Naziya", role: "Hr", isactive: true },
    { _id: "6aad1249d052e47e774fe842", name: "HR Priya", role: "Hr", isactive: true },
    { _id: "69bd25df9777c5b4424121c1", name: "Hr Simran Kaur", role: "Hr", isactive: true },
  ];

  for (const hr of approvedHrs) {
    assert.equal(
      isEligibleHrReference(hr),
      true,
      `Approved HR ${hr.name} (${hr._id}) must be accepted`
    );
  }
});

// ── 2. The legitimate Other employee record ──────────────────────────────────
test("isEligibleHrReference: the legitimate Other employee record is accepted", () => {
  const otherRecord = {
    _id: HR_REFERENCE_OTHER_ID, // "69bd3e186706eb9cf318ffc9"
    name: "other",
    role: "Hr",
    isactive: false, // The 'other' bucket record has isactive: false in CRM DB
  };

  assert.equal(isEligibleHrReference(otherRecord), true);

  // But an arbitrary employee named "other" with a different ID must NOT be accepted
  const fakeOther = {
    _id: "507f1f77bcf86cd799439011",
    name: "other",
    role: "Hr",
    isactive: false,
  };
  assert.equal(isEligibleHrReference(fakeOther), false);
});

// ── 3. Nonexistent ObjectId (null employee from findById) ─────────────────────
test("isEligibleHrReference: nonexistent employee (null) is rejected", () => {
  assert.equal(isEligibleHrReference(null), false);
  assert.equal(isEligibleHrReference(undefined), false);
});

// ── 4. Valid employee ObjectId but ineligible role (prevents arbitrary assignment)
test("isEligibleHrReference: employees with non-Hr roles are rejected", () => {
  const nonHrEmployees = [
    { _id: "60c72b2f9b1d8b2bad000001", name: "Dr. Sharma", role: "Doctor", isactive: true },
    { _id: "60c72b2f9b1d8b2bad000002", name: "Rahul Sales", role: "sales", isactive: true },
    { _id: "60c72b2f9b1d8b2bad000003", name: "Pooja Frontdesk", role: "reception", isactive: true },
    { _id: "60c72b2f9b1d8b2bad000004", name: "Admin User", role: "admin", isactive: true },
    { _id: "69bd264a9777c5b4424121d9", name: "Muskan Sayed", role: "HR RECRUITER", isactive: true },
    { _id: "6a8842144f9e384454479956", name: "Shubham Chitransh", role: "HR GENERALIST", isactive: true },
  ];

  for (const emp of nonHrEmployees) {
    assert.equal(
      isEligibleHrReference(emp),
      false,
      `Employee with role ${emp.role} must NOT be accepted as public HR reference`
    );
  }
});

// ── 5. Inactive HR employee ───────────────────────────────────────────────────
test("isEligibleHrReference: inactive HR employees are rejected", () => {
  const inactiveHrs = [
    { _id: "69bd26169777c5b4424121cd", name: "Hr Priya", role: "Hr", isactive: false },
    { _id: "69bd26769777c5b4424121e7", name: "Hr Tulsi", role: "Hr", isactive: false },
    { _id: "6a8c1c9f4b81eed5d782715a", name: "anamta Hr", role: "Hr", isactive: false },
    { _id: "6aa139c1630fbe10bb726db6", name: "[MERGED] HR Simran Kaur", role: "Hr", isactive: false },
    { _id: "6aa256d22c3b6945c9cb135a", name: "[MERGED] HR NAZIYA", role: "Hr", isactive: false },
  ];

  for (const hr of inactiveHrs) {
    assert.equal(
      isEligibleHrReference(hr),
      false,
      `Inactive HR ${hr.name} (${hr._id}) must be rejected`
    );
  }
});

// ── 6. Excluded HR employees (by name or ID) ──────────────────────────────────
test("isEligibleHrReference: excluded HR employees are rejected even if marked active", () => {
  const excludedHrs = [
    { _id: "6a8c1c9f4b81eed5d782715a", name: "Anamta", role: "Hr", isactive: true },
    { _id: "69bd264a9777c5b4424121d9", name: "Muskan", role: "Hr", isactive: true },
    { _id: "6a8842144f9e384454479956", name: "Shubham Chitransh", role: "Hr", isactive: true },
    { _id: "60c72b2f9b1d8b2bad000099", name: "Hr Anamta", role: "Hr", isactive: true },
    { _id: "60c72b2f9b1d8b2bad000098", name: "Muskan HR", role: "Hr", isactive: true },
    { _id: "60c72b2f9b1d8b2bad000097", name: "Shubham Chitransh HR", role: "Hr", isactive: true },
  ];

  for (const hr of excludedHrs) {
    assert.equal(
      isEligibleHrReference(hr),
      false,
      `Excluded HR ${hr.name} must be rejected`
    );
  }
});

// ── 7. Dynamic additions: future active HR is automatically accepted ─────────
test("isEligibleHrReference: future newly added HR employee is dynamically accepted", () => {
  const newHr = {
    _id: "6b112233445566778899aabb",
    name: "HR Neha Sharma",
    role: "Hr",
    isactive: true,
  };

  assert.equal(
    isEligibleHrReference(newHr),
    true,
    "Newly hired active HR must be dynamically accepted without code changes"
  );
});

// ── 8. Candidate submission handler simulation with full security rules ───────
async function simulateSecureCandidatePost(body, isAuthenticatedHR, findEmployeeByIdFn) {
  const result = { ...body };

  if (!isAuthenticatedHR) {
    result.status = "Applied";
    delete result.interviewerFeedback;

    if (result.assignedHr) {
      const idStr = String(result.assignedHr).trim();
      const isHex24 = /^[0-9a-fA-F]{24}$/.test(idStr);
      let isValid = false;

      if (isHex24) {
        const employee = await findEmployeeByIdFn(idStr);
        isValid = isEligibleHrReference(employee);
      }

      if (!isValid) {
        delete result.assignedHr;
      }
    }
  } else {
    const VALID_STATUSES = ["Applied", "Interview Scheduled", "Selected", "Rejected", "On Hold"];
    if (result.status && !VALID_STATUSES.includes(result.status)) {
      result.status = "Applied";
    }
  }

  return result;
}

// Mock DB findById
const mockDb = new Map([
  ["6a27ff34d3eb9b2325233664", { _id: "6a27ff34d3eb9b2325233664", name: "Hr Aisha", role: "Hr", isactive: true }],
  ["6a8842144f9e384454479954", { _id: "6a8842144f9e384454479954", name: "Farhin Gul", role: "Hr", isactive: true }],
  ["6aad1450930151f9f3c42637", { _id: "6aad1450930151f9f3c42637", name: "HR Kanishka", role: "Hr", isactive: true }],
  ["6a8842144f9e384454479955", { _id: "6a8842144f9e384454479955", name: "Hr Naziya", role: "Hr", isactive: true }],
  ["6aad1249d052e47e774fe842", { _id: "6aad1249d052e47e774fe842", name: "HR Priya", role: "Hr", isactive: true }],
  ["69bd25df9777c5b4424121c1", { _id: "69bd25df9777c5b4424121c1", name: "Hr Simran Kaur", role: "Hr", isactive: true }],
  [HR_REFERENCE_OTHER_ID, { _id: HR_REFERENCE_OTHER_ID, name: "other", role: "Hr", isactive: false }],
  ["60c72b2f9b1d8b2bad000001", { _id: "60c72b2f9b1d8b2bad000001", name: "Dr. Sharma", role: "Doctor", isactive: true }],
  ["69bd26769777c5b4424121e7", { _id: "69bd26769777c5b4424121e7", name: "Hr Tulsi", role: "Hr", isactive: false }],
]);

const mockFindEmployeeById = async (id) => mockDb.get(id) || null;

test("POST security: valid approved HR Priya is accepted", async () => {
  const payload = {
    name: "Rohan",
    position: "Telecaller",
    assignedHr: "6aad1249d052e47e774fe842",
    status: "Selected", // unauthenticated user tries to set Selected
    interviewerFeedback: "Hacked score 10/10",
  };

  const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
  assert.equal(saved.assignedHr, "6aad1249d052e47e774fe842");
  assert.equal(saved.status, "Applied", "Unauthenticated cannot set status");
  assert.equal("interviewerFeedback" in saved, false, "interviewerFeedback stripped");
});

test("POST security: legitimate Other HR bucket is accepted", async () => {
  const payload = {
    name: "Kavita",
    position: "Telecaller",
    assignedHr: HR_REFERENCE_OTHER_ID,
  };

  const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
  assert.equal(saved.assignedHr, HR_REFERENCE_OTHER_ID);
});

test("POST security: valid-format nonexistent ObjectId is stripped", async () => {
  const payload = {
    name: "Spammer",
    position: "Telecaller",
    assignedHr: "507f1f77bcf86cd799439011", // valid ObjectId format, does not exist in DB
  };

  const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
  assert.equal("assignedHr" in saved, false, "Nonexistent ID must be stripped");
});

test("POST security: arbitrary non-HR employee (Doctor) is stripped", async () => {
  const payload = {
    name: "Applicant",
    position: "Telecaller",
    assignedHr: "60c72b2f9b1d8b2bad000001", // Dr. Sharma (Doctor)
  };

  const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
  assert.equal("assignedHr" in saved, false, "Arbitrary non-HR employee ID must be stripped");
});

test("POST security: inactive HR employee is stripped", async () => {
  const payload = {
    name: "Applicant",
    position: "Telecaller",
    assignedHr: "69bd26769777c5b4424121e7", // Hr Tulsi (inactive)
  };

  const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
  assert.equal("assignedHr" in saved, false, "Inactive HR employee must be stripped");
});

test("POST security: malformed ObjectId is stripped", async () => {
  const malformedInputs = [
    "not-an-id",
    "<script>alert(1)</script>",
    "6aad1249d052",
    "zzzzzzzzzzzzzzzzzzzzzzzz",
    "6AAD1249D052E47E774FE84G", // 'G' is not hex
  ];

  for (const badId of malformedInputs) {
    const payload = { name: "Applicant", position: "Telecaller", assignedHr: badId };
    const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
    assert.equal("assignedHr" in saved, false, `Malformed ID "${badId}" must be stripped`);
  }
});

test("POST security: missing optional HR reference is handled safely without error", async () => {
  const payload = {
    name: "Direct Applicant",
    position: "Telecaller",
    // assignedHr omitted
  };

  const saved = await simulateSecureCandidatePost(payload, false, mockFindEmployeeById);
  assert.equal("assignedHr" in saved, false);
  assert.equal(saved.status, "Applied");
});

// ── 9. Direct validatePublicAssignedHr function tests ─────────────────────────
const mockEmployeeModel = {
  findById: (id) => ({
    select: () => ({
      lean: async () => mockDb.get(id) || null,
    }),
  }),
};

test("validatePublicAssignedHr: validates approved HRs and rejects invalid via model query", async () => {
  // Approved HR
  assert.equal(
    await validatePublicAssignedHr("6a27ff34d3eb9b2325233664", mockEmployeeModel),
    true
  );
  // Other HR
  assert.equal(
    await validatePublicAssignedHr(HR_REFERENCE_OTHER_ID, mockEmployeeModel),
    true
  );
  // Nonexistent
  assert.equal(
    await validatePublicAssignedHr("507f1f77bcf86cd799439011", mockEmployeeModel),
    false
  );
  // Doctor (ineligible role)
  assert.equal(
    await validatePublicAssignedHr("60c72b2f9b1d8b2bad000001", mockEmployeeModel),
    false
  );
  // Inactive HR
  assert.equal(
    await validatePublicAssignedHr("69bd26769777c5b4424121e7", mockEmployeeModel),
    false
  );
  // Malformed ID
  assert.equal(
    await validatePublicAssignedHr("bad-id-123", mockEmployeeModel),
    false
  );
  // Empty
  assert.equal(
    await validatePublicAssignedHr("", mockEmployeeModel),
    false
  );
  assert.equal(
    await validatePublicAssignedHr(null, mockEmployeeModel),
    false
  );
});

// ── 10. Authenticated HR manual assignment & RBAC guarantees ──────────────────
test("POST security: authenticated HR can manually assign any employee and set status", async () => {
  const payload = {
    name: "Interviewed Candidate",
    position: "Telecaller",
    assignedHr: "60c72b2f9b1d8b2bad000001", // manual assignment to any internal staff
    status: "Interview Scheduled",
    interviewerFeedback: "Technical assessment passed",
  };

  const saved = await simulateSecureCandidatePost(payload, true /* authenticated */, mockFindEmployeeById);
  assert.equal(saved.assignedHr, "60c72b2f9b1d8b2bad000001", "Authenticated HR manual assignment preserved");
  assert.equal(saved.status, "Interview Scheduled", "Authenticated HR status preserved");
  assert.equal(saved.interviewerFeedback, "Technical assessment passed", "Authenticated HR feedback preserved");
});

test("POST security: unauthenticated attempt to forge status or feedback is strictly prevented", async () => {
  const forgedPayload = {
    name: "Hacker Applicant",
    position: "Telecaller",
    assignedHr: "6aad1249d052e47e774fe842",
    status: "Selected",
    interviewerFeedback: "Hacked: automatically selected with maximum rating",
  };

  const saved = await simulateSecureCandidatePost(forgedPayload, false /* unauthenticated */, mockFindEmployeeById);
  assert.equal(saved.status, "Applied", "Status must be forced to 'Applied'");
  assert.equal("interviewerFeedback" in saved, false, "interviewerFeedback must be deleted");
  assert.equal(saved.assignedHr, "6aad1249d052e47e774fe842", "Valid HR referral is preserved");
});
