import { buildAgeingStages } from "@/lib/ageing";
import { settledAgainstPayableExpr, settlesPayableExprMatch } from "@/lib/advanceSettlements";

export function buildPayableAggregationStages(
  txCollectionName,
  borrowingsCollectionName = "borrowings",
  advancesCollectionName = "advances",
) {
  return [
    {
      $lookup: {
        from: txCollectionName,
        let: { payableId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$payableId", "$$payableId"] },
                  { $eq: ["$approvalStatus", "APPROVED"] },
                  // No unsettled-method (paid_by_other/paid_to_external) exclusion here —
                  // unlike a blanket balance/P&L rollup, this lookup only ever matches
                  // transactions that were explicitly linked to THIS payable's own _id via
                  // an intentional payableId, which only happens through deliberate
                  // "settle this payable" user action (RecordPaymentModal, vouchers, collab
                  // settlements) — never through the "spawn a brand-new document" path an
                  // unlinked external-party transaction takes (that path always saves
                  // payableId: null, so it can never reach this lookup regardless). If the
                  // vendor was paid — even via an external party fronting the money — this
                  // payable is genuinely settled; excluding the method here was the bug that
                  // let a "Paid by Other" payment against an existing payable leave it stuck
                  // pending forever while a duplicate, disconnected payable was raised to
                  // the external party.
                ],
              },
            },
          },
          { $group: { _id: null, paid: { $sum: "$amount" }, paymentCount: { $sum: 1 } } },
        ],
        as: "paymentAgg",
      },
    },
    {
      $lookup: {
        from: borrowingsCollectionName,
        let: { payableId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$payableId", "$$payableId"] },
                  { $eq: ["$direction", "OUT"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $group: { _id: null, paid: { $sum: "$amount" }, paymentCount: { $sum: 1 } } },
        ],
        as: "borrowingAgg",
      },
    },
    {
      $lookup: {
        from: advancesCollectionName,
        let: { payableId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  settlesPayableExprMatch("$$payableId"),
                  { $eq: ["$direction", "OUT"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              // A document can now hold several settlement lines (see settlements array on
              // the Advance model) — sum only the ones that target THIS payable, not the
              // whole document, so a doc settling multiple payables isn't double-counted here.
              paid: { $sum: settledAgainstPayableExpr("$$payableId") },
              paymentCount: { $sum: 1 },
            },
          },
        ],
        as: "advanceSettlementAgg",
      },
    },
    {
      $addFields: {
        paid: {
          $add: [
            { $ifNull: [{ $arrayElemAt: ["$paymentAgg.paid", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$borrowingAgg.paid", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$advanceSettlementAgg.paid", 0] }, 0] },
          ],
        },
        paymentCount: {
          $add: [
            { $ifNull: [{ $arrayElemAt: ["$paymentAgg.paymentCount", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$borrowingAgg.paymentCount", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$advanceSettlementAgg.paymentCount", 0] }, 0] },
          ],
        },
      },
    },
    {
      $addFields: {
        pending: { $max: [{ $subtract: ["$totalAmount", "$paid"] }, 0] },
        netPending: { $subtract: ["$totalAmount", "$paid"] },
        advanceInHand: { $max: [{ $subtract: ["$paid", "$totalAmount"] }, 0] },
        status: {
          $switch: {
            branches: [
              { case: { $lte: ["$totalAmount", "$paid"] }, then: "Paid" },
              {
                case: {
                  $and: [
                    { $ne: [{ $ifNull: ["$dueDate", null] }, null] },
                    { $lt: ["$dueDate", "$$NOW"] },
                    { $lt: ["$paid", "$totalAmount"] },
                  ],
                },
                then: "Overdue",
              },
              { case: { $gt: ["$paid", 0] }, then: "Partially Paid" },
            ],
            default: "Pending",
          },
        },
      },
    },
    ...buildAgeingStages(),
    { $project: { paymentAgg: 0, borrowingAgg: 0, advanceSettlementAgg: 0 } },
  ];
}

