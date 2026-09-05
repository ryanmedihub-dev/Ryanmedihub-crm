// §4 scenario 18 — Contra between two accounts -> both account balances move by exactly
// the amount; same-account rejected.
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/18-contra.mjs

import AccountTransfer from "@/models/AccountTransfer";
import { createContra } from "@/lib/entryCore/createContra";
import { getAccountBalance } from "@/lib/accountBalances";
import { connectForAcceptance, disconnectAcceptance, record, printResultsTable, fakeActorSession, TEST_TAG } from "./_harness.mjs";

const FROM = "Cash Book";
const TO = "HDFC Skin";
const AMOUNT = 1234.56;
const session = fakeActorSession();
const created = [];

async function main() {
  await connectForAcceptance();
  try {
    const before = { from: await getAccountBalance(FROM, new Date()), to: await getAccountBalance(TO, new Date()) };

    const sameAccount = await createContra({ payload: { fromAccount: FROM, toAccount: FROM, amount: AMOUNT, remarks: TEST_TAG }, session });
    record(
      "18a. Same-account contra rejected",
      "error, status 400",
      sameAccount.error ? `error (${sameAccount.status})` : "no error — BUG",
      !!sameAccount.error && sameAccount.status === 400,
    );

    const result = await createContra({ payload: { fromAccount: FROM, toAccount: TO, amount: AMOUNT, remarks: TEST_TAG }, session });
    if (result.data) created.push(result.data._id);

    record(
      "18b. Contra creates one AccountTransfer",
      "status 201, document with amount " + AMOUNT,
      result.data ? `created, amount=${result.data.amount}` : `error: ${result.error}`,
      result.status === 201 && result.data?.amount === AMOUNT,
    );

    const after = { from: await getAccountBalance(FROM, new Date()), to: await getAccountBalance(TO, new Date()) };
    const fromDelta = Math.round((before.from - after.from) * 100) / 100;
    const toDelta = Math.round((after.to - before.to) * 100) / 100;
    record(
      "18c. fromAccount balance drops by exactly the amount",
      String(AMOUNT),
      String(fromDelta),
      Math.abs(fromDelta - AMOUNT) < 0.01,
    );
    record(
      "18d. toAccount balance rises by exactly the amount",
      String(AMOUNT),
      String(toDelta),
      Math.abs(toDelta - AMOUNT) < 0.01,
    );
  } finally {
    if (created.length) await AccountTransfer.deleteMany({ _id: { $in: created } });
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
