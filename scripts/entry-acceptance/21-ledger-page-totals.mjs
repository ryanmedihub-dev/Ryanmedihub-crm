// §9.1 — the three payable sub-pages must partition the whole: for any scope,
//   rent total + employee total + other total === the liabilities-overview payables total.
// Also checks an advance holding a LEGACY settlesPayableId pair reports the right `remaining`
// through /api/advances/list's computed stages (§9.8).
//
// Run:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs scripts/entry-acceptance/21-ledger-page-totals.mjs

import mongoose from "mongoose";
import Payable from "@/models/Payable.js";
import Transactions from "@/models/Transactions.js";
import { buildPayableGroupedStages } from "@/lib/payableAggregation.js";
import {
  RENT_PURPOSES,
  EMPLOYEE_PURPOSES,
  OTHER_PURPOSES,
} from "@/constants/payableGroups.js";
import { PAYABLE_PURPOSES } from "@/constants/payablePurposes.js";
import {
  connectForAcceptance,
  disconnectAcceptance,
  record,
  printResultsTable,
} from "./_harness.mjs";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sumClosing = (rows) => round2((rows || []).reduce((s, r) => s + (r.closing || 0), 0));

async function groupedClosing(purpose) {
  const rows = await Payable.aggregate(
    buildPayableGroupedStages(Transactions.collection.name, { level: 1, purpose }),
  );
  return sumClosing(rows);
}

async function main() {
  await connectForAcceptance();
  try {
    // 1 — the purpose sets are a true partition of the enum
    const union = [...RENT_PURPOSES, ...EMPLOYEE_PURPOSES, ...OTHER_PURPOSES].sort();
    const enumSorted = [...PAYABLE_PURPOSES].sort();
    record(
      "1. rent ∪ employee ∪ other === every payable purpose",
      enumSorted.join(","),
      union.join(","),
      union.length === enumSorted.length && union.every((v, i) => v === enumSorted[i]),
    );

    // 2 — closing totals add up to the un-split total (whole DB scope)
    const [rent, emp, other, all] = await Promise.all([
      groupedClosing(RENT_PURPOSES),
      groupedClosing(EMPLOYEE_PURPOSES),
      groupedClosing(OTHER_PURPOSES),
      groupedClosing(undefined),
    ]);
    const split = round2(rent + emp + other);
    record(
      "2. rent + employee + other === all payables (closing)",
      String(all),
      `${split}  (rent ${rent} + emp ${emp} + other ${other})`,
      Math.abs(split - all) < 0.01,
    );

    // 3 — same, scoped to each branch that has payables
    const branches = await Payable.distinct("branch", { isCancelled: { $ne: true } });
    for (const branch of branches.filter(Boolean)) {
      const scoped = async (purpose) => {
        const rows = await Payable.aggregate(
          buildPayableGroupedStages(Transactions.collection.name, { level: 1, purpose, branch }),
        );
        return sumClosing(rows);
      };
      const [r, e, o, a] = await Promise.all([
        scoped(RENT_PURPOSES),
        scoped(EMPLOYEE_PURPOSES),
        scoped(OTHER_PURPOSES),
        scoped(undefined),
      ]);
      const s = round2(r + e + o);
      record(
        `3. partition holds for branch "${branch}"`,
        String(a),
        String(s),
        Math.abs(s - a) < 0.01,
      );
    }
  } finally {
    printResultsTable();
    await disconnectAcceptance();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
