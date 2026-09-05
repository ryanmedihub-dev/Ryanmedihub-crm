// §4 scenario 6 — Salary with raise payable -> Payable(SALARY, period) created; no double
// on re-submit for the same employee+month (Payable's unique partial index on
// payee+purpose+period for MONTHLY_PURPOSES is respected — a friendly 4xx, not a 500).
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/06-salary-payable-unique.mjs

import Employee from "@/models/Employee";
import Payable from "@/models/Payable";
import { createPayable } from "@/lib/entryCore/createPayable";
import { connectForAcceptance, disconnectAcceptance, record, printResultsTable, fakeActorSession, TEST_TAG } from "./_harness.mjs";

const session = fakeActorSession();
const created = { employees: [], payables: [] };

async function main() {
  await connectForAcceptance();
  try {
    const employee = await Employee.create({ name: "Entry Acceptance Fixture", role: "Agent", branch: "Delhi" });
    created.employees.push(employee._id);

    const draft = {
      payee: { kind: "EMPLOYEE", refId: String(employee._id), label: employee.name },
      purpose: "SALARY", expenseCategory: "Salary", expenseSubType: "Salary",
      period: { month: 1, year: 2100 }, // far-future month — guaranteed not to collide with real data
      totalAmount: 45000, remarks: TEST_TAG,
    };

    const first = await createPayable({ payload: draft, session });
    if (first.data) created.payables.push(first.data._id);
    record(
      "6a. First submit creates the Payable",
      "status 201, purpose=SALARY",
      first.data ? `created, purpose=${first.data.purpose}` : `error: ${first.error}`,
      first.status === 201 && first.data?.purpose === "SALARY",
    );

    const second = await createPayable({ payload: draft, session });
    if (second.data) created.payables.push(second.data._id); // shouldn't happen; tracked just in case
    const isFriendly4xx = second.status >= 400 && second.status < 500 && !!second.error;
    record(
      "6b. Re-submitting the same employee+month is rejected, not a 500",
      "4xx with a friendly error (unique index violation caught)",
      second.data ? "created a SECOND payable — BUG (duplicate not prevented)" : `status ${second.status}: ${second.error}`,
      isFriendly4xx && !second.data,
    );

    const count = await Payable.countDocuments({ "payee.refId": employee._id, purpose: "SALARY", "period.month": 1, "period.year": 2100 });
    record("6c. Exactly one Payable exists for this employee+month", "1", String(count), count === 1);
  } finally {
    if (created.payables.length) await Payable.deleteMany({ _id: { $in: created.payables } });
    if (created.employees.length) await Employee.deleteMany({ _id: { $in: created.employees } });
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
