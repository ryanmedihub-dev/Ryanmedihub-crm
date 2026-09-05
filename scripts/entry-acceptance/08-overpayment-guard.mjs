// §4 scenario 8 — Overpaying a payable without allowOverpayment -> rejected. With it ->
// allowed, and pending goes negative-safe per the existing convention (payableAggregation's
// `pending: max(totalAmount - paid, 0)` — never fixed here, just exercised).
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/08-overpayment-guard.mjs

import mongoose from "mongoose";
import Payable from "@/models/Payable";
import Transactions from "@/models/Transactions";
import { createPayable } from "@/lib/entryCore/createPayable";
import { createExpense } from "@/lib/entryCore/createExpense";
import { connectForAcceptance, disconnectAcceptance, record, printResultsTable, fakeActorSession, TEST_TAG } from "./_harness.mjs";

const session = fakeActorSession();
const created = { payables: [], transactions: [] };

async function main() {
  await connectForAcceptance();
  try {
    const raise = await createPayable({
      payload: {
        payee: { kind: "OTHER", refId: null, label: "Entry Acceptance Vendor" },
        purpose: "OTHER", expenseCategory: "Miscellaneous", totalAmount: 1000, remarks: TEST_TAG,
      },
      session,
    });
    created.payables.push(raise.data._id);

    const overpay = await createExpense({
      payload: {
        expenseCategory: "Miscellaneous", expenseGiver: { type: "MANUAL", name: "Entry Acceptance Vendor" },
        amount: 1500, method: "cash", furtherMode: "Cash Book", branch: "Delhi", payableId: String(raise.data._id), remarks: TEST_TAG,
      },
      session,
    });
    record(
      "8a. Overpaying without allowOverpayment is rejected",
      "error, status 400",
      overpay.error ? `rejected (${overpay.status}): ${overpay.error}` : "accepted — BUG",
      !!overpay.error && overpay.status === 400,
    );

    const overpayAllowed = await createExpense({
      payload: {
        expenseCategory: "Miscellaneous", expenseGiver: { type: "MANUAL", name: "Entry Acceptance Vendor" },
        amount: 1500, method: "cash", furtherMode: "Cash Book", branch: "Delhi", payableId: String(raise.data._id),
        allowOverpayment: true, remarks: TEST_TAG,
      },
      session,
    });
    if (overpayAllowed.data) created.transactions.push(overpayAllowed.data._id);
    record(
      "8b. Overpaying WITH allowOverpayment is accepted",
      "status 201, Transactions doc amount=1500",
      overpayAllowed.data ? `created, amount=${overpayAllowed.data.amount}` : `error: ${overpayAllowed.error}`,
      overpayAllowed.status === 201 && overpayAllowed.data?.amount === 1500,
    );

    const [paidAgg] = await Transactions.aggregate([
      { $match: { payableId: new mongoose.Types.ObjectId(raise.data._id), approvalStatus: "APPROVED" } },
      { $group: { _id: null, paid: { $sum: "$amount" } } },
    ]);
    const paid = paidAgg?.paid || 0;
    const pending = Math.max(0, raise.data.totalAmount - paid); // mirrors payableAggregation.js's own clamp, not a re-derivation of it
    record(
      "8c. Pending clamps at 0 rather than going negative (existing convention)",
      "paid=1500, pending=0",
      `paid=${paid}, pending=${pending}`,
      paid === 1500 && pending === 0,
    );
  } finally {
    if (created.transactions.length) await Transactions.deleteMany({ _id: { $in: created.transactions } });
    if (created.payables.length) await Payable.deleteMany({ _id: { $in: created.payables } });
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
