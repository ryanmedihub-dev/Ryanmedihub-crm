import AccountPeriod from "@/models/AccountPeriod";
import { accountsSync, nonCashMethodsSync } from "@/lib/masterData";
export const APPROVAL_EXCLUDED = ["PENDING", "REJECTED"];

export function buildBalanceMatch({
  account,
  accounts,
  from,
  to,
  transactionCategory,
  method,
  branch,
} = {}) {
  const match = {
    approvalStatus: { $nin: APPROVAL_EXCLUDED },
    method: { $nin: nonCashMethodsSync() },
  };

  if (account) match.furtherMode = account;
  else match.furtherMode = { $in: accounts || accountsSync() };

  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }

  if (transactionCategory) match.transactionCategory = transactionCategory;
  if (method) {
    if (nonCashMethodsSync().includes(method)) {
      match.method = { $in: [], $nin: nonCashMethodsSync() };
    } else {
      match.method = method;
    }
  }
  if (branch) match.branch = branch;

  return match;
}

export const SIGNED_AMOUNT = {
  $cond: [{ $eq: ["$costType", "Revenue"] }, "$amount", { $multiply: ["$amount", -1] }],
};

export function buildContraMatch({ from, to, branch } = {}) {
  const match = { isCancelled: { $ne: true } };
  if (branch) match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  return match;
}

export function buildContraUnionStage({ from, to, branch, collectionName = "accounttransfers" } = {}) {
  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: buildContraMatch({ from, to, branch }) },
        {
          $project: {
            rows: [
              { account: "$fromAccount", in: 0, out: "$amount", isContra: true },
              { account: "$toAccount", in: "$amount", out: 0, isContra: true },
            ],
          },
        },
        { $unwind: "$rows" },
        { $replaceRoot: { newRoot: "$rows" } },
      ],
    },
  };
}

export function buildContraLedgerUnionStage({
  account,
  from,
  to,
  branch,
  transactionCategory,
  method,
  collectionName = "accounttransfers",
} = {}) {
  if (transactionCategory || method) return null;

  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        {
          $match: {
            ...buildContraMatch({ from, to, branch }),
            $or: [{ fromAccount: account }, { toAccount: account }],
          },
        },
        {
          $project: {
            date: 1,
            amount: 1,
            reference: 1,
            remarks: 1,
            fromAccount: 1,
            toAccount: 1,
            isContra: { $literal: true },
            sourceKind: { $literal: "CONTRA" },
            signedAmount: {
              $cond: [
                { $eq: ["$toAccount", account] },
                "$amount",
                { $multiply: ["$amount", -1] },
              ],
            },
          },
        },
      ],
    },
  };
}

export function buildSuspenseMatch({ from, to, branch } = {}) {
  const match = { isResolved: { $ne: true }, isCancelled: { $ne: true } };
  if (branch) match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  return match;
}

export function buildSuspenseUnionStage({ from, to, branch, collectionName = "suspenseentries" } = {}) {
  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: buildSuspenseMatch({ from, to, branch }) },
        {
          $project: {
            account: "$account",
            in: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] },
            out: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] },
            isContra: { $literal: false },
            isSuspense: { $literal: true },
          },
        },
      ],
    },
  };
}

export function buildSuspenseLedgerUnionStage({
  account,
  from,
  to,
  branch,
  transactionCategory,
  method,
  collectionName = "suspenseentries",
} = {}) {
  if (transactionCategory || method) return null;

  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: { ...buildSuspenseMatch({ from, to, branch }), account } },
        {
          $project: {
            date: 1,
            amount: 1,
            reference: 1,
            remarks: 1,
            direction: 1,
            branch: 1,
            isSuspense: { $literal: true },
            isContra: { $literal: false },
            sourceKind: { $literal: "SUSPENSE" },
            signedAmount: {
              $cond: [{ $eq: ["$direction", "OUT"] }, { $multiply: ["$amount", -1] }, "$amount"],
            },
          },
        },
      ],
    },
  };
}

