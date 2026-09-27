import Transactions from "@/models/Transactions";
import { accountsSync } from "@/lib/masterData";
import {
  buildBalanceMatch,
  buildContraUnionStage,
  buildSuspenseUnionStage,
  buildBorrowingUnionStage,
  buildAdvanceUnionStage,
  getOpeningBalances,
  round2,
  TRANSACTION_TO_MOVEMENT,
} from "@/lib/accountBalances";

export const LOAN_ACCOUNTS = ["Bajaj Loan", "Fibe Loan"];

export async function getAccountRollup({ filter = "", from = "", to = "", branch = "", accountsParam = "" }) {
  const effectiveTo = to || new Date().toISOString();
  const filterAccounts =
    filter === "loans"
      ? LOAN_ACCOUNTS
      : filter === "cash"
        ? accountsSync().filter((a) => !LOAN_ACCOUNTS.includes(a))
        : accountsSync();
  const accounts = accountsParam
    ? filterAccounts.filter((a) => accountsParam.split(",").includes(a))
    : filterAccounts;

  const openingFrom = from || "1970-01-01";
  const contraStage = buildContraUnionStage({ from: openingFrom, to: effectiveTo, branch });
  const suspenseStage = buildSuspenseUnionStage({ from: openingFrom, to: effectiveTo, branch });
  const borrowingStage = buildBorrowingUnionStage({ from: openingFrom, to: effectiveTo, branch });
  const advanceStage = buildAdvanceUnionStage({ from: openingFrom, to: effectiveTo, branch });

  const [openings, movementRows] = await Promise.all([
    getOpeningBalances(accounts, openingFrom, branch || null),
    Transactions.aggregate([
      { $match: buildBalanceMatch({ accounts, from: openingFrom, to: effectiveTo, branch }) },
      TRANSACTION_TO_MOVEMENT,
      ...(contraStage ? [contraStage] : []),
      ...(suspenseStage ? [suspenseStage] : []),
      ...(borrowingStage ? [borrowingStage] : []),
      ...(advanceStage ? [advanceStage] : []),
      { $match: { account: { $in: accounts } } },
      {
        $group: {
          _id: "$account",
          totalIn: { $sum: "$in" },
          totalOut: { $sum: "$out" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const byAccount = new Map(movementRows.map((r) => [r._id, r]));
  return accounts.map((account) => {
    const m = byAccount.get(account);
    const opening = round2(openings[account]?.openingBalance || 0);
    const movement = round2(m?.totalIn || 0);
    const settled = round2(m?.totalOut || 0);
    return {
      key: account,
      label: account,
      opening,
      movement,
      settled,
      closing: round2(opening + movement - settled),
      count: m?.count || 0,
    };
  });
}
