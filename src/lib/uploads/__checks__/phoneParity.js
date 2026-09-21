// Asserts src/lib/phone.js's normalizePhone() produces the same 10-digit result across the
// phone formats campaign leads, patients, and callby call logs actually show up in. The two
// normalizers (this one and callby's own lib/normalizePhone.js) are independent
// implementations with identical logic — that's a standing risk, not a guarantee, which is
// exactly why this check exists: it catches THIS side drifting, even though it can't reach
// into the callby repo to check the other side from here.
//
// Plain assertion script, no test framework — run with: node src/lib/uploads/__checks__/phoneParity.js

import { normalizePhone } from "../../phone.js";

const CASES = [
  ["+91 98765 43210", "9876543210"],
  ["098765 43210", "9876543210"],
  ["9198765 43210", "9876543210"],
  ["919876543210", "9876543210"], // callby CallLog.contactNumber shape (12-digit, country code, no plus)
  ["9876543210", "9876543210"], // patient/campaign-lead as-typed shape
  ["+91-98765-43210", "9876543210"], // dashes
  ["91 9876543210", "9876543210"],
];

let failures = 0;
for (const [input, expected] of CASES) {
  const got = normalizePhone(input);
  if (got !== expected) {
    failures++;
    console.error(`FAIL: normalizePhone(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  }
}

console.log(`Checked ${CASES.length} phone formats.`);
console.log(failures === 0 ? "PASS" : `FAIL: ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