export function buildBorrowingMatch({ from, to, branch } = {}) {
  const match = { isCancelled: { $ne: true } };
  if (branch) match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  return match;
}

export function buildBorrowingUnionStage({ from, to, branch, collectionName = "borrowings" } = {}) {
  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: buildBorrowingMatch({ from, to, branch }) },
        {
          $project: {
            account: "$account",
            in: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] },
            out: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] },
            isContra: { $literal: false },
            isBorrowing: { $literal: true },
          },
        },
      ],
    },
  };
}

export function buildBorrowingLedgerUnionStage({
  account,
  from,
  to,
  branch,
  transactionCategory,
  method,
  collectionName = "borrowings",
} = {}) {
  if (transactionCategory || method) return null;

  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: { ...buildBorrowingMatch({ from, to, branch }), account } },
        {
          $project: {
            date: 1,
            amount: 1,
            reference: 1,
            remarks: 1,
            direction: 1,
            branch: 1,
            payableId: 1,
            isSuspense: { $literal: false },
            isContra: { $literal: false },
            isBorrowing: { $literal: true },
            sourceKind: { $literal: "BORROWING" },
            signedAmount: {
              $cond: [{ $eq: ["$direction", "OUT"] }, { $multiply: ["$amount", -1] }, "$amount"],
            },
          },
        },
      ],
    },
  };
}

export async function computeBorrowingMovements(account, from, to, session = null, branch = null) {
  const { default: Borrowing } = await import("@/models/Borrowing");

  const [agg] = await Borrowing.aggregate([
    { $match: { ...buildBorrowingMatch({ from, to, branch }), account } },
    {
      $group: {
        _id: null,
        totalIn: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] } },
        totalOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] } },
        borrowingCount: { $sum: 1 },
      },
    },
  ]).session(session);

  return {
    totalIn: round2(agg?.totalIn || 0),
    totalOut: round2(agg?.totalOut || 0),
    borrowingCount: agg?.borrowingCount || 0,
  };
}

export function buildAdvanceMatch({ from, to, branch } = {}) {
  const match = { isCancelled: { $ne: true } };
  if (branch) match.branch = branch;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  return match;
}

export function buildAdvanceUnionStage({ from, to, branch, collectionName = "advances" } = {}) {
  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: buildAdvanceMatch({ from, to, branch }) },
        {
          $project: {
            account: "$account",
            in: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] },
            out: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] },
            isContra: { $literal: false },
            isAdvance: { $literal: true },
          },
        },
      ],
    },
  };
}

export function buildAdvanceLedgerUnionStage({
  account,
  from,
  to,
  branch,
  transactionCategory,
  method,
  collectionName = "advances",
} = {}) {
  if (transactionCategory || method) return null;

  return {
    $unionWith: {
      coll: collectionName,
      pipeline: [
        { $match: { ...buildAdvanceMatch({ from, to, branch }), account } },
        {
          $project: {
            date: 1,
            amount: 1,
            reference: 1,
            remarks: 1,
            direction: 1,
            branch: 1,
            receivableId: 1,
            isSuspense: { $literal: false },
            isContra: { $literal: false },
            isAdvance: { $literal: true },
            sourceKind: { $literal: "ADVANCE" },
            signedAmount: {
              $cond: [{ $eq: ["$direction", "OUT"] }, { $multiply: ["$amount", -1] }, "$amount"],
            },
          },
        },
      ],
    },
  };
}

export async function computeAdvanceMovements(account, from, to, session = null, branch = null) {
  const { default: Advance } = await import("@/models/Advance");

  const [agg] = await Advance.aggregate([
    { $match: { ...buildAdvanceMatch({ from, to, branch }), account } },
    {
      $group: {
        _id: null,
        totalIn: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] } },
        totalOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] } },
        advanceCount: { $sum: 1 },
      },
    },
  ]).session(session);

  return {
    totalIn: round2(agg?.totalIn || 0),
    totalOut: round2(agg?.totalOut || 0),
    advanceCount: agg?.advanceCount || 0,
  };
}

