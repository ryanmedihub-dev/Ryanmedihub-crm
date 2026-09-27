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

export function buildPayableGroupedStages(txCollectionName, { level, category, subType, branch, from, to, groupBy = "category", subGroupBy, purpose, payeeKind, party, borrowingsCollectionName = "borrowings", advancesCollectionName = "advances" } = {}) {
  const isVendor = groupBy === "vendor";
  
  
  const isParty = groupBy === "party";
  
  
  
  
  const isSubParty = level === 2 && subGroupBy === "party";
  
  
  const match = { isCancelled: { $ne: true } };
  if (isVendor) match["payee.kind"] = "VENDOR";
  else if (payeeKind) match["payee.kind"] = payeeKind;
  if (purpose) match.purpose = Array.isArray(purpose) ? { $in: purpose } : purpose;
  if (branch) match.branch = branch;
  
  
  
  if (party && !isVendor && !isParty) match["payee.label"] = { $regex: party, $options: "i" };
  if (!isVendor && !isParty) {
    if (level !== 1 && category) match.expenseCategory = category;
    if (level === 2 && subType && !isSubParty) match.expenseSubType = subType;
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
    : isParty || isSubParty
      ? { bucket: { $ifNull: ["$payee.label", "Unknown"] } }
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
