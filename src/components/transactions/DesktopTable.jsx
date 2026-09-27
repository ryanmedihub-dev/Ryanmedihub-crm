import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  Receipt,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/financeUI";
import { UNSETTLED_METHODS } from "@/constants/bankRouting";
import TransactionStatusBadges from "@/components/finance/StatusBadges";
import {
  calculateNetAmount,
  formatDateForDisplay,
  formatTime,
  getExpenseGiverName,
  getMedicineName,
  getPatientName,
  getPatientPhone,
} from "./transactionsHelpers";
import { CategoryBadge, MethodBadge } from "./TransactionBadges";
import TransactionDetails from "./TransactionDetails";

export default function DesktopTable({
  category,
  rows,
  sortConfig,
  onSort,
  onDelete,
  onReverse,
  onBill,
  onEdit,
  expandedId,
  onExpand,
  linkedInfo,
  linkedLoading,
}) {
  const getColumns = () => {
    const base = [["date", "Date"]];

    if (category === "EXPENSE") {
      return [
        ...base,
        ["party", "Paid to"],
        ["description", "Category"],
        ["method", "Method"],
        ["branch", "Branch"],
        ["amount", "Amount"],
        ["actions", ""],
      ];
    }

    if (category === "ALL") {
      return [
        ...base,
        ["category", "Type"],
        ["party", "Party"],
        ["description", "Details"],
        ["method", "Method"],
        ["branch", "Branch"],
        ["amount", "Amount"],
        ["actions", ""],
      ];
    }

    
    return [
      ...base,
      ["party", "Patient"],
      ["description", category === "MEDICINE" ? "Medicine" : "Procedure"],
      ["method", "Method"],
      ["branch", "Branch"],
      ["amount", "Amount"],
      ["actions", ""],
    ];
  };

  const columns = getColumns();

  const SortButton = ({ column }) => {
    if (!["date", "amount", "branch", "method"].includes(column)) return null;
    if (sortConfig.key !== column) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3 h-3 text-indigo-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600" />
    );
  };

  const renderCell = (row, key) => {
    const rowCategory = row.transactionCategory || row.category || "TRANSPLANT";
    const isExpense = rowCategory === "EXPENSE";

    switch (key) {
      case "date":
        return (
          <div>
            <p className="text-sm font-medium text-slate-700">{formatDateForDisplay(row.date)}</p>
            <p className="text-[11px] text-slate-400">{formatTime(row.date)}</p>
          </div>
        );

      case "category":
        return <CategoryBadge category={rowCategory} />;

      case "party": {
        const name = isExpense ? getExpenseGiverName(row) : getPatientName(row);
        const phone = !isExpense ? getPatientPhone(row) : "";
        return (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate max-w-[180px]">{name}</p>
            {phone && <p className="text-[11px] text-slate-400">{phone}</p>}
          </div>
        );
      }

      case "description": {
        const text = isExpense
          ? row.expenseType || row.expense || row.expenseCategory || "Expense"
          : rowCategory === "MEDICINE"
            ? getMedicineName(row)
            : row.procedure || "—";
        return <span className="text-sm text-slate-600 truncate block max-w-[220px]">{text}</span>;
      }

      case "method":
        return <MethodBadge method={row.method} />;

      case "branch":
        return <span className="text-sm text-slate-600">{row.branch || "—"}</span>;

      case "amount":
        return (
          <span className={`text-sm font-bold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
            {formatCurrency(calculateNetAmount(row))}
          </span>
        );

      case "actions":
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onBill(row)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
              title="Bill"
            >
              <FileText className="w-4 h-4" />
            </button>

            <button
              onClick={() => onEdit(row)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
              title="Update"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onReverse(row)}
              disabled={!!row.reversalOf || !!row.isReversed || !(row.amount > 0)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30 disabled:pointer-events-none"
              title="Reverse"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDelete(row)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
          <tr>
            {columns.map(([key, label]) => (
              <th
                key={key}
                className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 ${
                  key === "amount" ? "text-right" : key === "actions" ? "text-right" : ""
                }`}
              >
                {label ? (
                  <button
                    onClick={() =>
                      ["date", "amount", "branch", "method"].includes(key) && onSort(key)
                    }
                    className={`inline-flex items-center gap-1.5 ${
                      ["date", "amount", "branch", "method"].includes(key)
                        ? "hover:text-slate-900"
                        : ""
                    }`}
                  >
                    {label}
                    <SortButton column={key} />
                  </button>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>

        {}
        <tbody className="divide-y divide-slate-100">
          {rows.flatMap((row) => {
            const expanded = expandedId === row._id;

            
            const mainRow = (
              <tr
                key={`${row._id}-main`}
                className={`group transition-colors ${
                  expanded ? "bg-indigo-50/40" : "hover:bg-slate-50/70"
                }`}
              >
                {columns.map(([key]) => (
                  <td
                    key={key}
                    className={`px-4 py-3.5 align-middle ${
                      key === "amount" ? "text-right" : key === "actions" ? "text-right" : ""
                    }`}
                  >
                    {renderCell(row, key)}
                  </td>
                ))}
              </tr>
            );

            
            const detailRow = (
              <tr key={`${row._id}-detail`}>
                <td colSpan={columns.length} className="p-0">
                  <div className="flex items-center gap-2 px-4 py-2 bg-white">
                    <button
                      onClick={() => onExpand(row)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      Details
                    </button>

                    {row.furtherMode && (
                      <span className="text-[10px] text-slate-400">
                        •{" "}
                        {row.costType === "Expenses" ? "Paid from" : "Received in"}{" "}
                        {row.furtherMode}
                      </span>
                    )}

                    {UNSETTLED_METHODS.includes(row.method) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                        <Clock className="w-3 h-3" />
                        Unsettled
                      </span>
                    )}

                    {row.receipts?.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                        <Receipt className="w-3 h-3" />
                        {row.receipts.length} receipt{row.receipts.length > 1 ? "s" : ""}
                      </span>
                    )}

                    {(row.taxDetails?.gstAmount || row.taxDetails?.tdsAmount) && (
                      <span className="text-[10px] font-semibold text-purple-600">Tax</span>
                    )}

                    <TransactionStatusBadges row={row} onShowDetail={() => onExpand(row)} />
                  </div>

                  {expanded && (
                    <TransactionDetails
                      row={row}
                      linkedInfo={linkedInfo}
                      linkedLoading={linkedLoading}
                    />
                  )}
                </td>
              </tr>
            );

            return [mainRow, detailRow];
          })}
        </tbody>
      </table>
    </div>
  );
}