export async function computeSuspenseMovements(account, from, to, session = null, branch = null) {
  const { default: SuspenseEntry } = await import("@/models/SuspenseEntry");

  const [agg] = await SuspenseEntry.aggregate([
    { $match: { ...buildSuspenseMatch({ from, to, branch }), account } },
    {
      $group: {
        _id: null,
        totalIn: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, 0, "$amount"] } },
        totalOut: { $sum: { $cond: [{ $eq: ["$direction", "OUT"] }, "$amount", 0] } },
        suspenseCount: { $sum: 1 },
      },
    },
  ]).session(session);

  return {
    totalIn: round2(agg?.totalIn || 0),
    totalOut: round2(agg?.totalOut || 0),
    suspenseCount: agg?.suspenseCount || 0,
  };
}

export const TRANSACTION_TO_MOVEMENT = {
  $project: {
    account: "$furtherMode",
    in: { $cond: [{ $eq: ["$costType", "Revenue"] }, "$amount", 0] },
    out: { $cond: [{ $eq: ["$costType", "Revenue"] }, 0, "$amount"] },
    isContra: { $literal: false },
  },
};

const isSeedRow = (p) =>
  !!p && new Date(p.periodStart).getTime() === new Date(p.periodEnd).getTime();

async function resolveAnchor(account, asOf, branch) {
  if (branch) {
    const prior = await AccountPeriod.findOne({
      account,
      branch,
      isClosed: true,
      periodEnd: { $lte: asOf },
    })
      .sort({ periodEnd: -1 })
      .lean();
    if (!prior) return null;
    return {
      value: prior.closingBalance,
      anchorDate: prior.periodEnd,
      isSeed: isSeedRow(prior),
      source: { periodEnd: prior.periodEnd, id: prior._id },
      derivedFromBranches: false,
    };
  }

  const closedPeriod = await AccountPeriod.findOne({
    account,
    branch: null,
    isClosed: true,
    periodEnd: { $lte: asOf },
    $expr: { $ne: ["$periodStart", "$periodEnd"] },
  })
    .sort({ periodEnd: -1 })
    .lean();

  if (closedPeriod) {
    return {
      value: closedPeriod.closingBalance,
      anchorDate: closedPeriod.periodEnd,
      isSeed: false,
      source: { periodEnd: closedPeriod.periodEnd, id: closedPeriod._id },
      derivedFromBranches: false,
    };
  }

  const perBranch = await AccountPeriod.aggregate([
    { $match: { account, branch: { $ne: null }, isClosed: true, periodEnd: { $lte: asOf } } },
    { $sort: { periodEnd: -1 } },
    {
      $group: {
        _id: "$branch",
        closingBalance: { $first: "$closingBalance" },
        periodStart: { $first: "$periodStart" },
        periodEnd: { $first: "$periodEnd" },
      },
    },
  ]);

  if (perBranch.length > 0) {
    const latest = perBranch.reduce(
      (l, b) => (!l || b.periodEnd > l ? b.periodEnd : l),
      null,
    );
    return {
      value: perBranch.reduce((t, b) => t + (b.closingBalance || 0), 0),
      anchorDate: latest,
      isSeed: true,
      source: {
        periodEnd: latest,
        branches: perBranch.map((b) => ({ branch: b._id, openingBalance: b.closingBalance })),
      },
      derivedFromBranches: true,
    };
  }

  const companySeed = await AccountPeriod.findOne({
    account,
    branch: null,
    isClosed: true,
    periodEnd: { $lte: asOf },
  })
    .sort({ periodEnd: -1 })
    .lean();

  if (!companySeed) return null;
  return {
    value: companySeed.closingBalance,
    anchorDate: companySeed.periodEnd,
    isSeed: isSeedRow(companySeed),
    source: { periodEnd: companySeed.periodEnd, id: companySeed._id },
    derivedFromBranches: false,
  };
}

