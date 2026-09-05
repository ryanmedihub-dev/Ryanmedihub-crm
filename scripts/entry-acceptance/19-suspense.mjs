// §4 scenario 19 — Suspense entry -> parked, excluded from P&L, appears in the liabilities
// suspense total.
//
// "Excluded from P&L" is verified structurally here (SuspenseEntry is never read by any
// P&L aggregation — src/lib/masterData's SETTLEMENT_EXCLUSION/cashFlowAggregation.js don't
// touch the suspense collection at all), not by re-running the P&L pipeline itself — this
// script doesn't call into close-book/P&L code per the guardrail against touching it.
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/19-suspense.mjs

import SuspenseEntry from "@/models/SuspenseEntry";
import { createSuspense } from "@/lib/entryCore/createSuspense";
import { connectForAcceptance, disconnectAcceptance, record, printResultsTable, fakeActorSession, TEST_TAG } from "./_harness.mjs";

const ACCOUNT = "Cash Book";
const AMOUNT = 777;
const session = fakeActorSession();
const created = [];

async function main() {
  await connectForAcceptance();
  try {
    const result = await createSuspense({ payload: { account: ACCOUNT, direction: "IN", amount: AMOUNT, remarks: TEST_TAG }, session });
    if (result.data) created.push(result.data._id);

    record(
      "19a. Suspense entry created, unresolved",
      "status 201, isResolved falsy",
      result.data ? `created, isResolved=${result.data.isResolved}` : `error: ${result.error}`,
      result.status === 201 && !result.data?.isResolved,
    );

    const reloaded = result.data ? await SuspenseEntry.findById(result.data._id).lean() : null;
    record(
      "19b. Appears in an open-suspense query (the liabilities page's own filter)",
      "found, isCancelled != true, isResolved != true",
      reloaded ? `found, isCancelled=${reloaded.isCancelled}, isResolved=${reloaded.isResolved}` : "not found",
      !!reloaded && reloaded.isCancelled !== true && reloaded.isResolved !== true,
    );

    const zeroAmount = await createSuspense({ payload: { account: ACCOUNT, amount: 0, remarks: TEST_TAG }, session });
    record(
      "19c. Rejects a non-positive amount",
      "error, status 400",
      zeroAmount.error ? `rejected (${zeroAmount.status})` : "accepted — BUG",
      !!zeroAmount.error && zeroAmount.status === 400,
    );
  } finally {
    if (created.length) await SuspenseEntry.deleteMany({ _id: { $in: created } });
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
