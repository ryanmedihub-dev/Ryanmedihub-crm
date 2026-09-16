"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { maskPhone } from "@/utils/phoneUtils";
import StockSidebar from "@/components/Sidebars/StockSidebar";
import { useToast } from "@/components/Toast";
import BillGenerator from "@/components/BillGenerator";
import {
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Edit2,
  User,
  Calendar,
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
const TRANSPLANT_PROCEDURES = ["Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant"];
const SERVICE_PROCEDURES = ["PRP", "GFC", "Alopecia", "Headwash", "Canacot"];
const TRANSACTION_CATEGORIES = [
  { value: "TRANSPLANT", label: "Transplant", icon: User, color: "indigo" },
  { value: "SERVICE", label: "Services", icon: User, color: "pink" },
  { value: "MEDICINE", label: "Medicine", icon: User, color: "emerald" },
  { value: "EXPENSE", label: "Expenses", icon: User, color: "rose" },
];

const getCategoryGradientClass = (categoryValue, isActive) => {
  if (!isActive) return "bg-gray-50 text-gray-600 hover:bg-gray-100";
  const gradients = {
    TRANSPLANT: "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md",
    SERVICE: "bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-md",
    MEDICINE: "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md",
    EXPENSE: "bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-md",
  };
  return gradients[categoryValue] || "bg-gray-50 text-gray-600";
};

function StatCard({ title, value, icon: Icon, gradient, count, iconBg, iconColor }) {
  return (
    <div className={`bg-linear-to-br ${gradient} p-4 sm:p-6 rounded-2xl shadow-lg text-white relative overflow-hidden transform hover:scale-105 transition-transform duration-300`}>
      <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full -mr-12 -mt-12 sm:-mr-16 sm:-mt-16" />
      <div className="relative">
        <div className="flex justify-between items-start mb-3 sm:mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-white/90 text-xs sm:text-sm font-medium mb-1 truncate">{title}</p>
            <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">{value}</h3>
          </div>
          <div className={`${iconBg} p-2 sm:p-3 rounded-xl shrink-0 ml-2`}>
            <Icon className={`w-4 h-4 sm:w-6 sm:h-6 ${iconColor}`} />
          </div>
        </div>
        <p className="text-white/80 text-xs sm:text-sm font-medium truncate">{count}</p>
      </div>
    </div>
  );
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4">
        <div className="p-6 sm:p-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">Delete Transaction?</h2>
          <p className="text-gray-600 text-center mb-4 sm:mb-6 text-sm sm:text-base">
            Are you sure you want to delete this transaction? This action cannot be undone.
          </p>
          <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Category:</span>
              <span className="font-bold text-gray-900 text-sm sm:text-base">{transaction?.transactionCategory || "Uncategorized"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Amount:</span>
              <span className="font-bold text-emerald-600 text-sm sm:text-base">{formatCurrency(netAmount)}</span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Discount:</span>
                <span className="font-bold text-amber-600 text-sm sm:text-base">-{formatCurrency(transaction?.discount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-600">Date:</span>
              <span className="font-medium text-gray-900 text-sm sm:text-base">{formatDateForDisplay(transaction?.date)}</span>
            </div>
          </div>
          <div className="flex flex-col xs:flex-row gap-3">
            <button onClick={onClose} disabled={deleting} className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-semibold text-gray-700 disabled:opacity-50 text-sm sm:text-base">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all font-semibold disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base">
              {deleting ? (<><Loader2 className="w-4 h-4 animate-spin" />Deleting...</>) : (<><Trash2 className="w-4 h-4" />Delete</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, type = "text", value, onChange, icon: Icon, required, placeholder, min, max }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 mb-2 block">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />}
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} min={min} max={max}
          className={`w-full border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all text-sm sm:text-base ${Icon ? "pl-9 sm:pl-11 pr-4" : "px-4"} py-2.5 sm:py-3`}
        />
      </div>
    </label>
  );
}

function Select({ label, value, onChange, options, required, icon: Icon }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-700 mb-2 block">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />}
        <select value={value} onChange={(e) => onChange(e.target.value)} required={required}
          className={`w-full border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 bg-white transition-all appearance-none text-sm sm:text-base ${Icon ? "pl-9 sm:pl-11 pr-8 sm:pr-10" : "px-4 pr-8 sm:pr-10"} py-2.5 sm:py-3`}
        >
          {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
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
        <Clock className="w-3 h-3" />Pending Approval
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        <XCircle className="w-3 h-3" />Rejected
      </span>
    );
  }
  return null;
}

function DataTable({ category, rows, onDelete, onSort, sortConfig, pagination, onGenerateBill }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";

  const hasUndefinedCategory = (row) => {
    const cat = row.transactionCategory || row.category;
    return !cat || cat === "";
  };

  const getColumns = () => {
    const base = [{ key: "date", label: "Date", sortable: true, width: "110px" }];
    switch (category) {
      case "TRANSPLANT": return [...base,
        { key: "patient", label: "Patient", sortable: true, width: "160px" },
        { key: "procedure", label: "Procedure", sortable: true, width: "130px" },
        { key: "paymentType", label: "Payment Type", sortable: true, width: "120px" },
        { key: "amount", label: "Amount", sortable: true, width: "130px" },
        { key: "method", label: "Method", sortable: true, width: "110px" },
        { key: "paymentId", label: "Trans ID", sortable: true, width: "150px" },
        { key: "branch", label: "Branch", sortable: true, width: "110px" },
        { key: "actions", label: "Actions", sortable: false, width: "120px" },
      ];
      case "SERVICE": return [...base,
        { key: "patient", label: "Patient/Customer", sortable: true, width: "160px" },
        { key: "procedure", label: "Service", sortable: true, width: "100px" },
        { key: "quantity", label: "Sessions", sortable: true, width: "90px" },
        { key: "perSessionCost", label: "Per Session", sortable: true, width: "120px" },
        { key: "amount", label: "Total", sortable: true, width: "130px" },
        { key: "method", label: "Method", sortable: true, width: "110px" },
        { key: "paymentId", label: "Trans ID", sortable: true, width: "150px" },
        { key: "batchId", label: "Batch", sortable: false, width: "100px" },
        { key: "branch", label: "Branch", sortable: true, width: "110px" },
        { key: "actions", label: "Actions", sortable: false, width: "120px" },
      ];
      case "MEDICINE": return [...base,
        { key: "patient", label: "Patient/Customer", sortable: true, width: "160px" },
        { key: "medicine", label: "Medicine", sortable: true, width: "160px" },
        { key: "quantity", label: "Qty", sortable: true, width: "80px" },
        { key: "perUnitCost", label: "Per Unit", sortable: true, width: "110px" },
        { key: "amount", label: "Total", sortable: true, width: "130px" },
        { key: "method", label: "Method", sortable: true, width: "110px" },
        { key: "paymentId", label: "Trans ID", sortable: true, width: "150px" },
        { key: "batchId", label: "Batch", sortable: false, width: "100px" },
        { key: "branch", label: "Branch", sortable: true, width: "110px" },
        { key: "actions", label: "Actions", sortable: false, width: "120px" },
      ];
      case "EXPENSE": return [...base,
        { key: "expense", label: "Expense", sortable: true, width: "160px" },
        { key: "expenseType", label: "Type", sortable: true, width: "150px" },
        { key: "expenseGiver", label: "Paid To", sortable: false, width: "160px" },
        { key: "amount", label: "Amount", sortable: true, width: "130px" },
        { key: "method", label: "Method", sortable: true, width: "110px" },
        { key: "paymentId", label: "Trans ID", sortable: true, width: "150px" },
        { key: "branch", label: "Branch", sortable: true, width: "110px" },
        { key: "status", label: "Status", sortable: false, width: "140px" },
        { key: "actions", label: "Actions", sortable: false, width: "120px" },
      ];
      default: return base;
    }
  };

  const columns = getColumns();

  const getProcedureColor = (proc) => {
    const colors = {
      "sapphire fue": "bg-indigo-100 text-indigo-700 border-indigo-200",
      dhi: "bg-purple-100 text-purple-700 border-purple-200",
      "turkish dhi": "bg-pink-100 text-pink-700 border-pink-200",
      "beard transplant": "bg-amber-100 text-amber-700 border-amber-200",
      prp: "bg-emerald-100 text-emerald-700 border-emerald-200",
      gfc: "bg-cyan-100 text-cyan-700 border-cyan-200",
      alopecia: "bg-rose-100 text-rose-700 border-rose-200",
      headwash: "bg-sky-100 text-sky-700 border-sky-200",
      canacot: "bg-lime-100 text-lime-700 border-lime-200",
    };
    return colors[proc?.toLowerCase()] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  const getMethodColor = (method) => {
    const colors = {
      cash: "bg-emerald-100 text-emerald-700 border-emerald-200",
      upi: "bg-blue-100 text-blue-700 border-blue-200",
      card: "bg-purple-100 text-purple-700 border-purple-200",
      banking: "bg-indigo-100 text-indigo-700 border-indigo-200",
      bajaj_loan: "bg-orange-100 text-orange-700 border-orange-200",
      fibe_loan: "bg-amber-100 text-amber-700 border-amber-200",
      hdfc_skin_bank_transfer: "bg-sky-100 text-sky-700 border-sky-200",
      hdfc_ryan_medihub_bank_transfer: "bg-teal-100 text-teal-700 border-teal-200",
      icici_medihub_bank_transfer: "bg-rose-100 text-rose-700 border-rose-200",
    };
    return colors[method?.toLowerCase()] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === "asc"
      ? <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4 rotate-90 text-indigo-600" />
      : <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 rotate-90 text-indigo-600" />;
  };

  const gridTemplateColumns = columns.map((col) => col.width).join(" ");

  const getPatientName = (row) => {
    if (row.patient && typeof row.patient === "object") return row.patient.personal?.name || "N/A";
    return row.patientName || "Walk-in Customer";
  };
  const getPatientPhone = (row) => {
    const raw = (row.patient && typeof row.patient === "object") ? row.patient.personal?.phone || "" : row.patientPhone || "";
    return maskPhone(raw, userRole);
  };
  const getMedicineName = (row) => {
    if (row.medicineId && typeof row.medicineId === "object") return row.medicineId.name || "N/A";
    return "N/A";
  };
  const getExpenseGiverName = (row) => {
    if (row.expenseGiver?.type === "VENDOR") {
      if (typeof row.expenseGiver.vendorId === "object") return row.expenseGiver.vendorId?.name || row.expenseGiver.name || "N/A";
      return row.expenseGiver.name || "N/A";
    }
    return row.expenseGiver?.name || "N/A";
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="hidden md:grid items-center bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 min-h-13 px-2" style={{ gridTemplateColumns }}>
        {columns.map((col) => (
          <div key={col.key} className={`px-2 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wide truncate ${col.sortable ? "cursor-pointer hover:bg-slate-200/50 transition-colors duration-150 group" : ""}`} onClick={() => col.sortable && onSort(col.key)}>
            <div className="flex items-center gap-1.5">
              <span className="truncate">{col.label}</span>
              {col.sortable && <SortIcon columnKey={col.key} />}
            </div>
          </div>
        ))}
      </div>

      <div className="md:hidden bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{category} Records</h3>
            <p className="text-xs text-slate-600">Showing {rows.length} of {pagination.total}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-700">Sorted by</p>
            <p className="text-sm font-bold text-indigo-700">{sortConfig.key.replace(/([A-Z])/g, " $1").trim()}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No records found</h3>
            <p className="text-sm text-slate-600 text-center max-w-md">Try adjusting your search filters or add a new transaction</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              const netAmount = calculateNetAmount(row);
              const hasDiscount = parseFloat(row.discount || 0) > 0;
              const rowCategory = row.transactionCategory || row.category || "TRANSPLANT";

              return (
                <div key={row._id || i}>
                  <div className="group transition-all duration-200 hover:bg-indigo-50/30">
                    <div className="hidden md:grid items-center min-h-16 px-2" style={{ gridTemplateColumns }}>
                      <div className="px-2 py-3">
                        <div className="text-sm font-medium text-slate-900">{formatDateForDisplay(row.date)}</div>
                      </div>

                      {rowCategory === "TRANSPLANT" && (<>
                        <div className="px-2 py-3"><div className="text-sm font-semibold text-slate-900 truncate">{getPatientName(row)}</div><div className="text-xs text-slate-600 font-medium">{getPatientPhone(row) || "No phone"}</div></div>
                        <div className="px-2 py-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold border ${getProcedureColor(row.procedure)}`}>{row.procedure}</span></div>
                        <div className="px-2 py-3"><span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">{row.paymentType}</span></div>
                        <div className="px-2 py-3"><div className="text-center"><div className="text-sm font-bold text-emerald-700">{formatCurrency(netAmount)}</div>{hasDiscount && (<div className="flex items-center justify-center gap-1 mt-1"><Tag className="w-3 h-3 text-amber-500" /><span className="text-xs text-amber-600 font-medium">-{formatCurrency(row.discount)}</span></div>)}</div></div>
                        <div className="px-2 py-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold border ${getMethodColor(row.method)}`}>{row.method?.replace(/_/g, " ").toUpperCase()}</span></div>
                        <div className="px-2 py-3">{row.paymentId ? <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">{row.paymentId}</div> : <span className="text-xs text-slate-400">-</span>}</div>
                        <div className="px-2 py-3"><span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">{row.branch}</span></div>
                      </>)}

                      {rowCategory === "SERVICE" && (<>
                        <div className="px-2 py-3"><div className="text-sm font-semibold text-slate-900 truncate">{getPatientName(row)}</div><div className="text-xs text-slate-600 font-medium">{getPatientPhone(row) || "No phone"}</div></div>
                        <div className="px-2 py-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold border ${getProcedureColor(row.procedure)}`}>{row.procedure}</span></div>
                        <div className="px-2 py-3 text-center"><div className="text-sm font-bold text-indigo-700">{row.quantity || 1}</div></div>
                        <div className="px-2 py-3 text-center"><div className="text-sm font-medium text-slate-900">{formatCurrency(row.perSessionCost || 0)}</div></div>
                        <div className="px-2 py-3"><div className="text-center"><div className="text-sm font-bold text-emerald-700">{formatCurrency(netAmount)}</div>{hasDiscount && (<div className="flex items-center justify-center gap-1 mt-1"><Tag className="w-3 h-3 text-amber-500" /><span className="text-xs text-amber-600 font-medium">-{formatCurrency(row.discount)}</span></div>)}</div></div>
                        <div className="px-2 py-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold border ${getMethodColor(row.method)}`}>{row.method?.replace(/_/g, " ").toUpperCase()}</span></div>
                        <div className="px-2 py-3">{row.paymentId ? <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">{row.paymentId}</div> : <span className="text-xs text-slate-400">-</span>}</div>
                        <div className="px-2 py-3">{row.batchId ? <div className="flex items-center gap-1"><Package className="w-3 h-3 text-indigo-600" /><span className="text-xs font-mono text-indigo-700">{row.batchId.slice(-8)}</span></div> : <span className="text-xs text-slate-400">-</span>}</div>
                        <div className="px-2 py-3"><span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">{row.branch}</span></div>
                      </>)}

                      {rowCategory === "MEDICINE" && (<>
                        <div className="px-2 py-3"><div className="text-sm font-semibold text-slate-900 truncate">{getPatientName(row)}</div><div className="text-xs text-slate-600 font-medium">{getPatientPhone(row) || "No phone"}</div></div>
                        <div className="px-2 py-3"><div className="text-sm font-semibold text-slate-900 truncate">{getMedicineName(row)}</div></div>
                        <div className="px-2 py-3 text-center"><div className="text-sm font-bold text-indigo-700">{row.quantity || 1}</div></div>
                        <div className="px-2 py-3 text-center"><div className="text-sm font-medium text-slate-900">{formatCurrency(row.perUnitCost || 0)}</div></div>
                        <div className="px-2 py-3"><div className="text-center"><div className="text-sm font-bold text-emerald-700">{formatCurrency(netAmount)}</div>{hasDiscount && (<div className="flex items-center justify-center gap-1 mt-1"><Tag className="w-3 h-3 text-amber-500" /><span className="text-xs text-amber-600 font-medium">-{formatCurrency(row.discount)}</span></div>)}</div></div>
                        <div className="px-2 py-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold border ${getMethodColor(row.method)}`}>{row.method?.replace(/_/g, " ").toUpperCase()}</span></div>
                        <div className="px-2 py-3">{row.paymentId ? <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">{row.paymentId}</div> : <span className="text-xs text-slate-400">-</span>}</div>
                        <div className="px-2 py-3">{row.batchId ? <div className="flex items-center gap-1"><Package className="w-3 h-3 text-indigo-600" /><span className="text-xs font-mono text-indigo-700">{row.batchId.slice(-8)}</span></div> : <span className="text-xs text-slate-400">-</span>}</div>
                        <div className="px-2 py-3"><span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">{row.branch}</span></div>
                      </>)}

                      {rowCategory === "EXPENSE" && (<>
                        <div className="px-2 py-3"><div className="text-sm font-semibold text-slate-900 truncate">{row.expense || row.expenseCategory || "N/A"}</div></div>
                        <div className="px-2 py-3"><div className="text-sm text-slate-900 truncate">{row.expenseType || "-"}</div></div>
                        <div className="px-2 py-3"><div className="text-sm text-slate-900 truncate">{getExpenseGiverName(row)}</div></div>
                        <div className="px-2 py-3 text-right"><div className="text-sm font-bold text-rose-600">{formatCurrency(row.amount)}</div></div>
                        <div className="px-2 py-3"><span className={`inline-flex px-2 py-1 rounded-lg text-xs font-semibold border ${getMethodColor(row.method)}`}>{row.method?.replace(/_/g, " ").toUpperCase()}</span></div>
                        <div className="px-2 py-3">{row.paymentId ? <div className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-700 truncate">{row.paymentId}</div> : <span className="text-xs text-slate-400">-</span>}</div>
                        <div className="px-2 py-3"><span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">{row.branch}</span></div>
                        <div className="px-2 py-3"><ApprovalBadge status={row.approvalStatus} /></div>
                      </>)}

                      <div className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => onGenerateBill(row)} className="p-2 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-600 hover:text-emerald-800" title="Generate Bill"><Bill size={18} /></button>
                          <button onClick={() => router.push(`/stocks/transactions/edit/${row._id}`)} className="p-2 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-600 hover:text-indigo-800" title="Edit record"><Edit2 size={18} /></button>
                          <button onClick={() => onDelete(row)} className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600 hover:text-red-800" title="Delete record"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </div>

                    <div className="md:hidden p-4">
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${rowCategory === "TRANSPLANT" ? getProcedureColor(row.procedure) : rowCategory === "SERVICE" ? getProcedureColor(row.procedure) : rowCategory === "MEDICINE" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-rose-100 text-rose-700 border border-rose-200"}`}>
                                {rowCategory === "TRANSPLANT" || rowCategory === "SERVICE" ? row.procedure : rowCategory === "MEDICINE" ? getMedicineName(row) : row.expense || row.expenseCategory || "Expense"}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${getMethodColor(row.method)}`}>{row.method?.replace(/_/g, " ").toUpperCase()}</span>
                              {hasUndefinedCategory(row) && (<span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-semibold border border-amber-200"><AlertCircle className="w-3 h-3" />Uncategorized</span>)}
                              {rowCategory === "EXPENSE" && <ApprovalBadge status={row.approvalStatus} />}
                            </div>
                            <h4 className="text-base font-bold text-slate-900">{rowCategory !== "EXPENSE" ? getPatientName(row) : getExpenseGiverName(row)}</h4>
                            {rowCategory !== "EXPENSE" && <p className="text-sm text-slate-600 font-medium">{getPatientPhone(row)}</p>}
                            {rowCategory === "EXPENSE" && <p className="text-sm text-slate-600 font-medium">{[row.expense || row.expenseCategory || "General Expense", row.expenseType].filter(Boolean).join(" • ")}</p>}
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${rowCategory === "EXPENSE" ? "text-rose-600" : "text-emerald-700"}`}>{formatCurrency(netAmount)}</div>
                            <p className="text-xs text-slate-500">{formatDateForDisplay(row.date)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {(rowCategory === "SERVICE" || rowCategory === "MEDICINE") && (<>
                            <div><p className="text-xs text-slate-500 mb-1">{rowCategory === "SERVICE" ? "Sessions" : "Quantity"}</p><p className="text-sm font-semibold text-indigo-700">{row.quantity || 1}</p></div>
                            <div><p className="text-xs text-slate-500 mb-1">{rowCategory === "SERVICE" ? "Per Session" : "Per Unit"}</p><p className="text-sm font-semibold text-slate-700">{formatCurrency(rowCategory === "SERVICE" ? row.perSessionCost : row.perUnitCost)}</p></div>
                          </>)}
                          {rowCategory === "TRANSPLANT" && <div><p className="text-xs text-slate-500 mb-1">Payment Type</p><p className="text-sm font-semibold text-blue-700">{row.paymentType || "N/A"}</p></div>}
                          {rowCategory === "EXPENSE" && <div><p className="text-xs text-slate-500 mb-1">Expense Category</p><p className="text-sm font-semibold text-rose-700">{row.expense || row.expenseCategory || "N/A"}</p></div>}
                          {rowCategory === "EXPENSE" && <div><p className="text-xs text-slate-500 mb-1">Expense Type</p><p className="text-sm font-semibold text-rose-700">{row.expenseType || "N/A"}</p></div>}
                          <div><p className="text-xs text-slate-500 mb-1">Branch</p><p className="text-sm font-semibold text-purple-700">{row.branch}</p></div>
                          <div><p className="text-xs text-slate-500 mb-1">Transaction ID</p><p className="text-sm font-mono text-slate-700 truncate">{row.paymentId || "-"}</p></div>
                          {row.batchId && <div className="col-span-2"><p className="text-xs text-slate-500 mb-1">Batch ID</p><p className="text-sm font-mono text-indigo-700">{row.batchId.slice(-8)}</p></div>}
                        </div>

                        {row.remarks && <div><p className="text-xs text-slate-500 mb-1">Remarks</p><p className="text-sm text-slate-700">{row.remarks}</p></div>}

                        <div className="flex items-center justify-end pt-3 border-t border-slate-200">
                          <div className="flex items-center gap-2">
                            <button onClick={() => onGenerateBill(row)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors"><Bill size={14} />Bill</button>
                            <button onClick={() => router.push(`/stocks/transactions/edit/${row._id}`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"><Edit2 size={14} />Edit</button>
                            <button onClick={() => onDelete(row)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-sm font-medium hover:bg-rose-100 transition-colors"><Trash2 size={14} />Delete</button>
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
            <span className="font-medium text-slate-900">{pagination.startIdx + 1}-{pagination.endIdx}</span>
            <span className="mx-2">of</span>
            <span className="font-medium text-slate-900">{pagination.total.toLocaleString()}</span>
            <span className="ml-2">records</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600 hidden sm:inline">Show</span>
              <select className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-medium transition-all" value={pagination.perPage} onChange={(e) => { pagination.setPerPage(Number(e.target.value)); pagination.setPage(1); }}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-sm text-slate-600 hidden sm:inline">per page</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => pagination.setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="p-2 rounded-lg border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-slate-400 transition-all"><ChevronLeft className="w-4 h-4" /></button>
              <div className="flex items-center gap-1 mx-2">
                {(() => {
                  const pages = [];
                  const totalPages = pagination.pages;
                  const currentPage = pagination.page;
                  if (currentPage > 2) { pages.push(1); if (currentPage > 3) pages.push("..."); }
                  for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) pages.push(i);
                  if (currentPage < totalPages - 1) { if (currentPage < totalPages - 2) pages.push("..."); pages.push(totalPages); }
                  return pages.map((page, idx) =>
                    page === "..." ? <span key={idx} className="px-2 text-slate-400">...</span> :
                    <button key={idx} onClick={() => pagination.setPage(page)} className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${page === currentPage ? "bg-indigo-600 text-white border border-indigo-600" : "text-slate-700 hover:bg-slate-100 border border-transparent"}`}>{page}</button>
                  );
                })()}
              </div>
              <button onClick={() => pagination.setPage((p) => Math.min(pagination.pages, p + 1))} disabled={pagination.page >= pagination.pages} className="p-2 rounded-lg border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-slate-400 transition-all"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_STATS = { TRANSPLANT: { count: 0, total: 0 }, SERVICE: { count: 0, total: 0 }, MEDICINE: { count: 0, total: 0 }, EXPENSE: { count: 0, total: 0 } };

// Only these columns are backed by an index the API can sort on server-side
// (see allowedSortKeys in /api/transactions/get-all). Clicking any other column
// header still re-fetches (so pagination stays correct) but keeps date order.
const SERVER_SORT_KEYS = new Set(["date", "amount", "method", "branch", "procedure"]);
const SORT_KEY_MAP = { patient: "patientName" };

export default function StocksTransactionsPage() {
  const tenantBranches = ["Delhi", "Mumbai", "Hyderabad", "Noida"];

  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [categoryStats, setCategoryStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("TRANSPLANT");
  const [filters, setFilters] = useState({ branch: "", dateFrom: getTodayDate(), dateTo: getTodayDate(), paymentMethod: "", procedure: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState(null);
  const [showBillGenerator, setShowBillGenerator] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [pendingOnly, setPendingOnly] = useState(false);
  const toast = useToast();
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(tableSearch), 350);
    return () => clearTimeout(t);
  }, [tableSearch]);

  useEffect(() => { if (activeCategory !== "EXPENSE" && pendingOnly) setPendingOnly(false); }, [activeCategory]);

  // Any of these changing invalidates the current page of results.
  useEffect(() => { setPage(1); }, [activeCategory, filters, debouncedSearch, pendingOnly]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(perPage));
      params.set("category", activeCategory);
      if (filters.branch) params.set("branch", filters.branch);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
      if (filters.procedure) params.set("procedure", filters.procedure);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeCategory === "EXPENSE" && pendingOnly) params.set("approvalStatus", "PENDING");

      const serverKey = SORT_KEY_MAP[sortConfig.key] || sortConfig.key;
      if (SERVER_SORT_KEYS.has(serverKey)) {
        params.set("sortKey", serverKey);
        params.set("sortDir", sortConfig.direction);
      }

      const res = await fetch(`/api/transactions/get-all?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.transactions || []);
        setServerTotal(data.total || 0);
        setCategoryStats(data.stats || EMPTY_STATS);
      } else {
        throw new Error(data.message || data.error || "Invalid data format");
      }
    } catch (e) {
      setError(e.message);
      toast?.error?.("Error loading data: " + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeCategory, filters, debouncedSearch, pendingOnly, page, perPage, sortConfig]);

  const handleRefresh = async () => { setRefreshing(true); await fetchData(); };

  const handleSort = (key) => { setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" })); };

  // The API already returns exactly this page, sorted and filtered — no client-side
  // slicing needed.
  const paginatedRows = transactions;
  const total = serverTotal;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages);
  const startIdx = total === 0 ? 0 : (current - 1) * perPage;
  const endIdx = Math.min(startIdx + paginatedRows.length, total);

  // If a filter change shrinks the result set below the current page, snap back.
  useEffect(() => { if (page > pages) setPage(pages); }, [pages, page]);

  const clearFilters = () => { setFilters({ branch: "", dateFrom: getTodayDate(), dateTo: getTodayDate(), paymentMethod: "", procedure: "" }); setTableSearch(""); setPage(1); };
  const hasActiveFilters = Object.values(filters).some((value) => value !== "") || tableSearch;

  const openDeleteConfirm = (transaction) => { setDeletingTransaction(transaction); setShowDeleteConfirm(true); };

  const handleDelete = async () => {
    if (!deletingTransaction) return;
    try {
      const category = deletingTransaction.transactionCategory || deletingTransaction.category || "TRANSPLANT";
      const endpoint = category === "TRANSPLANT" ? "/api/transactions/transplant/delete" : category === "SERVICE" ? "/api/transactions/service/delete" : category === "MEDICINE" ? "/api/transactions/medicine/delete" : "/api/transactions/expense/delete";
      const res = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: deletingTransaction._id }), credentials: "include" });
      const data = await res.json();
      if (res.ok) { toast.success("Transaction deleted successfully"); fetchData(); setShowDeleteConfirm(false); setDeletingTransaction(null); }
      else toast.error(data.error || "Failed to delete transaction");
    } catch (err) { toast.error("An error occurred while deleting"); }
  };

  const openBillGenerator = (data) => {
    try {
      const isRevenueTransaction = data.costType === "Revenue";
      const hasCategory = data.transactionCategory && data.transactionCategory !== "undefined" && data.transactionCategory !== "";
      if (isRevenueTransaction && (!hasCategory || data.transactionCategory === "TRANSPLANT") && data.patient) {
        const patientId = typeof data.patient === "object" ? data.patient._id : data.patient;
        setSelectedTransactionId(patientId || data._id);
      } else { setSelectedTransactionId(data._id); }
      setShowBillGenerator(true);
    } catch (error) { console.error("Error opening bill generator:", error); toast.error("Failed to open bill generator"); }
  };

  const closeBillGenerator = () => { setShowBillGenerator(false); setSelectedTransactionId(null); };

  const applyQuickFilter = (preset) => {
    const today = getTodayDate();
    const date = new Date();
    switch (preset) {
      case "today": setFilters({ ...filters, dateFrom: today, dateTo: today }); break;
      case "yesterday": const yesterday = new Date(date.setDate(date.getDate() - 1)).toISOString().split("T")[0]; setFilters({ ...filters, dateFrom: yesterday, dateTo: yesterday }); break;
      case "week": const weekAgo = new Date(date.setDate(date.getDate() - 7)).toISOString().split("T")[0]; setFilters({ ...filters, dateFrom: weekAgo, dateTo: getTodayDate() }); break;
      case "month": const monthAgo = new Date(date.setMonth(date.getMonth() - 1)).toISOString().split("T")[0]; setFilters({ ...filters, dateFrom: monthAgo, dateTo: getTodayDate() }); break;
      case "all": setFilters({ ...filters, dateFrom: "", dateTo: "" }); break;
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center"><Loader2 className="animate-spin h-16 w-16 text-indigo-500 mx-auto mb-4" /><p className="text-gray-600 font-medium">Loading transactions...</p></div>
    </div>
  );

  if (error) return (
    <div className="flex h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center bg-white p-8 rounded-3xl shadow-xl border border-red-100">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8 text-red-500" /></div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={handleRefresh} className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all font-medium">Try Again</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50">
      <StockSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full lg:w-auto min-w-0">
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl bg-white border-2 border-gray-200 shadow-sm">
                <Menu className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">All Transactions</h1>
                <p className="text-gray-600 text-sm sm:text-base">View and manage all transaction categories</p>
              </div>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button onClick={handleRefresh} disabled={refreshing} className="p-2 sm:p-3 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 shrink-0" title="Refresh data">
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-600 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button onClick={() => router.push("/stocks/transactions/create")} className="bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-3 sm:px-5 py-2 sm:py-3 rounded-xl flex items-center gap-1 sm:gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base shrink-0">
                <Plus size={18} strokeWidth={2.5} />
                <span className="font-semibold hidden sm:inline">Add Transaction</span>
                <span className="font-semibold sm:hidden">Add</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 mb-4 sm:mb-6">
          <StatCard title="Transplants" value={formatCurrency(categoryStats.TRANSPLANT.total)} icon={User} gradient="from-indigo-400 to-purple-500" count={`${categoryStats.TRANSPLANT.count} transactions`} iconBg="bg-indigo-100" iconColor="text-indigo-600" />
          <StatCard title="Services" value={formatCurrency(categoryStats.SERVICE.total)} icon={User} gradient="from-pink-400 to-rose-500" count={`${categoryStats.SERVICE.count} transactions`} iconBg="bg-pink-100" iconColor="text-pink-600" />
          <StatCard title="Medicines" value={formatCurrency(categoryStats.MEDICINE.total)} icon={User} gradient="from-emerald-400 to-green-500" count={`${categoryStats.MEDICINE.count} transactions`} iconBg="bg-emerald-100" iconColor="text-emerald-600" />
          <StatCard title="Expenses" value={formatCurrency(categoryStats.EXPENSE.total)} icon={User} gradient="from-rose-400 to-red-500" count={`${categoryStats.EXPENSE.count} transactions`} iconBg="bg-rose-100" iconColor="text-rose-600" />
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:gap-4 p-4 sm:px-6 sm:py-4">
              <div className="flex gap-1 sm:gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0">
                {TRANSACTION_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button key={cat.value} className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-semibold transition-all whitespace-nowrap shrink-0 flex items-center gap-2 ${getCategoryGradientClass(cat.value, activeCategory === cat.value)}`} onClick={() => setActiveCategory(cat.value)}>
                      <Icon size={18} />
                      {cat.label} ({categoryStats[cat.value].count})
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 sm:gap-3 w-full lg:w-auto">
                <div className="relative flex-1 lg:flex-initial min-w-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                  <input type="text" placeholder="Search all transactions..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} className="pl-9 sm:pl-11 pr-4 py-2 sm:py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 text-sm w-full lg:w-64 transition-all" />
                </div>
                {activeCategory === "EXPENSE" && (
                  <button
                    onClick={() => setPendingOnly((v) => !v)}
                    className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all shrink-0 flex items-center gap-2 text-sm font-semibold whitespace-nowrap ${pendingOnly ? "bg-amber-500 text-white shadow-md" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
                  >
                    <Clock className="w-4 h-4" />
                    <span className="hidden sm:inline">Pending Approvals</span>
                    <span className="sm:hidden">Pending</span>
                  </button>
                )}
                <button onClick={() => setShowFilters(!showFilters)} className={`p-2 sm:p-2.5 rounded-xl transition-all shrink-0 flex items-center gap-2 ${showFilters ? "bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200" : "bg-gray-50 hover:bg-gray-100 text-gray-600"}`}>
                  <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                  <ChevronDown className={`w-4 h-4 hidden sm:block ${showFilters ? "rotate-180" : ""}`} />
                </button>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-all font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap shrink-0">
                    <X className="w-4 h-4" /><span className="hidden xs:inline">Clear</span>
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="px-4 sm:px-6 pb-4 sm:pb-5 border-t border-gray-100 pt-4 sm:pt-5 bg-linear-to-b from-indigo-50/30 to-white">
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Quick Filters</label>
                  <div className="flex flex-wrap gap-2">
                    {[{ label: "Today", value: "today" }, { label: "Yesterday", value: "yesterday" }, { label: "Last 7 Days", value: "week" }, { label: "Last 30 Days", value: "month" }, { label: "All Time", value: "all" }].map((preset) => (
                      <button key={preset.value} onClick={() => applyQuickFilter(preset.value)} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border-2 border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-all text-xs sm:text-sm font-semibold">{preset.label}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                  <Select label="Branch" value={filters.branch} onChange={(val) => setFilters({ ...filters, branch: val })} options={[{ value: "", label: "All Branches" }, ...tenantBranches.map((b) => ({ value: b, label: b }))]} icon={Building2} />
                  <Input label="From Date" type="date" value={filters.dateFrom} onChange={(val) => setFilters({ ...filters, dateFrom: val })} icon={Calendar} />
                  <Input label="To Date" type="date" value={filters.dateTo} onChange={(val) => setFilters({ ...filters, dateTo: val })} icon={Calendar} />
                  <Select label="Payment Method" value={filters.paymentMethod} onChange={(val) => setFilters({ ...filters, paymentMethod: val })} options={[{ value: "", label: "All Methods" }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m.replace(/_/g, " ").toUpperCase() }))]} icon={CreditCard} />
                  {(activeCategory === "TRANSPLANT" || activeCategory === "SERVICE") && (
                    <Select label="Procedure" value={filters.procedure} onChange={(val) => setFilters({ ...filters, procedure: val })} options={[{ value: "", label: "All Procedures" }, ...(activeCategory === "TRANSPLANT" ? TRANSPLANT_PROCEDURES : SERVICE_PROCEDURES).map((p) => ({ value: p, label: p }))]} />
                  )}
                </div>
                {hasActiveFilters && (
                  <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-indigo-900">Active Filters:</span>
                      <span className="text-xs text-indigo-700">{serverTotal} results</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {filters.branch && <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">Branch: {filters.branch}</span>}
                      {filters.dateFrom && <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">From: {formatDateForDisplay(filters.dateFrom)}</span>}
                      {filters.dateTo && <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">To: {formatDateForDisplay(filters.dateTo)}</span>}
                      {filters.paymentMethod && <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">Method: {filters.paymentMethod.replace(/_/g, " ").toUpperCase()}</span>}
                      {filters.procedure && <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">Procedure: {filters.procedure}</span>}
                      {tableSearch && <span className="px-2 py-1 bg-white text-indigo-700 rounded-md text-xs font-medium border border-indigo-200">Search: "{tableSearch}"</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DataTable
            category={activeCategory}
            rows={paginatedRows}
            onDelete={openDeleteConfirm}
            onGenerateBill={openBillGenerator}
            onSort={handleSort}
            sortConfig={sortConfig}
            pagination={{ page: current, pages, perPage, setPage, setPerPage, startIdx, endIdx, total }}
          />
        </div>
      </main>

      {showDeleteConfirm && (
        <DeleteConfirmModal transaction={deletingTransaction} onClose={() => { setShowDeleteConfirm(false); setDeletingTransaction(null); }} onConfirm={handleDelete} />
      )}

      {showBillGenerator && selectedTransactionId && (
        <BillGenerator transactionId={selectedTransactionId} onClose={closeBillGenerator} />
      )}
    </div>
  );
}