export async function computeNetMovement(account, from, to, branch = null, session = null) {
  const { default: Transactions } = await import("@/models/Transactions");

  const runTxAgg = () =>
    Transactions.aggregate([
      { $match: buildBalanceMatch({ account, from, to, branch }) },
      { $group: { _id: null, net: { $sum: SIGNED_AMOUNT } } },
    ]).session(session);

  let txAggResult;
  let contra;
  let suspense;
  let borrowing;
  let advance;

  if (session) {
    txAggResult = await runTxAgg();
    contra = await computeContraMovements(account, from, to, session, branch);
    suspense = await computeSuspenseMovements(account, from, to, session, branch);
    borrowing = await computeBorrowingMovements(account, from, to, session, branch);
    advance = await computeAdvanceMovements(account, from, to, session, branch);
  } else {
    [txAggResult, contra, suspense, borrowing, advance] = await Promise.all([
      runTxAgg(),
      computeContraMovements(account, from, to, session, branch),
      computeSuspenseMovements(account, from, to, session, branch),
      computeBorrowingMovements(account, from, to, session, branch),
      computeAdvanceMovements(account, from, to, session, branch),
    ]);
  }

  const txAgg = txAggResult[0];

  return round2(
    (txAgg?.net || 0) +
      (contra.totalIn - contra.totalOut) +
      (suspense.totalIn - suspense.totalOut) +
      (borrowing.totalIn - borrowing.totalOut) +
      (advance.totalIn - advance.totalOut),
  );
}

export async function getOpeningBalance(account, periodStart, branch = null) {
  const asOf = new Date(periodStart);
  const anchor = await resolveAnchor(account, asOf, branch);

  const carryFrom = anchor
    ? anchor.isSeed
      ? new Date(anchor.anchorDate)
      : new Date(new Date(anchor.anchorDate).getTime() + 1)
    : null;
  const carryTo = new Date(asOf.getTime() - 1);

  let carried = 0;
  if (!carryFrom || carryFrom.getTime() <= carryTo.getTime()) {
    carried = await computeNetMovement(account, carryFrom, carryTo, branch);
  }

  const base = anchor?.value ?? 0;
  return {
    openingBalance: round2(base + carried),
    source: anchor?.source ?? null,
    seeded: !!anchor,
    derivedFromBranches: anchor?.derivedFromBranches ?? false,
    anchorBalance: round2(base),
    carriedForward: round2(carried),
  };
}

export async function getOpeningBalances(accounts, periodStart, branch = null) {
  const entries = await Promise.all(
    accounts.map(async (a) => [a, await getOpeningBalance(a, periodStart, branch)]),
  );
  return Object.fromEntries(entries);
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function computeContraMovements(account, from, to, session = null, branch = null) {
  const { default: AccountTransfer } = await import("@/models/AccountTransfer");

  const [agg] = await AccountTransfer.aggregate([
    {
      $match: {
        ...buildContraMatch({ from, to, branch }),
        $or: [{ fromAccount: account }, { toAccount: account }],
      },
    },
    {
      $group: {
        _id: null,
        totalIn: { $sum: { $cond: [{ $eq: ["$toAccount", account] }, "$amount", 0] } },
        totalOut: { $sum: { $cond: [{ $eq: ["$fromAccount", account] }, "$amount", 0] } },
        contraCount: { $sum: 1 },
      },
    },
  ]).session(session);

  return {
    totalIn: round2(agg?.totalIn || 0),
    totalOut: round2(agg?.totalOut || 0),
    contraCount: agg?.contraCount || 0,
  };
}

export async function getAccountBalance(account, asOfDate, branch = null) {
  const to = asOfDate ? new Date(asOfDate) : new Date();
  const { openingBalance } = await getOpeningBalance(
    account,
    new Date(to.getTime() + 1),
    branch,
  );
  return openingBalance;
}
