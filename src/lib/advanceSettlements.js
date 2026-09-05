// Shared helpers for advance→payable settlements, now that one advance can settle several
// payables (e.g. a 10k advance split 2k/3k/1k/2k across four payables). A document holds its
// settlement(s) two ways: the original single settlesPayableId/settlesPayableAmount pair
// (pre-multi-settle rows — never bulk-migrated, still read as-is) and the `settlements` array
// every settle action writes to now, having first folded any pre-existing legacy pair into the
// array (see foldLegacyIntoArray) so a document is never split across both shapes going
// forward. Every consumer that needs "how much has this advance settled" must look at both —
// these helpers are the one place that logic lives.

// Mongo $expr fragment: total this advance has settled against ONE specific payable.
// payableIdExpr is a field-path/variable expression, e.g. "$$payableId".
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

// Mongo $expr fragment: does this advance document settle the given payable at all.
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

// Mongo $expr fragment: total this advance has settled across ALL payables (legacy pair +
// every array line) — what matters for netting the advance's own receivable.
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

// Plain-JS equivalent of settledTotalExpr, for an already-fetched Mongoose doc/lean object.
export function totalSettledAmount(advance) {
  const legacy = advance.settlesPayableId != null ? Number(advance.settlesPayableAmount ?? advance.amount ?? 0) : 0;
  const arr = (advance.settlements || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  return Math.round((legacy + arr) * 100) / 100;
}

// Normalized {payableId, amount, note, settledAt}[] for one advance doc — legacy pair (if
// present) folded in as a synthetic first line. For read-only surfaces (reports, exports, UI).
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

// Folds a legacy single settlesPayableId/settlesPayableAmount pair (if present) into the
// `settlements` array as its first entry, then clears the legacy fields — so a document never
// settles via both shapes at once. Mutates `advance` in place; caller must still .save() it.
// No-op if there's nothing legacy to fold. Returns whether it did anything.
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
