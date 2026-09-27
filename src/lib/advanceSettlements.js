

export function settledAgainstPayableExpr(payableIdExpr) {
  return {
    $add: [
      {
        $cond: [
          { $eq: [{ $ifNull: ["$settlesPayableId", null] }, payableIdExpr] },
          { $ifNull: ["$settlesPayableAmount", "$amount"] },
          0,
        ],
      },
      {
        $sum: {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ["$settlements", []] },
                cond: { $eq: ["$$this.payableId", payableIdExpr] },
              },
            },
            as: "s",
            in: "$$s.amount",
          },
        },
      },
    ],
  };
}

export function settlesPayableExprMatch(payableIdExpr) {
  return {
    $or: [
      { $eq: [{ $ifNull: ["$settlesPayableId", null] }, payableIdExpr] },
      {
        $in: [
          payableIdExpr,
          { $map: { input: { $ifNull: ["$settlements", []] }, as: "s", in: "$$s.payableId" } },
        ],
      },
    ],
  };
}

export const settledTotalExpr = {
  $add: [
    {
      $cond: [
        { $ne: [{ $ifNull: ["$settlesPayableId", null] }, null] },
        { $ifNull: ["$settlesPayableAmount", "$amount"] },
        0,
      ],
    },
    { $sum: { $map: { input: { $ifNull: ["$settlements", []] }, as: "s", in: "$$s.amount" } } },
  ],
};

export function totalSettledAmount(advance) {
  const legacy = advance.settlesPayableId != null ? Number(advance.settlesPayableAmount ?? advance.amount ?? 0) : 0;
  const arr = (advance.settlements || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  return Math.round((legacy + arr) * 100) / 100;
}

export function settlementLinesFor(advance) {
  const lines = [];
  if (advance.settlesPayableId != null) {
    lines.push({
      payableId: advance.settlesPayableId,
      amount: Number(advance.settlesPayableAmount ?? advance.amount ?? 0),
      note: advance.remarks || "",
      settledAt: advance.date,
    });
  }
  (advance.settlements || []).forEach((s) => {
    lines.push({
      _id: s._id,
      payableId: s.payableId,
      amount: Number(s.amount) || 0,
      note: s.note || "",
      settledAt: s.settledAt || advance.date,
    });
  });
  return lines;
}

export function foldLegacyIntoArray(advance, { performedBy } = {}) {
  if (advance.settlesPayableId == null) return false;
  advance.settlements = advance.settlements || [];
  advance.settlements.push({
    payableId: advance.settlesPayableId,
    amount: advance.settlesPayableAmount ?? advance.amount,
    note: "Migrated from single-settlement field",
    settledAt: advance.date,
    settledBy: performedBy,
  });
  advance.settlesPayableId = null;
  advance.settlesPayableAmount = null;
  return true;
}
