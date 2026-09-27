

import { normalizePhone } from "../../phone.js";

const CASES = [
  ["+91 98765 43210", "9876543210"],
  ["098765 43210", "9876543210"],
  ["9198765 43210", "9876543210"],
  ["919876543210", "9876543210"], 
  ["9876543210", "9876543210"], 
  ["+91-98765-43210", "9876543210"], 
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