export function buildPayableGroupedStages(txCollectionName, { level, category, subType, branch, from, to, groupBy = "category", borrowingsCollectionName = "borrowings", advancesCollectionName = "advances" } = {}) {
  const isVendor = groupBy === "vendor";
  const match = { isCancelled: { $ne: true } };
  if (isVendor) match["payee.kind"] = "VENDOR";
  if (branch) match.branch = branch;
  if (!isVendor) {
    if (level !== 1 && category) match.expenseCategory = category;
    if (level === 2 && subType) match.expenseSubType = subType;
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const inRange = (field) => ({
    $and: [
      fromDate ? { $gte: [field, fromDate] } : { $literal: true },
      toDate ? { $lte: [field, toDate] } : { $literal: true },
    ],
  });
  const beforeRange = (field) => (fromDate ? { $lt: [field, fromDate] } : { $literal: false });

  const groupId = isVendor
    ? { bucket: "$payee.refId" }
    : level === 1
      ? { bucket: { $ifNull: ["$expenseCategory", "Uncategorised"] } }
      : { bucket: { $ifNull: ["$expenseSubType", "Uncategorised"] } };

  return [
    { $match: match },
    {
      $lookup: {
        from: txCollectionName,
        let: { payableId: "$_id" },
        pipeline: [
          ...(toDate ? [{ $match: { date: { $lte: toDate } } }] : []),
          {
            // Same reasoning as buildPayableAggregationStages' paymentAgg lookup above: no
            // unsettled-method exclusion, since a payableId match here only ever comes from
            // a deliberate "settle this payable" link.
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$payableId", "$$payableId"] },
                  { $eq: ["$approvalStatus", "APPROVED"] },
                ],
              },
            },
          },
          { $project: { amount: 1, date: 1 } },
        ],
        as: "payments",
      },
    },
    {
      $lookup: {
        from: borrowingsCollectionName,
        let: { payableId: "$_id" },
        pipeline: [
          ...(toDate ? [{ $match: { date: { $lte: toDate } } }] : []),
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$payableId", "$$payableId"] },
                  { $eq: ["$direction", "OUT"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $project: { amount: 1, date: 1 } },
        ],
        as: "borrowingPayments",
      },
    },
    {
      // Advances applied against a payable count as money paid, exactly as they do in
      // buildPayableAggregationStages. Omitting them here made the grouped rollup overstate
      // what is still owed versus the document list built from the other pipeline.
      $lookup: {
        from: advancesCollectionName,
        let: { payableId: "$_id" },
        pipeline: [
          ...(toDate ? [{ $match: { date: { $lte: toDate } } }] : []),
          {
            $match: {
              $expr: {
                $and: [
                  settlesPayableExprMatch("$$payableId"),
                  { $eq: ["$direction", "OUT"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          // A doc's own date covers every line on it — using it for every matched line here
          // (rather than each line's settledAt) mirrors the original single-settlement
          // behaviour and keeps the range-bucketing math unchanged.
          { $project: { amount: settledAgainstPayableExpr("$$payableId"), date: 1 } },
        ],
        as: "advancePayments",
      },
    },
    {
      $addFields: {
        payments: { $concatArrays: ["$payments", "$borrowingPayments", "$advancePayments"] },
      },
    },
    {
      $addFields: {
        paidBeforeRange: {
          $sum: {
            $map: {
              input: { $filter: { input: "$payments", cond: beforeRange("$$this.date") } },
              as: "p",
              in: "$$p.amount",
            },
          },
        },
        paidInRange: {
          $sum: {
            $map: {
              input: { $filter: { input: "$payments", cond: inRange("$$this.date") } },
              as: "p",
              in: "$$p.amount",
            },
          },
        },
        raisedBeforeRange: { $cond: [beforeRange("$createdAt"), "$totalAmount", 0] },
        raisedInRange: { $cond: [inRange("$createdAt"), "$totalAmount", 0] },
      },
    },
    {
      $addFields: {
        openingRow: { $max: [{ $subtract: ["$raisedBeforeRange", "$paidBeforeRange"] }, 0] },
      },
    },
    {
      $group: {
        _id: groupId,
        ...(isVendor ? { label: { $first: "$payee.label" } } : {}),
        opening: { $sum: "$openingRow" },
        movement: { $sum: "$raisedInRange" },
        settled: { $sum: "$paidInRange" },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        key: isVendor ? { $toString: "$_id.bucket" } : "$_id.bucket",
        label: isVendor ? "$label" : "$_id.bucket",
        opening: 1,
        movement: 1,
        settled: 1,
        closing: { $add: ["$opening", { $subtract: ["$movement", "$settled"] }] },
        count: 1,
      },
    },
    { $sort: isVendor ? { closing: -1 } : { key: 1 } },
  ];
}
