import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";

// The one cash-basis "booked money" filter for Transactions totals. Mirrors
// the `statsQuery` in src/app/api/transactions/get-all/route.js so an owner
// KPI and the admin transactions KPI can never disagree for the same window:
// approved only, no bank-to-bank settlements, no unsettled (external) methods.
export function bookedTransactionMatch() {
  return {
    ...SETTLEMENT_EXCLUSION,
    approvalStatus: { $nin: ["PENDING", "REJECTED"] },
    method: { $nin: unsettledMethodsSync() },
  };
}

export function expenseMatch() {
  return { ...bookedTransactionMatch(), transactionCategory: "EXPENSE" };
}

export function revenueMatch() {
  return { ...bookedTransactionMatch(), costType: "Revenue" };
}
