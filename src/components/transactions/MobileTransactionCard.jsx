import {
  ChevronDown,
  ChevronRight,
  Edit2,
  FileText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import {
  calculateNetAmount,
  formatDateForDisplay,
  getExpenseGiverName,
  getMedicineName,
  getPatientName,
  getPatientPhone,
} from "./transactionsHelpers";
import { CategoryBadge, EntryBadge, MethodBadge } from "./TransactionBadges";
import TransactionDetails from "./TransactionDetails";

export default function MobileTransactionCard({
  row,
  category,
  onExpand,
  expanded,
  onDelete,
  onReverse,
  onBill,
  onEdit,
  linkedInfo,
  linkedLoading,
}) {
  const rowCategory =
    row.transactionCategory ||
    row.category ||
    "TRANSPLANT";

  const isExpense = rowCategory === "EXPENSE";

  const title = isExpense
    ? getExpenseGiverName(row)
    : getPatientName(row);

  const subtitle = isExpense
    ? row.expense ||
      row.expenseCategory ||
      "Expense"
    : row.procedure ||
      (rowCategory === "MEDICINE"
        ? getMedicineName(row)
        : "Transaction");

  const amount = calculateNetAmount(row);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {category === "ALL" && (
                <CategoryBadge category={rowCategory} />
              )}

              <MethodBadge method={row.method} />
              <EntryBadge row={row} />

              {row.approvalStatus === "PENDING" && (
                <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">
                  Pending
                </span>
              )}
            </div>

            <h3 className="font-bold text-slate-900 truncate">
              {title}
            </h3>

            <p className="text-sm text-slate-500 mt-0.5 truncate">
              {subtitle}
            </p>

            {!isExpense && getPatientPhone(row) && (
              <p className="text-xs text-slate-400 mt-1">
                {getPatientPhone(row)}
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p
              className={`text-lg font-bold ${
                isExpense
                  ? "text-rose-600"
                  : "text-emerald-600"
              }`}
            >
              {formatCurrency(amount)}
            </p>

            <p className="text-xs text-slate-400 mt-1">
              {formatDateForDisplay(row.date)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={onExpand}
            className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Details
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onBill(row)}
              className="p-2 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
              title="Bill"
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              onClick={() => onEdit(row)}
              className="p-2 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
              title="Update"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onReverse(row)}
              disabled={
                !!row.reversalOf ||
                !!row.isReversed ||
                !(row.amount > 0)
              }
              className="p-2 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:hidden"
              title="Reverse"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDelete(row)}
              className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <TransactionDetails
          row={row}
          linkedInfo={linkedInfo}
          linkedLoading={linkedLoading}
        />
      )}
    </div>
  );
}
