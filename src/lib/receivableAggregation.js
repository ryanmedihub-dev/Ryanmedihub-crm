import { buildAgeingStages } from "@/lib/ageing";
import { unsettledMethodsSync } from "@/lib/masterData";
import { settledTotalExpr } from "@/lib/advanceSettlements";

function buildReceiptLookupStages(txCollectionName, { projectDate = false, dateCeiling = null } = {}) {
  const postJoinFilter = { costType: "Revenue", approvalStatus: "APPROVED", method: { $nin: unsettledMethodsSync() } };
  const dateCap = dateCeiling ? [{ $match: { date: { $lte: dateCeiling } } }] : [];
  const directProject = projectDate
    ? { date: 1, amount: 1, receivableAllocations: 1 }
    : { amount: 1, receivableAllocations: 1 };
  const allocProject = projectDate ? { date: 1, receivableAllocations: 1 } : { receivableAllocations: 1 };

  return [
    {
      $lookup: {
        from: txCollectionName,
        localField: "_id",
        foreignField: "receivableId",
        pipeline: [...dateCap, { $match: postJoinFilter }, { $project: directProject }],
        as: "directReceipts",
      },
    },
    {
      $lookup: {
        from: txCollectionName,
        localField: "_id",
        foreignField: "receivableAllocations.receivableId",
        pipeline: [...dateCap, { $match: postJoinFilter }, { $project: allocProject }],
        as: "allocReceipts",
      },
    },
    {
      
      
      
      
      $addFields: {
        directOnly: {
          $filter: {
            input: "$directReceipts",
            cond: { $eq: [{ $size: { $ifNull: ["$$this.receivableAllocations", []] } }, 0] },
          },
        },
      },
    },
  ];
}

const allocContribution = {
  $sum: {
    $map: {
      input: {
        $filter: {
          input: { $ifNull: ["$$tx.receivableAllocations", []] },
          cond: { $eq: ["$$this.receivableId", "$_id"] },
        },
      },
      as: "a",
      in: "$$a.amount",
    },
  },
};

