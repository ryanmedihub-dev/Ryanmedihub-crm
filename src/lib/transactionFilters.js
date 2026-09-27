import { SETTLEMENT_EXCLUSION } from "@/constants/bankRouting";
import { unsettledMethodsSync } from "@/lib/masterData";

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
