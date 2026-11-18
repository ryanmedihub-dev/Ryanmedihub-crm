"use client";

import SharedStatCard from "@/components/dashboard/StatCard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import CollabSidebar from "@/components/Sidebars/CollabSidebar";
import { useToast } from "@/components/Toast";
import BillGenerator from "@/components/BillGenerator";
import { COLLAB_BRANCHES } from "@/lib/branches";
import {
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  User,
  Calendar,
  IndianRupee,
  CreditCard,
  Building2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Loader2,
  Menu,
  Tag,
  ArrowUpDown,
  ChevronDown,
  Package,
  FileText as Bill,
  Clock,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

const calculateNetAmount = (transaction) => {
  if (!transaction) return 0;
  const amount = parseFloat(transaction.amount) || 0;
  return Math.max(0, amount);
};

const getTodayDate = () => {
  const now = new Date();
  return now.toISOString().split("T")[0];
};

const formatDateForDisplay = (date) => {
  if (!date) return "N/A";
  const dateObj = new Date(date);
  return dateObj.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const PAYMENT_METHODS = ["upi", "cash", "card", "banking", "bajaj_loan", "fibe_loan", "hdfc_skin_bank_transfer", "hdfc_ryan_medihub_bank_transfer", "icici_medihub_bank_transfer", "other"];
const TRANSPLANT_PROCEDURES = [
  "Sapphire FUE",
  "DHI",
  "Turkish DHI",
  "Beard Transplant",
];
const SERVICE_PROCEDURES = ["PRP", "GFC", "Alopecia", "Headwash", "Canacot"];
const TRANSACTION_CATEGORIES = [
  { value: "TRANSPLANT", label: "Transplant", icon: User, color: "indigo" },
  { value: "SERVICE", label: "Services", icon: User, color: "pink" },
  { value: "MEDICINE", label: "Medicine", icon: User, color: "emerald" },
  { value: "EXPENSE", label: "Expenses", icon: User, color: "rose" },
];

const getCategoryGradientClass = (categoryValue, isActive) => {
  if (!isActive) return "text-gray-500 hover:bg-gray-100 hover:text-gray-900";

  return "bg-gray-900 text-white";
};

function StatCard({ title, value, icon, gradient, count }) {
  return <SharedStatCard title={title} value={value} subtitle={count} icon={icon} tone={gradient} />;
}

function DeleteConfirmModal({ transaction, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  const netAmount = calculateNetAmount(transaction);
  const hasDiscount = parseFloat(transaction?.discount || 0) > 0;

  return (
    <div className="fixed inset-0 overlay-in bg-gray-950/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4">
        <div className="p-6 sm:p-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
          </div>
          <h2 className="text-xl sm:text-xl font-semibold tracking-tight text-gray-900 text-center mb-2">
            Delete Transaction?
          </h2>
          <p className="text-gray-600 text-center mb-4 sm:mb-6 text-sm sm:text-base">
            Are you sure you want to delete this transaction? This action cannot
            be undone.
          </p>
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Category:</span>
              <span className="font-semibold text-gray-900 text-sm sm:text-base">
                {transaction?.transactionCategory || "Uncategorized"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Amount:</span>
              <span className="font-semibold text-emerald-600 text-sm sm:text-base">
                {formatCurrency(netAmount)}
              </span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Discount:</span>
                <span className="font-semibold text-amber-600 text-sm sm:text-base">
                  -{formatCurrency(transaction?.discount || 0)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-600">Date:</span>
              <span className="font-medium text-gray-900 text-sm sm:text-base">
                {formatDateForDisplay(transaction?.date)}
              </span>
            </div>
          </div>
          <div className="flex flex-col xs:flex-row gap-3">
            <button
              onClick={onClose}
              disabled={deleting}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-semibold text-gray-700 disabled:opacity-50 text-sm sm:text-base"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-semibold disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  type = "text",
  value,
  onChange,
  icon: Icon,
  required,
  placeholder,
  min,
  max,
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 mb-2 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          min={min}
          max={max}
          className={`w-full border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all text-sm sm:text-base ${
            Icon ? "pl-9 sm:pl-11 pr-4" : "px-4"
          } py-2.5 sm:py-3`}
        />
      </div>
    </label>
  );
}

function Select({ label, value, onChange, options, required, icon: Icon }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 mb-2 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={`w-full border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 bg-white transition-all appearance-none text-sm sm:text-base ${
            Icon ? "pl-9 sm:pl-11 pr-8 sm:pr-10" : "px-4 pr-8 sm:pr-10"
          } py-2.5 sm:py-3`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronLeft className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 rotate-90 text-gray-400 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
      </div>
    </label>
  );
}

function ApprovalBadge({ status }) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        Pending Approval
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        <XCircle className="w-3 h-3" />
        Rejected
      </span>
    );
  }
  return null;
}

function DataTable({
  category,
  rows,
  onEdit,
  onDelete,
  onSort,
  sortConfig,
  pagination,
  onGenerateBill,
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";

  const hasUndefinedCategory = (row) => {
    const category = row.transactionCategory || row.category;
    return !category || category === "";
  };

  const getColumns = () => {
    const baseColumns = [
      { key: "date", label: "Date", sortable: true, width: "110px" },
    ];

    switch (category) {
      case "TRANSPLANT":
        return [
          ...baseColumns,
          { key: "patient", label: "Patient", sortable: true, width: "160px" },
          {
            key: "procedure",
            label: "Procedure",
            sortable: true,
            width: "130px",
          },
          {
            key: "paymentType",
            label: "Payment Type",
            sortable: true,
            width: "120px",
          },
          { key: "amount", label: "Amount", sortable: true, width: "130px" },
          { key: "method", label: "Method", sortable: true, width: "110px" },
          {
            key: "paymentId",
            label: "Trans ID",
            sortable: true,
            width: "150px",
          },
          { key: "branch", label: "Branch", sortable: true, width: "110px" },
          { key: "actions", label: "Actions", sortable: false, width: "120px" },
        ];
      case "SERVICE":
        return [
          ...baseColumns,
          {
            key: "patient",
            label: "Patient/Customer",
            sortable: true,
            width: "160px",
          },
          {
            key: "procedure",
            label: "Service",
            sortable: true,
            width: "100px",
          },
          { key: "quantity", label: "Sessions", sortable: true, width: "90px" },
          {
            key: "perSessionCost",
            label: "Per Session",
            sortable: true,
            width: "120px",
          },
          { key: "amount", label: "Total", sortable: true, width: "130px" },
          { key: "method", label: "Method", sortable: true, width: "110px" },
          {
            key: "paymentId",
            label: "Trans ID",
            sortable: true,
            width: "150px",
          },
          { key: "batchId", label: "Batch", sortable: false, width: "100px" },
          { key: "branch", label: "Branch", sortable: true, width: "110px" },
          { key: "actions", label: "Actions", sortable: false, width: "120px" },
        ];
      case "MEDICINE":
        return [
          ...baseColumns,
          {
            key: "patient",
            label: "Patient/Customer",
            sortable: true,
            width: "160px",
          },
          {
            key: "medicine",
            label: "Medicine",
            sortable: true,
            width: "160px",
          },
          { key: "quantity", label: "Qty", sortable: true, width: "80px" },
          {
            key: "perUnitCost",
            label: "Per Unit",
            sortable: true,
            width: "110px",
          },
          { key: "amount", label: "Total", sortable: true, width: "130px" },
          { key: "method", label: "Method", sortable: true, width: "110px" },
          {
            key: "paymentId",
            label: "Trans ID",
            sortable: true,
            width: "150px",
          },
          { key: "batchId", label: "Batch", sortable: false, width: "100px" },
          { key: "branch", label: "Branch", sortable: true, width: "110px" },
          { key: "actions", label: "Actions", sortable: false, width: "120px" },
        ];
      case "EXPENSE":
        return [
          ...baseColumns,
          { key: "expense", label: "Expense", sortable: true, width: "160px" },
          { key: "expenseType", label: "Type", sortable: true, width: "150px" },
          {
            key: "expenseGiver",
            label: "Paid To",
            sortable: false,
            width: "160px",
          },
          { key: "amount", label: "Amount", sortable: true, width: "130px" },
          { key: "method", label: "Method", sortable: true, width: "110px" },
          {
            key: "paymentId",
            label: "Trans ID",
            sortable: true,
            width: "150px",
          },
          { key: "branch", label: "Branch", sortable: true, width: "110px" },
          { key: "status", label: "Status", sortable: false, width: "140px" },
          { key: "actions", label: "Actions", sortable: false, width: "120px" },
        ];
      default:
        return baseColumns;
    }
  };

  const columns = getColumns();

  // Categories, not states: one neutral badge so colour stays reserved for meaning.
  const getProcedureColor = () => "bg-gray-100 text-gray-700 border-transparent";

  // Categories, not states: one neutral badge so colour stays reserved for meaning.
  const getMethodColor = () => "bg-gray-100 text-gray-700 border-transparent";

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return (
        <ArrowUpDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      );
    }
    return sortConfig.direction === "asc" ? (
      <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4 rotate-90 text-indigo-600" />
    ) : (
      <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 rotate-90 text-indigo-600" />
    );
  };

  const gridTemplateColumns = columns.map((col) => col.width).join(" ");

  const getPatientName = (row) => {
    if (row.patient && typeof row.patient === "object") {
      return row.patient.personal?.name || "N/A";
    }
    return row.patientName || "Walk-in Customer";
  };

  const getPatientPhone = (row) => {
    const raw = (row.patient && typeof row.patient === "object") ? row.patient.personal?.phone || "" : row.patientPhone || "";
    return maskPhone(raw, userRole);
  };

  const getMedicineName = (row) => {
    if (row.medicineId && typeof row.medicineId === "object") {
      return row.medicineId.name || "N/A";
    }
    return "N/A";
  };

  const getExpenseGiverName = (row) => {
    if (row.expenseGiver?.type === "VENDOR") {
      if (typeof row.expenseGiver.vendorId === "object") {
        return (
          row.expenseGiver.vendorId?.name || row.expenseGiver.name || "N/A"
        );
      }
      return row.expenseGiver.name || "N/A";
    }
    return row.expenseGiver?.name || "N/A";
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div
        className="hidden md:grid items-center bg-gray-50/80 border-b border-gray-200 min-h-10 px-2"
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={`px-2 py-2.5 text-left text-xs font-medium text-gray-500 truncate ${
              col.sortable
                ? "cursor-pointer hover:bg-slate-200/50 transition-colors duration-150 group"
                : ""
            }`}
            onClick={() => col.sortable && onSort(col.key)}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate">{col.label}</span>
              {col.sortable && <SortIcon columnKey={col.key} />}
            </div>
          </div>
        ))}
      </div>

      <div className="md:hidden bg-slate-50 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {category} Records
            </h3>
            <p className="text-xs text-slate-600">
              Showing {rows.length} of {pagination.total}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-700">Sorted by</p>
            <p className="text-sm font-semibold text-indigo-700">
              {sortConfig.key.replace(/([A-Z])/g, " $1").trim()}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No records found
            </h3>
            <p className="text-sm text-slate-600 text-center max-w-md">
              Try adjusting your search filters or add a new transaction
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              const netAmount = calculateNetAmount(row);
              const hasDiscount = parseFloat(row.discount || 0) > 0;
              const rowCategory =
                row.transactionCategory || row.category || "TRANSPLANT";

              return (
                <div key={row._id || i}>
                  <div className="group transition-all duration-200 hover:bg-indigo-50/30">
                    <div
                      className="hidden md:grid items-center min-h-16 px-2"
                      style={{ gridTemplateColumns }}
                    >
                      <div className="px-2 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="text-sm font-medium text-slate-900">
                            {formatDateForDisplay(row.date)}
                          </div>
                        </div>
                      </div>

                      {rowCategory === "TRANSPLANT" && (
                        <>
                          <div className="px-2 py-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {getPatientName(row)}
                              </div>
                              <div className="text-xs text-slate-600 font-medium">
                                {getPatientPhone(row) || "No phone"}
                              </div>
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <span
                              className={`inline-flex items-center h-5 px-2 rounded-md text-xs font-medium border ${getProcedureColor(row.procedure)}`}
                            >
                              {row.procedure}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            <span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                              {row.paymentType}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            <div className="text-center">
                              <div className="text-sm font-semibold text-emerald-700">
                                {formatCurrency(netAmount)}
                              </div>
                              {hasDiscount && (
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <Tag className="w-3 h-3 text-amber-500" />
                                  <span className="text-xs text-amber-600 font-medium">
                                    -{formatCurrency(row.discount)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <span
                              className={`inline-flex items-center h-5 px-2 rounded-md text-xs font-medium border ${getMethodColor(row.method)}`}
                            >
                              {row.method?.replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            {row.paymentId ? (
                              <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">
                                {row.paymentId}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="px-2 py-3">
                            <span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                              {row.branch}
                            </span>
                          </div>
                        </>
                      )}

                      {rowCategory === "SERVICE" && (
                        <>
                          <div className="px-2 py-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {getPatientName(row)}
                              </div>
                              <div className="text-xs text-slate-600 font-medium">
                                {getPatientPhone(row) || "No phone"}
                              </div>
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <span
                              className={`inline-flex items-center h-5 px-2 rounded-md text-xs font-medium border ${getProcedureColor(row.procedure)}`}
                            >
                              {row.procedure}
                            </span>
                          </div>
                          <div className="px-2 py-3 text-center">
                            <div className="text-sm font-semibold text-indigo-700">
                              {row.quantity || 1}
                            </div>
                          </div>
                          <div className="px-2 py-3 text-center">
                            <div className="text-sm font-medium text-slate-900">
                              {formatCurrency(row.perSessionCost || 0)}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <div className="text-center">
                              <div className="text-sm font-semibold text-emerald-700">
                                {formatCurrency(netAmount)}
                              </div>
                              {hasDiscount && (
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <Tag className="w-3 h-3 text-amber-500" />
                                  <span className="text-xs text-amber-600 font-medium">
                                    -{formatCurrency(row.discount)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <span
                              className={`inline-flex items-center h-5 px-2 rounded-md text-xs font-medium border ${getMethodColor(row.method)}`}
                            >
                              {row.method?.replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            {row.paymentId ? (
                              <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">
                                {row.paymentId}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="px-2 py-3">
                            {row.batchId ? (
                              <div className="flex items-center gap-1">
                                <Package className="w-3 h-3 text-indigo-600" />
                                <span className="text-xs font-mono text-indigo-700">
                                  {row.batchId.slice(-8)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="px-2 py-3">
                            <span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                              {row.branch}
                            </span>
                          </div>
                        </>
                      )}

                      {rowCategory === "MEDICINE" && (
                        <>
                          <div className="px-2 py-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {getPatientName(row)}
                              </div>
                              <div className="text-xs text-slate-600 font-medium">
                                {getPatientPhone(row) || "No phone"}
                              </div>
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {getMedicineName(row)}
                            </div>
                          </div>
                          <div className="px-2 py-3 text-center">
                            <div className="text-sm font-semibold text-indigo-700">
                              {row.quantity || 1}
                            </div>
                          </div>
                          <div className="px-2 py-3 text-center">
                            <div className="text-sm font-medium text-slate-900">
                              {formatCurrency(row.perUnitCost || 0)}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <div className="text-center">
                              <div className="text-sm font-semibold text-emerald-700">
                                {formatCurrency(netAmount)}
                              </div>
                              {hasDiscount && (
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <Tag className="w-3 h-3 text-amber-500" />
                                  <span className="text-xs text-amber-600 font-medium">
                                    -{formatCurrency(row.discount)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <span
                              className={`inline-flex items-center h-5 px-2 rounded-md text-xs font-medium border ${getMethodColor(row.method)}`}
                            >
                              {row.method?.replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            {row.paymentId ? (
                              <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">
                                {row.paymentId}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="px-2 py-3">
                            {row.batchId ? (
                              <div className="flex items-center gap-1">
                                <Package className="w-3 h-3 text-indigo-600" />
                                <span className="text-xs font-mono text-indigo-700">
                                  {row.batchId.slice(-8)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="px-2 py-3">
                            <span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                              {row.branch}
                            </span>
                          </div>
                        </>
                      )}

                      {rowCategory === "EXPENSE" && (
                        <>
                          <div className="px-2 py-3">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {row.expense || row.expenseCategory || "N/A"}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <div className="text-sm text-slate-900 truncate">
                              {row.expenseType || "-"}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <div className="text-sm text-slate-900 truncate">
                              {getExpenseGiverName(row)}
                            </div>
                          </div>
                          <div className="px-2 py-3 text-right">
                            <div className="text-sm font-semibold text-rose-600">
                              {formatCurrency(row.amount)}
                            </div>
                          </div>
                          <div className="px-2 py-3">
                            <span
                              className={`inline-flex items-center h-5 px-2 rounded-md text-xs font-medium border ${getMethodColor(row.method)}`}
                            >
                              {row.method?.replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            {row.paymentId ? (
                              <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">
                                {row.paymentId}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                          <div className="px-2 py-3">
                            <span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                              {row.branch}
                            </span>
                          </div>
                          <div className="px-2 py-3">
                            <ApprovalBadge status={row.approvalStatus} />
                          </div>
                        </>
                      )}

                      <div className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onGenerateBill(row)}
                            className="p-2 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-600 hover:text-emerald-800"
                            title="Generate Bill"
                          >
                            <Bill size={18} />
                          </button>
                          <button
                            onClick={() => onDelete(row)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600 hover:text-red-800"
                            title="Delete record"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="md:hidden p-4">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${
                                  rowCategory === "TRANSPLANT"
                                    ? getProcedureColor(row.procedure)
                                    : rowCategory === "SERVICE"
                                      ? getProcedureColor(row.procedure)
                                      : rowCategory === "MEDICINE"
                                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        : "bg-rose-100 text-rose-700 border border-rose-200"
                                }`}
                              >
                                {rowCategory === "TRANSPLANT" ||
                                rowCategory === "SERVICE"
                                  ? row.procedure
                                  : rowCategory === "MEDICINE"
                                    ? getMedicineName(row)
                                    : row.expense ||
                                      row.expenseCategory ||
                                      "Expense"}
                              </span>
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold ${getMethodColor(row.method)}`}
                              >
                                {row.method?.replace(/_/g, " ").toUpperCase()}
                              </span>
                              {hasUndefinedCategory(row) && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-semibold border border-amber-200">
                                  <AlertCircle className="w-3 h-3" />
                                  Uncategorized
                                </span>
                              )}
                              {rowCategory === "EXPENSE" && (
                                <ApprovalBadge status={row.approvalStatus} />
                              )}
                            </div>
                            <h4 className="text-base font-semibold text-slate-900">
                              {rowCategory !== "EXPENSE"
                                ? getPatientName(row)
                                : getExpenseGiverName(row)}
                            </h4>
                            {rowCategory !== "EXPENSE" && (
                              <p className="text-sm text-slate-600 font-medium">
                                {getPatientPhone(row)}
                              </p>
                            )}
                            {rowCategory === "EXPENSE" && (
                              <p className="text-sm text-slate-600 font-medium">
                                {[
                                  row.expense ||
                                    row.expenseCategory ||
                                    "General Expense",
                                  row.expenseType,
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-lg font-semibold ${
                                rowCategory === "EXPENSE"
                                  ? "text-rose-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {formatCurrency(netAmount)}
                            </div>
                            <p className="text-xs text-slate-500">
                              {formatDateForDisplay(row.date)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {(rowCategory === "SERVICE" ||
                            rowCategory === "MEDICINE") && (
                            <>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">
                                  {rowCategory === "SERVICE"
                                    ? "Sessions"
                                    : "Quantity"}
                                </p>
                                <p className="text-sm font-semibold text-indigo-700">
                                  {row.quantity || 1}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">
                                  {rowCategory === "SERVICE"
                                    ? "Per Session"
                                    : "Per Unit"}
                                </p>
                                <p className="text-sm font-semibold text-slate-700">
                                  {formatCurrency(
                                    rowCategory === "SERVICE"
                                      ? row.perSessionCost
                                      : row.perUnitCost,
                                  )}
                                </p>
                              </div>
                            </>
                          )}

                          {rowCategory === "TRANSPLANT" && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">
                                Payment Type
                              </p>
                              <p className="text-sm font-semibold text-blue-700">
                                {row.paymentType || "N/A"}
                              </p>
                            </div>
                          )}

                          {rowCategory === "EXPENSE" && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">
                                Expense Category
                              </p>
                              <p className="text-sm font-semibold text-rose-700">
                                {row.expense || row.expenseCategory || "N/A"}
                              </p>
                            </div>
                          )}
                          {rowCategory === "EXPENSE" && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">
                                Expense Type
                              </p>
                              <p className="text-sm font-semibold text-rose-700">
                                {row.expenseType || "N/A"}
                              </p>
                            </div>
                          )}

                          <div>
                            <p className="text-xs text-slate-500 mb-1">
                              Branch
                            </p>
                            <p className="text-sm font-semibold text-purple-700">
                              {row.branch}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">
                              Transaction ID
                            </p>
                            <p className="text-sm font-mono text-slate-700 truncate">
                              {row.paymentId || "-"}
                            </p>
                          </div>
                          {row.batchId && (
                            <div className="col-span-2">
                              <p className="text-xs text-slate-500 mb-1">
                                Batch ID
                              </p>
                              <p className="text-sm font-mono text-indigo-700">
                                {row.batchId.slice(-8)}
                              </p>
                            </div>
                          )}
                        </div>

                        {row.remarks && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">
                              Remarks
                            </p>
                            <p className="text-sm text-slate-700">
                              {row.remarks}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-end pt-3 border-t border-slate-200">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onGenerateBill(row)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors"
                            >
                              <Bill size={14} />
                              Bill
                            </button>
                            <button
                              onClick={() => onDelete(row)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-100 transition-colors"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4">
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">
              {pagination.startIdx + 1}-{pagination.endIdx}
            </span>
            <span className="mx-2">of</span>
            <span className="font-medium text-slate-900">
              {pagination.total.toLocaleString()}
            </span>
            <span className="ml-2">records</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 hidden sm:inline">
                Show
              </span>
              <select
                className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-medium transition-all"
                value={pagination.perPage}
                onChange={(e) => {
                  pagination.setPerPage(Number(e.target.value));
                  pagination.setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-sm text-slate-600 hidden sm:inline">
                per page
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button aria-label="Previous page"
                onClick={() => pagination.setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-slate-400 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 mx-2">
                {(() => {
                  const pages = [];
                  const totalPages = pagination.pages;
                  const currentPage = pagination.page;

                  if (currentPage > 2) {
                    pages.push(1);
                    if (currentPage > 3) pages.push("...");
                  }

                  for (
                    let i = Math.max(1, currentPage - 1);
                    i <= Math.min(totalPages, currentPage + 1);
                    i++
                  ) {
                    pages.push(i);
                  }

                  if (currentPage < totalPages - 1) {
                    if (currentPage < totalPages - 2) pages.push("...");
                    pages.push(totalPages);
                  }

                  return pages.map((page, idx) =>
                    page === "..." ? (
                      <span key={idx} className="px-2 text-slate-400">
                        ...
                      </span>
                    ) : (
                      <button
                        key={idx}
                        onClick={() => pagination.setPage(page)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                          page === currentPage
                            ? "bg-indigo-600 text-white border border-indigo-600"
                            : "text-slate-700 hover:bg-slate-100 border border-transparent"
                        }`}
                      >
                        {page}
                      </button>
                    ),
                  );
                })()}
              </div>
              <button aria-label="Next page"
                onClick={() =>
                  pagination.setPage((p) => Math.min(pagination.pages, p + 1))
                }
                disabled={pagination.page >= pagination.pages}
                className="p-2 rounded-lg border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-slate-400 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AllTransactionsPage() {
  const tenantBranches = COLLAB_BRANCHES;

  const router = useRouter();
  const toast  = useToast();
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal]               = useState(0);
  const [stats, setStats]               = useState({ TRANSPLANT: { count: 0, total: 0 }, SERVICE: { count: 0, total: 0 }, MEDICINE: { count: 0, total: 0 }, EXPENSE: { count: 0, total: 0 } });
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [refreshing, setRefreshing]     = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [activeCategory, setActiveCategory] = useState("TRANSPLANT");
  const [pendingOnly, setPendingOnly]   = useState(false);
  const [filters, setFilters] = useState({ branch: "", dateFrom: getTodayDate(), dateTo: getTodayDate(), paymentMethod: "", procedure: "" });
  const [showFilters, setShowFilters]   = useState(false);
  const [tableSearch, setTableSearch]   = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm]     = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState(null);
  const [showBillGenerator, setShowBillGenerator]     = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });

  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handleSearchChange = (val) => {
    setTableSearch(val);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 400);
  };

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError(null);
      const p = new URLSearchParams({ page, limit: perPage, category: activeCategory, sortKey: sortConfig.key, sortDir: sortConfig.direction });
      if (filters.branch)        p.set("branch",        filters.branch);
      if (filters.dateFrom)      p.set("dateFrom",      filters.dateFrom);
      if (filters.dateTo)        p.set("dateTo",        filters.dateTo);
      if (filters.paymentMethod) p.set("paymentMethod", filters.paymentMethod);
      if (filters.procedure)     p.set("procedure",     filters.procedure);
      if (debouncedSearch)       p.set("search",        debouncedSearch);
      if (activeCategory === "EXPENSE" && pendingOnly) p.set("approvalStatus", "PENDING");
      const res = await fetch(`/api/transactions/get-all?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Invalid data format");
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (e) { setError(e.message); toast?.error?.("Error loading data: " + e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [page, perPage, activeCategory, sortConfig, filters, debouncedSearch, pendingOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [filters, activeCategory, debouncedSearch, sortConfig, pendingOnly]);
  useEffect(() => { if (activeCategory !== "EXPENSE") setPendingOnly(false); }, [activeCategory]);

  const handleRefresh = () => fetchData(true);
  const handleSort = (key) => { setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" })); };

  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages);
  const startIdx = (current - 1) * perPage;
  const endIdx = Math.min(startIdx + perPage, total);

  const clearFilters = () => { setFilters({ branch: "", dateFrom: getTodayDate(), dateTo: getTodayDate(), paymentMethod: "", procedure: "" }); setTableSearch(""); setDebouncedSearch(""); setPage(1); };
  const hasActiveFilters = filters.branch || filters.paymentMethod || filters.procedure || tableSearch || filters.dateFrom !== getTodayDate() || filters.dateTo !== getTodayDate();

  const openDeleteConfirm = (transaction) => {
    setDeletingTransaction(transaction);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!deletingTransaction) return;

    try {
      const category =
        deletingTransaction.transactionCategory ||
        deletingTransaction.category ||
        "TRANSPLANT";

      const endpoint =
        category === "TRANSPLANT"
          ? "/api/transactions/transplant/delete"
          : category === "SERVICE"
            ? "/api/transactions/service/delete"
            : category === "MEDICINE"
              ? "/api/transactions/medicine/delete"
              : "/api/transactions/expense/delete";

      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: deletingTransaction._id }),
        credentials: "include",
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("Transaction deleted successfully");
        fetchData();
        setShowDeleteConfirm(false);
        setDeletingTransaction(null);
      } else {
        toast.error(data.error || "Failed to delete transaction");
      }
    } catch (err) {
      toast.error("An error occurred while deleting");
    }
  };

  const openBillGenerator = (data) => {
    try {
      const isRevenueTransaction = data.costType === "Revenue";
      const hasCategory =
        data.transactionCategory &&
        data.transactionCategory !== "undefined" &&
        data.transactionCategory !== "";

      if (
        isRevenueTransaction &&
        (!hasCategory || data.transactionCategory === "TRANSPLANT") &&
        data.patient
      ) {
        const patientId =
          typeof data.patient === "object" ? data.patient._id : data.patient;

        if (patientId) {
          setSelectedTransactionId(patientId);
        } else {
          setSelectedTransactionId(data._id);
        }
      } else {
        setSelectedTransactionId(data._id);
      }

      setShowBillGenerator(true);
    } catch (error) {
      console.error("Error opening bill generator:", error);
      toast.error("Failed to open bill generator");
    }
  };

  const closeBillGenerator = () => {
    setShowBillGenerator(false);
    setSelectedTransactionId(null);
  };

  const applyQuickFilter = (preset) => {
    const today = getTodayDate();
    const date = new Date();

    switch (preset) {
      case "today":
        setFilters({ ...filters, dateFrom: today, dateTo: today });
        break;
      case "yesterday":
        const yesterday = new Date(date.setDate(date.getDate() - 1))
          .toISOString()
          .split("T")[0];
        setFilters({ ...filters, dateFrom: yesterday, dateTo: yesterday });
        break;
      case "week":
        const weekAgo = new Date(date.setDate(date.getDate() - 7))
          .toISOString()
          .split("T")[0];
        setFilters({ ...filters, dateFrom: weekAgo, dateTo: getTodayDate() });
        break;
      case "month":
        const monthAgo = new Date(date.setMonth(date.getMonth() - 1))
          .toISOString()
          .split("T")[0];
        setFilters({ ...filters, dateFrom: monthAgo, dateTo: getTodayDate() });
        break;
      case "all":
        setFilters({ ...filters, dateFrom: "", dateTo: "" });
        break;
    }
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <Loader2 className="animate-spin h-16 w-16 text-indigo-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading transactions...</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center bg-white p-8 rounded-3xl shadow-xl border border-red-100">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Error Loading Data
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-screen bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
      <CollabSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full lg:w-auto min-w-0">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-gray-900">
                  All Transactions
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  View and manage all transaction categories
                </p>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Refresh data"
                className="press grid h-9 w-9 place-items-center bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 shrink-0"
                title="Refresh data"
              >
                <RefreshCw
                  className={`w-4 h-4 text-gray-500 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
              </button>

              <button
                onClick={() => router.push("/collab/transactions/create")}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white h-9 px-3.5 rounded-lg flex items-center gap-1.5 transition-colors text-sm shrink-0"
              >
                <Plus size={18} strokeWidth={2.5} />
                <span className="font-semibold hidden sm:inline">Add Transaction</span>
                <span className="font-semibold sm:hidden">Add</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 mb-4 sm:mb-6">
          <StatCard title="Transplants" value={formatCurrency(stats.TRANSPLANT.total)} icon={User} gradient="indigo" count={`${stats.TRANSPLANT.count} transactions`} iconBg="bg-indigo-100" iconColor="text-indigo-600" />
          <StatCard title="Services"    value={formatCurrency(stats.SERVICE.total)}    icon={User} gradient="pink"    count={`${stats.SERVICE.count} transactions`}    iconBg="bg-pink-100"    iconColor="text-pink-600"    />
          <StatCard title="Medicines"   value={formatCurrency(stats.MEDICINE.total)}   icon={User} gradient="emerald" count={`${stats.MEDICINE.count} transactions`}   iconBg="bg-emerald-100" iconColor="text-emerald-600" />
          <StatCard title="Expenses"    value={formatCurrency(stats.EXPENSE.total)}    icon={User} gradient="rose"      count={`${stats.EXPENSE.count} transactions`}    iconBg="bg-rose-100"    iconColor="text-rose-600"    />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:gap-4 p-4 sm:px-6 sm:py-4">
              <div className="flex gap-1 sm:gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0">
                {TRANSACTION_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.value}
                      aria-pressed={activeCategory === cat.value}
                      className={`press h-8 px-3 rounded-lg text-[13px] font-medium transition-colors duration-150 whitespace-nowrap shrink-0 flex items-center gap-1.5 ${getCategoryGradientClass(cat.value, activeCategory === cat.value)}`}
                      onClick={() => setActiveCategory(cat.value)}
                    >
                      {cat.label}
                      <span className={`tabular-nums ${activeCategory === cat.value ? "text-gray-300" : "text-gray-400"}`}>{stats[cat.value].count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 sm:gap-3 w-full lg:w-auto">
                <div className="relative flex-1 lg:flex-initial min-w-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                  <input
                    type="text"
                    placeholder="Search all transactions..."
                    value={tableSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9 sm:pl-11 pr-4 py-2 sm:py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 text-sm w-full lg:w-64 transition-all"
                  />
                </div>

                <button
                  type="button"
                  aria-label="Filters"
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all shrink-0 flex items-center gap-2 ${
                    showFilters
                      ? "bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                  {showFilters ? (
                    <ChevronDown className="w-4 h-4 hidden sm:block rotate-180" />
                  ) : (
                    <ChevronDown className="w-4 h-4 hidden sm:block" />
                  )}
                </button>

                {activeCategory === "EXPENSE" && (
                  <button
                    onClick={() => setPendingOnly((v) => !v)}
                    className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all shrink-0 flex items-center gap-2 text-sm font-semibold whitespace-nowrap ${
                      pendingOnly
                        ? "bg-amber-500 text-white shadow-md"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden sm:inline">Pending Approvals</span>
                    <span className="sm:hidden">Pending</span>
                  </button>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-all font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap shrink-0"
                  >
                    <X className="w-4 h-4" />
                    <span className="hidden xs:inline">Clear</span>
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="px-4 sm:px-6 pb-4 sm:pb-5 border-t border-gray-100 pt-4 sm:pt-5 bg-linear-to-b from-indigo-50/30 to-white">
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Quick Filters
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Today", value: "today" },
                      { label: "Yesterday", value: "yesterday" },
                      { label: "Last 7 Days", value: "week" },
                      { label: "Last 30 Days", value: "month" },
                      { label: "All Time", value: "all" },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => applyQuickFilter(preset.value)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border-2 border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-all text-xs sm:text-sm font-semibold"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                  <Select
                    label="Branch"
                    value={filters.branch}
                    onChange={(val) => setFilters({ ...filters, branch: val })}
                    options={[
                      { value: "", label: "All Branches" },
                      ...tenantBranches.map((b) => ({ value: b, label: b })),
                    ]}
                    icon={Building2}
                  />
                  <Input
                    label="From Date"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(val) =>
                      setFilters({ ...filters, dateFrom: val })
                    }
                    icon={Calendar}
                  />
                  <Input
                    label="To Date"
                    type="date"
                    value={filters.dateTo}
                    onChange={(val) => setFilters({ ...filters, dateTo: val })}
                    icon={Calendar}
                  />
                  <Select
                    label="Payment Method"
                    value={filters.paymentMethod}
                    onChange={(val) =>
                      setFilters({ ...filters, paymentMethod: val })
                    }
                    options={[
                      { value: "", label: "All Methods" },
                      ...PAYMENT_METHODS.map((m) => ({
                        value: m,
                        label: m.replace(/_/g, " ").toUpperCase(),
                      })),
                    ]}
                    icon={CreditCard}
                  />
                  {(activeCategory === "TRANSPLANT" ||
                    activeCategory === "SERVICE") && (
                    <Select
                      label="Procedure"
                      value={filters.procedure}
                      onChange={(val) =>
                        setFilters({ ...filters, procedure: val })
                      }
                      options={[
                        { value: "", label: "All Procedures" },
                        ...(activeCategory === "TRANSPLANT"
                          ? TRANSPLANT_PROCEDURES
                          : SERVICE_PROCEDURES
                        ).map((p) => ({ value: p, label: p })),
                      ]}
                    />
                  )}
                </div>

                {hasActiveFilters && (
                  <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-indigo-900">
                        Active Filters:
                      </span>
                      <span className="text-xs text-indigo-700">
                        {total} results
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filters.branch && (
                        <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">
                          Branch: {filters.branch}
                        </span>
                      )}
                      {filters.dateFrom && (
                        <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">
                          From: {formatDateForDisplay(filters.dateFrom)}
                        </span>
                      )}
                      {filters.dateTo && (
                        <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">
                          To: {formatDateForDisplay(filters.dateTo)}
                        </span>
                      )}
                      {filters.paymentMethod && (
                        <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">
                          Method: {filters.paymentMethod.replace(/_/g, " ").toUpperCase()}
                        </span>
                      )}
                      {filters.procedure && (
                        <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">
                          Procedure: {filters.procedure}
                        </span>
                      )}
                      {tableSearch && (
                        <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">
                          Search: "{tableSearch}"
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DataTable
            category={activeCategory}
            rows={transactions}
            onDelete={openDeleteConfirm}
            onGenerateBill={openBillGenerator}
            onSort={handleSort}
            sortConfig={sortConfig}
            pagination={{ page: current, pages, perPage, setPage, setPerPage, startIdx, endIdx, total }}
          />
        </div>
      </main>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          transaction={deletingTransaction}
          onClose={() => {
            setShowDeleteConfirm(false);
            setDeletingTransaction(null);
          }}
          onConfirm={handleDelete}
        />
      )}

      {showBillGenerator && selectedTransactionId && (
        <BillGenerator
          transactionId={selectedTransactionId}
          onClose={closeBillGenerator}
        />
      )}
    </div>
  );
}