export function buildReceivableAggregationStages(
  txCollectionName,
  advancesCollectionName = "advances",
  borrowingsCollectionName = "borrowings",
) {
  return [
    ...buildReceiptLookupStages(txCollectionName),
    {
      $lookup: {
        from: advancesCollectionName,
        let: { receivableId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$receivableId", "$$receivableId"] },
                  { $eq: ["$direction", "IN"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $group: { _id: null, received: { $sum: "$amount" }, receiptCount: { $sum: 1 } } },
        ],
        as: "advanceAgg",
      },
    },
    {
      $lookup: {
        from: borrowingsCollectionName,
        let: { receivableId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$settlesReceivableId", "$$receivableId"] },
                  { $eq: ["$direction", "IN"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $group: { _id: null, received: { $sum: "$amount" }, receiptCount: { $sum: 1 } } },
        ],
        as: "borrowingSettlementAgg",
      },
    },
    {
      
      
      
      $lookup: {
        from: advancesCollectionName,
        let: { receivableId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$receivableId", "$$receivableId"] },
                  { $eq: ["$direction", "OUT"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          {
            
            
            
            $project: {
              amt: settledTotalExpr,
              hasSettlement: {
                $or: [
                  { $ne: [{ $ifNull: ["$settlesPayableId", null] }, null] },
                  { $gt: [{ $size: { $ifNull: ["$settlements", []] } }, 0] },
                ],
              },
              lineCount: {
                $add: [
                  { $cond: [{ $ne: [{ $ifNull: ["$settlesPayableId", null] }, null] }, 1, 0] },
                  { $size: { $ifNull: ["$settlements", []] } },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              received: { $sum: "$amt" },
              receiptCount: { $sum: "$lineCount" },
            },
          },
        ],
        as: "advancePayableSettlementAgg",
      },
    },
    {
      $addFields: {
        received: {
          $add: [
            { $sum: "$directOnly.amount" },
            { $sum: { $map: { input: "$allocReceipts", as: "tx", in: allocContribution } } },
            { $ifNull: [{ $arrayElemAt: ["$advanceAgg.received", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$borrowingSettlementAgg.received", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$advancePayableSettlementAgg.received", 0] }, 0] },
          ],
        },
        receiptCount: {
          $add: [
            { $size: "$directOnly" },
            { $size: "$allocReceipts" },
            { $ifNull: [{ $arrayElemAt: ["$advanceAgg.receiptCount", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$borrowingSettlementAgg.receiptCount", 0] }, 0] },
            { $ifNull: [{ $arrayElemAt: ["$advancePayableSettlementAgg.receiptCount", 0] }, 0] },
          ],
        },
      },
    },
    {
      $addFields: {
        pending: { $max: [{ $subtract: ["$totalAmount", "$received"] }, 0] },
        netPending: { $subtract: ["$totalAmount", "$received"] },
        advanceInHand: { $max: [{ $subtract: ["$received", "$totalAmount"] }, 0] },
        status: {
          $switch: {
            branches: [
              { case: { $lte: ["$totalAmount", "$received"] }, then: "Received" },
              {
                case: {
                  $and: [
                    { $ne: [{ $ifNull: ["$dueDate", null] }, null] },
                    { $lt: ["$dueDate", "$$NOW"] },
                    { $lt: ["$received", "$totalAmount"] },
                  ],
                },
                then: "Overdue",
              },
              { case: { $gt: ["$received", 0] }, then: "Partially Received" },
            ],
            default: "Pending",
          },
        },
      },
    },
    ...buildAgeingStages(),
    {
      $project: {
        directReceipts: 0,
        allocReceipts: 0,
        directOnly: 0,
        advanceAgg: 0,
        borrowingSettlementAgg: 0,
        advancePayableSettlementAgg: 0,
      },
    },
  ];
}

export function buildReceivableGroupedStages(
  txCollectionName,
  {
    level,
    category,
    subType,
    branch,
    from,
    to,
    subTypeField = "purpose",
    groupBy = "category",
    advancesCollectionName = "advances",
    borrowingsCollectionName = "borrowings",
  } = {},
) {
  const isVendor = groupBy === "vendor";
  
  
  
  const isParty = groupBy === "party";
  const match = { isCancelled: { $ne: true } };
  if (isVendor) match["payer.kind"] = "VENDOR";
  if (branch) match.branch = branch;
  if (!isVendor && !isParty) {
    if (level !== 1 && category) match.revenueCategory = category;
    if (level === 2 && subType) match[subTypeField] = subType;
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
    ? { bucket: "$payer.refId" }
    : isParty
      ? { bucket: { $ifNull: ["$payer.label", "Unknown"] } }
      : level === 1
        ? { bucket: { $ifNull: ["$revenueCategory", "Uncategorised"] } }
        : { bucket: { $ifNull: [`$${subTypeField}`, "Uncategorised"] } };

  return [
    { $match: match },
    ...buildReceiptLookupStages(txCollectionName, { projectDate: true, dateCeiling: toDate }),
    {
      $addFields: {
        
        
        allocReceiptsFlat: {
          $map: {
            input: "$allocReceipts",
            as: "tx",
            in: { date: "$$tx.date", amount: allocContribution },
          },
        },
      },
    },
    {
      $lookup: {
        from: advancesCollectionName,
        let: { receivableId: "$_id" },
        pipeline: [
          ...(toDate ? [{ $match: { date: { $lte: toDate } } }] : []),
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$receivableId", "$$receivableId"] },
                  { $eq: ["$direction", "IN"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $project: { date: 1, amount: 1 } },
        ],
        as: "advanceRecoveries",
      },
    },
    {
      
      
      $lookup: {
        from: advancesCollectionName,
        let: { receivableId: "$_id" },
        pipeline: [
          ...(toDate ? [{ $match: { date: { $lte: toDate } } }] : []),
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$receivableId", "$$receivableId"] },
                  { $eq: ["$direction", "OUT"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          {
            
            
            
            $project: {
              date: 1,
              lines: {
                $concatArrays: [
                  {
                    $cond: [
                      { $ne: [{ $ifNull: ["$settlesPayableId", null] }, null] },
                      [{ $ifNull: ["$settlesPayableAmount", "$amount"] }],
                      [],
                    ],
                  },
                  { $map: { input: { $ifNull: ["$settlements", []] }, as: "s", in: "$$s.amount" } },
                ],
              },
            },
          },
          { $unwind: "$lines" },
          { $project: { date: 1, amount: "$lines" } },
        ],
        as: "advancePayableSettlements",
      },
    },
    {
      
      
      
      
      $lookup: {
        from: borrowingsCollectionName,
        let: { receivableId: "$_id" },
        pipeline: [
          ...(toDate ? [{ $match: { date: { $lte: toDate } } }] : []),
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$settlesReceivableId", "$$receivableId"] },
                  { $eq: ["$direction", "IN"] },
                  { $ne: ["$isCancelled", true] },
                ],
              },
            },
          },
          { $project: { date: 1, amount: 1 } },
        ],
        as: "borrowingRecoveries",
      },
    },
    {
      $addFields: {
        receipts: {
          $concatArrays: [
            { $map: { input: "$directOnly", as: "d", in: { date: "$$d.date", amount: "$$d.amount" } } },
            "$allocReceiptsFlat",
            "$advanceRecoveries",
            "$advancePayableSettlements",
            "$borrowingRecoveries",
          ],
        },
      },
    },
    {
      $addFields: {
        receivedBeforeRange: {
          $sum: {
            $map: {
              input: { $filter: { input: "$receipts", cond: beforeRange("$$this.date") } },
              as: "r",
              in: "$$r.amount",
            },
          },
        },
        receivedInRange: {
          $sum: {
            $map: {
              input: { $filter: { input: "$receipts", cond: inRange("$$this.date") } },
              as: "r",
              in: "$$r.amount",
            },
          },
        },
        raisedBeforeRange: { $cond: [beforeRange("$createdAt"), "$totalAmount", 0] },
        raisedInRange: { $cond: [inRange("$createdAt"), "$totalAmount", 0] },
      },
    },
    {
      $addFields: {
        openingRow: { $max: [{ $subtract: ["$raisedBeforeRange", "$receivedBeforeRange"] }, 0] },
      },
    },
    {
      $group: {
        _id: groupId,
        ...(isVendor ? { label: { $first: "$payer.label" } } : {}),
        opening: { $sum: "$openingRow" },
        movement: { $sum: "$raisedInRange" },
        settled: { $sum: "$receivedInRange" },
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
