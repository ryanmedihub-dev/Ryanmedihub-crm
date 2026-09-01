// Server-only. Shared logic behind the master-data mutation API (§3): usage counting, the
// account-reference check, the settlementType guard, and the behavioural-flag impact preview.

import Transactions from "@/models/Transactions";
import Payable from "@/models/Payable";
import Receivable from "@/models/Receivable";
import AccountPeriod from "@/models/AccountPeriod";
import AccountTransfer from "@/models/AccountTransfer";
import Advance from "@/models/Advance";
import Borrowing from "@/models/Borrowing";
import SuspenseEntry from "@/models/SuspenseEntry";
import BankRoutingRule from "@/models/BankRoutingRule";

const MODELS = {
  Transactions,
  Payable,
  Receivable,
  AccountPeriod,
  AccountTransfer,
  Advance,
  Borrowing,
  SuspenseEntry,
  BankRoutingRule,
};

// Which (collection, field) pairs hold each kind's value on live documents. Mirrors the §3
// usage-count definition; the ACCOUNT rows also cover the "delete blocked by AccountPeriod /
// AccountTransfer / Borrowing / Advance / SuspenseEntry" rule.
const USAGE_MAP = {
  ACCOUNT: [
    ["Transactions", "furtherMode"],
    ["AccountPeriod", "account"],
    ["AccountTransfer", "fromAccount"],
    ["AccountTransfer", "toAccount"],
    ["Advance", "account"],
    ["Borrowing", "account"],
    ["SuspenseEntry", "account"],
  ],
  PAYMENT_METHOD: [["Transactions", "method"]],
  RECEIPT_MODE: [
    ["Transactions", "receiptMode"],
    ["BankRoutingRule", "receiptMode"],
  ],
  EXPENSE_CATEGORY: [
    ["Transactions", "expense"],
    ["Payable", "expenseCategory"],
  ],
  EXPENSE_SUBTYPE: [
    ["Transactions", "expenseType"],
    ["Payable", "expenseSubType"],
  ],
};

/**
 * Count live documents holding `value` in the fields relevant to `kind`.
 * @returns {{ total: number, byCollection: Record<string, number> }}
 */
export async function computeUsage(kind, value) {
  const pairs = USAGE_MAP[kind] || [];
  const results = await Promise.all(
    pairs.map(([model, field]) => MODELS[model].countDocuments({ [field]: value })),
  );
  const byCollection = {};
  pairs.forEach(([model, field], i) => {
    const key = `${model}.${field}`;
    byCollection[key] = (byCollection[key] || 0) + results[i];
  });
  const total = results.reduce((a, b) => a + b, 0);
  return { total, byCollection };
}

/**
 * For an ACCOUNT value: counts per referencing collection beyond Transactions, so a blocked
 * delete can name exactly what references it.
 */
export async function computeAccountReferences(value) {
  const [accountPeriod, transferFrom, transferTo, advance, borrowing, suspense, transactions] =
    await Promise.all([
      AccountPeriod.countDocuments({ account: value }),
      AccountTransfer.countDocuments({ fromAccount: value }),
      AccountTransfer.countDocuments({ toAccount: value }),
      Advance.countDocuments({ account: value }),
      Borrowing.countDocuments({ account: value }),
      SuspenseEntry.countDocuments({ account: value }),
      Transactions.countDocuments({ furtherMode: value }),
    ]);
  const refs = {
    AccountPeriod: accountPeriod,
    AccountTransfer: transferFrom + transferTo,
    Advance: advance,
    Borrowing: borrowing,
    SuspenseEntry: suspense,
    Transactions: transactions,
  };
  const blocking = Object.entries(refs)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} (${n})`);
  return { refs, blocking, total: Object.values(refs).reduce((a, b) => a + b, 0) };
}

/** true if any non-cancelled payable is filed under this expense category. */
export async function hasPayablesUnderCategory(categoryValue) {
  const n = await Payable.countDocuments({
    expenseCategory: categoryValue,
    isCancelled: { $ne: true },
  });
  return n > 0;
}

/**
 * Live estimate of what flipping isNonCash / isUnsettled on a PAYMENT_METHOD would do to P&L
 * and account balances — the §0.2 preview. Approximation: it sums the amounts that would move
 * in or out of each total, rather than re-running the full P&L pipeline.
 *
 * @param {string} value        the method value
 * @param {{ isNonCash?: boolean|null, isUnsettled?: boolean|null }} current  current flags
 * @param {{ isNonCash?: boolean, isUnsettled?: boolean }} next               proposed flags
 */
export async function computeMethodFlagImpact(value, current, next) {
  const agg = await Transactions.aggregate([
    { $match: { method: value, approvalStatus: { $nin: ["PENDING", "REJECTED"] } } },
    {
      $group: {
        _id: "$costType",
        count: { $sum: 1 },
        amount: { $sum: "$amount" },
        amountWithAccount: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ["$furtherMode", ""] }, { $ne: ["$furtherMode", null] }] },
              "$amount",
              0,
            ],
          },
        },
      },
    },
  ]);

  const rev = agg.find((r) => r._id === "Revenue") || { count: 0, amount: 0, amountWithAccount: 0 };
  const exp = agg.find((r) => r._id === "Expenses") || { count: 0, amount: 0, amountWithAccount: 0 };
  const transactionCount = rev.count + exp.count;

  const changingUnsettled =
    next.isUnsettled !== undefined && !!next.isUnsettled !== !!current.isUnsettled;
  const changingNonCash =
    next.isNonCash !== undefined && !!next.isNonCash !== !!current.isNonCash;

  let pnlDelta = 0;
  let balanceDelta = 0;

  if (changingUnsettled) {
    // Turning ON: revenue on this method stops counting, expense on it stops counting.
    const sign = next.isUnsettled ? -1 : 1;
    pnlDelta += sign * (rev.amount - exp.amount);
    balanceDelta += sign * (rev.amount - exp.amount);
  }
  if (changingNonCash) {
    // Turning ON: attributed amounts stop hitting account balances (P&L unaffected).
    const sign = next.isNonCash ? -1 : 1;
    balanceDelta += sign * (rev.amountWithAccount - exp.amountWithAccount);
  }

  return {
    transactionCount,
    revenue: { count: rev.count, amount: rev.amount, amountWithAccount: rev.amountWithAccount },
    expense: { count: exp.count, amount: exp.amount, amountWithAccount: exp.amountWithAccount },
    changingUnsettled,
    changingNonCash,
    pnlDeltaEstimate: Math.round(pnlDelta * 100) / 100,
    balanceDeltaEstimate: Math.round(balanceDelta * 100) / 100,
    note:
      "Estimate — sums the amounts that move in or out of each total; it does not re-run the " +
      "full P&L pipeline. A change can take up to ~60s to appear on every server instance.",
  };
}
