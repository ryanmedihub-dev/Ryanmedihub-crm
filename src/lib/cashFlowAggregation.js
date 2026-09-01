import { nonCashMethodsSync } from "@/lib/masterData";
import { APPROVAL_EXCLUDED } from "@/lib/accountBalances";

export function buildCashBasisMatch({ costType, branchFilter, to, account, receiptMode } = {}) {
  const match = {
    approvalStatus: { $nin: APPROVAL_EXCLUDED },
    method: { $nin: nonCashMethodsSync() },
    furtherMode: { $nin: ["", null] },
    ...(branchFilter || {}),
  };
  if (costType) match.costType = costType;
  if (account) match.furtherMode = account;
  if (receiptMode) match.receiptMode = receiptMode;
  if (to) match.date = { $lte: new Date(to) };
  return match;
}

export function receiptHeadMatch(head) {
  if (!head) return {};
  if (head === "Receivable Settlement") return { receivableId: { $ne: null } };
  const byHead = { Transplant: "TRANSPLANT", Services: "SERVICE", Medicine: "MEDICINE" };
  if (byHead[head]) return { receivableId: null, transactionCategory: byHead[head] };
  return { receivableId: null, transactionCategory: { $nin: ["TRANSPLANT", "SERVICE", "MEDICINE"] } };
}

const RECEIPT_HEAD_EXPR = {
  $switch: {
    branches: [
      { case: { $ne: [{ $ifNull: ["$receivableId", null] }, null] }, then: "Receivable Settlement" },
      { case: { $eq: ["$transactionCategory", "TRANSPLANT"] }, then: "Transplant" },
      { case: { $eq: ["$transactionCategory", "SERVICE"] }, then: "Services" },
      { case: { $eq: ["$transactionCategory", "MEDICINE"] }, then: "Medicine" },
    ],
    default: "Other",
  },
};

export function buildCashFlowGroupedStages({ level, costType, head, groupBy = "account", branchFilter, from, to }) {
  const match = buildCashBasisMatch({ costType, branchFilter, to });

  const isRevenue = costType === "Revenue";
  const accountField = groupBy === "mode" ? "$receiptMode" : "$furtherMode";

  // Level 2+ narrows to the level-1 bucket that was drilled into. For receipts that
  // bucket is now a bank account / receipt mode (see headExpr below), not a revenue head.
  if (level !== 1 && head) {
    if (isRevenue) {
      Object.assign(match, groupBy === "mode" ? { receiptMode: head } : { furtherMode: head });
    } else {
      match.expense = head;
    }
  }

  // Receipts: level 1 = bank account / receipt mode, level 2 = revenue head within it.
  // Payments: unchanged — level 1 = expense head, level 2 = expense sub-type.
  const headExpr = isRevenue
    ? { $ifNull: [accountField, "Unspecified"] }
    : { $ifNull: ["$expense", "Uncategorised"] };
  const subExpr = isRevenue
    ? RECEIPT_HEAD_EXPR
    : { $ifNull: ["$expenseType", "Uncategorised"] };

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const inRange = {
    $and: [
      fromDate ? { $gte: ["$date", fromDate] } : { $literal: true },
      toDate ? { $lte: ["$date", toDate] } : { $literal: true },
    ],
  };
  const beforeRange = fromDate ? { $lt: ["$date", fromDate] } : { $literal: false };

  return [
    { $match: match },
    {
      $addFields: {
        _bucket: level === 1 ? headExpr : subExpr,
        _before: { $cond: [beforeRange, "$amount", 0] },
        _inRange: { $cond: [inRange, "$amount", 0] },
        _counted: { $cond: [inRange, 1, 0] },
      },
    },
    {
      $group: {
        _id: "$_bucket",
        opening: { $sum: "$_before" },
        movement: { $sum: "$_inRange" },
        count: { $sum: "$_counted" },
      },
    },
    {
      $project: {
        _id: 0,
        key: "$_id",
        label: "$_id",
        opening: 1,
        movement: 1,
        settled: { $literal: 0 },
        closing: { $add: ["$opening", "$movement"] },
        count: 1,
      },
    },
    { $sort: { key: 1 } },
  ];
}

export function buildCashFlowLeafMatch({ costType, head, sub, groupBy = "account", branchFilter, from, to }) {
  const match = buildCashBasisMatch({ costType, branchFilter, to });
  if (from) match.date = { ...(match.date || {}), $gte: new Date(from) };

  if (costType === "Revenue") {
    // Level 1 = bank account / receipt mode (head); level 2 = revenue head (sub).
    if (head) {
      if (groupBy === "mode") match.receiptMode = head;
      else match.furtherMode = head;
    }
    if (sub) Object.assign(match, receiptHeadMatch(sub));
  } else {
    if (head) match.expense = head;
    if (sub) match.expenseType = sub;
  }
  return match;
}
