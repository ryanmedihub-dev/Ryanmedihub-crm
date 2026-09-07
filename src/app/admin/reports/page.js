"use client";

import { useState, useMemo } from "react";
import { ALL_BRANCHES } from "@/lib/branches";
import { PAYABLE_PURPOSES, payablePurposeLabel } from "@/constants/payablePurposes";
import {
  Download,
  Filter,
  Search,
  Calendar,
  FileText,
  Users,
  IndianRupee,
  Activity,
  TrendingUp,
  BarChart2,
  Star,
  X,
  RefreshCw,
  ChevronDown,
  Package,
  Briefcase,
  Stethoscope,
  HeartPulse,
  FileBarChart,
  ClipboardList,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Trash2,
  History,
} from "lucide-react";

const BRANCHES = ["All", ...ALL_BRANCHES];

// Indian grouping, no decimals — matches how money reads everywhere else in the app.
const INR_FORMAT = '₹#,##,##0';
const MONEY_COL_RE = /(amount|paid|pending|total|salary|mrp|revenue|expense|profit|value|₹|money in|money out|\bin\b|\bout\b)/i;

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last7" },
  { label: "Last 30 Days", value: "last30" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "All Time", value: "allTime" },
  { label: "Custom", value: "custom" },
];

const TECHNIQUES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant", "PRP",
  "Alopecia", "Headwash", "GFC", "Other",
];

const PROCEDURES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant",
  "PRP", "GFC", "Medicine", "Other",
];

const PAYMENT_TYPES = ["Booking", "Pending", "Full-payment", "Other"];

const PATIENT_STATUSES = [
  "NEW", "NOT_VISITED", "NOT_CONVERTED", "CONSULTED",
  "SURGERY_BOOKED", "BOOKING_DONE", "CLOSED",
];

const COLOR_MAP = {
  amber:  { accent: "bg-amber-500",   soft: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700" },
  orange: { accent: "bg-orange-500",  soft: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200", badge: "bg-orange-100 text-orange-700" },
  blue:   { accent: "bg-blue-500",    soft: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700" },
  green:  { accent: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200",badge: "bg-emerald-100 text-emerald-700" },
  purple: { accent: "bg-purple-500",  soft: "bg-purple-50",  text: "text-purple-700", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
  red:    { accent: "bg-red-500",     soft: "bg-red-50",     text: "text-red-700",    border: "border-red-200",    badge: "bg-red-100 text-red-700" },
  indigo: { accent: "bg-indigo-500",  soft: "bg-indigo-50",  text: "text-indigo-700", border: "border-indigo-200", badge: "bg-indigo-100 text-indigo-700" },
  teal:   { accent: "bg-teal-500",    soft: "bg-teal-50",    text: "text-teal-700",   border: "border-teal-200",   badge: "bg-teal-100 text-teal-700" },
  pink:   { accent: "bg-pink-500",    soft: "bg-pink-50",    text: "text-pink-700",   border: "border-pink-200",   badge: "bg-pink-100 text-pink-700" },
};

const REPORTS = [
  {
    id: 1, type: "patients-comprehensive", category: "Patient Reports",
    name: "Comprehensive Patient Report",
    description: "Full patient data — personal info, medical history, counselling, surgery, and payments",
    icon: HeartPulse, color: "blue",
    filters: ["branch", "status", "technique", "staff"],
  },
  {
    id: 2, type: "patients-status", category: "Patient Reports",
    name: "Patient Status Pipeline",
    description: "Patient distribution across all status stages — NEW → CLOSED",
    icon: Activity, color: "amber",
    filters: ["branch", "status"],
  },
  {
    id: 3, type: "patients-medical", category: "Patient Reports",
    name: "Medical History Report",
    description: "Patient medical records — blood group, allergies, BP, sugar, HIV, HCV",
    icon: FileText, color: "red",
    filters: ["branch"],
  },
  {
    id: 4, type: "patients-surgery", category: "Patient Reports",
    name: "Surgery Schedule Report",
    description: "All surgeries with doctor, technician, implanter, technique, and graft details",
    icon: Stethoscope, color: "purple",
    filters: ["branch", "staff"],
  },
  {
    id: 5, type: "patients-counselling", category: "Patient Reports",
    name: "Counselling Outcomes Report",
    description: "Counselling sessions — technique suggested, package, readiness, medicines",
    icon: ClipboardList, color: "indigo",
    filters: ["branch", "staff"],
  },
  {
    id: 6, type: "outstanding-payments", category: "Patient Reports",
    name: "Outstanding Payments Report",
    description: "Patients with pending dues — sorted by highest pending amount",
    icon: IndianRupee, color: "orange",
    filters: ["branch", "status"],
  },
  {
    id: 7, type: "grafts-analysis", category: "Patient Reports",
    name: "Grafts Analysis Report",
    description: "Grafts suggested vs needed vs implanted — variance and implantation rate",
    icon: BarChart2, color: "teal",
    filters: ["branch", "technique"],
  },

  {
    id: 8, type: "employees-all", category: "Staff Reports",
    name: "All Employees Report",
    description: "Every employee (active & inactive) — role, contact, status, salary, incentive rate, and total patients",
    icon: Users, color: "blue",
    filters: [],
  },
  {
    id: 9, type: "counsellors", category: "Staff Reports",
    name: "Counsellor Performance",
    description: "Counsellor-wise conversion rates, package values, and surgery readiness",
    icon: TrendingUp, color: "purple",
    filters: ["branch", "staff"],
  },
  {
    id: 10, type: "agents", category: "Staff Reports",
    name: "Agent Referral Performance",
    description: "Agent-wise referral count, conversions, and total revenue generated",
    icon: Users, color: "indigo",
    filters: ["branch", "staff"],
  },
  {
    id: 11, type: "doctors", category: "Staff Reports",
    name: "Doctor Performance Report",
    description: "Doctor surgery count, techniques performed, grafts implanted per surgery",
    icon: Activity, color: "green",
    filters: ["branch", "staff", "technique"],
  },
  {
    id: 12, type: "implanters", category: "Staff Reports",
    name: "Implanter Efficiency Report",
    description: "Implanter procedure count and average grafts implanted per procedure",
    icon: BarChart2, color: "teal",
    filters: ["branch", "staff"],
  },
  {
    id: 13, type: "technicians", category: "Staff Reports",
    name: "Technician Workload Report",
    description: "Technician roles — senior tech, grafting person, helper distributions",
    icon: Briefcase, color: "amber",
    filters: ["branch", "staff"],
  },

  {
    id: 14, type: "revenue", category: "Financial Reports",
    name: "Revenue Report",
    description: "All revenue transactions with patient, procedure, method, and amount details",
    icon: IndianRupee, color: "green",
    filters: ["branch", "procedure", "paymentType"],
  },
  {
    id: 15, type: "expenses", category: "Financial Reports",
    name: "Expenses Report",
    description: "All expense transactions — category, vendor, method, and amount",
    icon: IndianRupee, color: "red",
    filters: ["branch"],
  },
  {
    id: 16, type: "transactions-all", category: "Financial Reports",
    name: "All Transactions Report",
    description: "Complete transaction history — both revenue and expenses with all filters",
    icon: FileText, color: "blue",
    filters: ["branch", "procedure", "paymentType"],
  },
  {
    id: 17, type: "procedure-revenue", category: "Financial Reports",
    name: "Procedure-wise Revenue",
    description: "Revenue breakdown by procedure type — total, count, and average transaction",
    icon: BarChart2, color: "purple",
    filters: ["branch", "procedure"],
  },
  {
    id: 18, type: "techniques", category: "Financial Reports",
    name: "Technique Revenue Analysis",
    description: "Surgery technique analysis — count, grafts, and average revenue per technique",
    icon: BarChart2, color: "indigo",
    filters: ["branch", "technique"],
  },
  {
    id: 19, type: "branch-comparison", category: "Financial Reports",
    name: "Branch Comparison Report",
    description: "All-branch comparison — patients, surgeries, revenue, expenses, and net profit",
    icon: TrendingUp, color: "amber",
    filters: [],
  },
  {
    id: 26, type: "payables-all", category: "Financial Reports",
    name: "Payables Report",
    description: "Each payable followed by the payments made against it — live paid/pending, ageing, method and account. Filter by payable type for a single head, e.g. Rent.",
    icon: IndianRupee, color: "red",
    filters: ["branch", "payableType"],
  },
  {
    id: 27, type: "receivables-all", category: "Financial Reports",
    name: "Receivables Report",
    description: "Every amount owed to us — patient dues, collab settlements, refunds — with live received/pending and ageing",
    icon: IndianRupee, color: "green",
    filters: ["branch"],
  },
  {
    id: 28, type: "suspense-all", category: "Financial Reports",
    name: "Suspense Report",
    description: "Every unexplained credit/debit parked in a suspense account — amount, account, open/resolved status, and the transaction that cleared it",
    icon: AlertCircle, color: "amber",
    filters: ["branch"],
  },
  {
    id: 29, type: "contra-all", category: "Financial Reports",
    name: "Contra / Transfers Report",
    description: "Internal money moved between our own accounts — two lines per transfer (from / to), with kind, reference and status",
    icon: RefreshCw, color: "blue",
    filters: ["branch"],
  },
  {
    id: 30, type: "incentives-all", category: "Financial Reports",
    name: "Incentives Report",
    description: "Every staff incentive recorded against a patient — grouped by employee, with whether it was rolled into a payable and that payable's live paid/pending",
    icon: TrendingUp, color: "purple",
    filters: ["branch"],
  },
  {
    id: 31, type: "finance-daybook", category: "Financial Reports",
    name: "All Finance Entries (Day Book)",
    description: "Every finance entry CREATED in the selected date range — payables, receivables, advances, borrowings, revenue, expenses, contra transfers and suspense — one flat sheet with an Entry Type column. Set the date range above to Today for today's entries; filter by branch too.",
    icon: ClipboardList, color: "teal",
    filters: ["branch"],
  },
  {
    id: 32, type: "party-net-balance", category: "Financial Reports",
    name: "Party Net Balance (Payables − Receivables)",
    description: "Every employee and vendor with a live net balance = payable pending − receivable pending, then a full statement below each: their open payables and receivables with every payment and receipt posted against them. Sorted by biggest balance first.",
    icon: Users, color: "teal",
    filters: ["branch"],
  },
  {
    id: 20, type: "stocks-all", category: "Inventory Reports",
    name: "Stock Inventory Report",
    description: "Full stock list — quantity, MRP, purchase price, expiry, and total stock value",
    icon: Package, color: "orange",
    filters: [],
  },
  {
    id: 21, type: "vendors-all", category: "Inventory Reports",
    name: "Vendors Report",
    description: "All vendor details — contact, GST number, deals in, and transaction count",
    icon: Briefcase, color: "teal",
    filters: [],
  },

  {
    id: 23, type: "transaction-changes-log", category: "Audit Logs",
    name: "Transaction Changes Log",
    description: "One row per changed field — previous & new value, who and when — with every transaction detail alongside",
    icon: History, color: "blue",
    filters: [],
    apiPath: "/api/admin/logs",
  },
  {
    id: 24, type: "stock-changes-log", category: "Audit Logs",
    name: "Stock Changes Log",
    description: "Complete history of stock item edits — quantity, price, expiry changes with timestamps and editor info",
    icon: Package, color: "orange",
    filters: [],
    apiPath: "/api/admin/logs",
  },
  {
    id: 25, type: "patient-changes-log", category: "Audit Logs",
    name: "Patient Changes Log",
    description: "All patient record modifications — created and updated events with who made changes and when",
    icon: ShieldAlert, color: "purple",
    filters: [],
    apiPath: "/api/admin/logs",
  },
];

const CATEGORIES = ["All", ...new Set(REPORTS.map((r) => r.category))];

// Emit the plain calendar day the user is thinking about (YYYY-MM-DD), NOT an ISO instant.
// The server's getISTStartOfDay/getISTEndOfDay bracket a bare date to the IST day; handing
// them a browser-local-shifted `.toISOString()` made them convert a second time and pull
// the `from` boundary a full day earlier (a "31 Aug" download also returned 30 Aug).
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function buildDateRange(preset, custom) {
  const now = new Date();

  if (preset === "today") {
    return { from: ymd(now), to: ymd(now) };
  }
  if (preset === "yesterday") {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    return { from: ymd(d), to: ymd(d) };
  }
  if (preset === "last7") {
    const from = new Date(now); from.setDate(from.getDate() - 6);
    return { from: ymd(from), to: ymd(now) };
  }
  if (preset === "last30") {
    const from = new Date(now); from.setDate(from.getDate() - 29);
    return { from: ymd(from), to: ymd(now) };
  }
  if (preset === "thisMonth") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  }
  if (preset === "lastMonth") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (preset === "custom" && custom.from) {
    // date inputs are already YYYY-MM-DD
    return { from: custom.from, to: custom.to || custom.from };
  }
  return { from: null, to: null };
}

function PieChartIcon(props) { return <BarChart2 {...props} />; }

function ReportCard({ report, filters, loadingId, favorites, onDownload, onToggleFavorite }) {
  const c = COLOR_MAP[report.color] || COLOR_MAP.blue;
  const Icon = report.icon;
  const isLoading = loadingId === report.id;
  const isFav = favorites.includes(report.id);

  return (
    <div
      className={`bg-white rounded-2xl border ${c.border} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group`}
    >
      <div className={`h-1 ${c.accent}`} />

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl ${c.soft} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${c.text}`} />
          </div>
          <button
            onClick={() => onToggleFavorite(report.id)}
            className={`p-1.5 rounded-lg transition-colors ${
              isFav ? "text-amber-500 bg-amber-50" : "text-gray-300 hover:text-amber-400 hover:bg-amber-50"
            }`}
            title={isFav ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={`w-4 h-4 ${isFav ? "fill-amber-500" : ""}`} />
          </button>
        </div>

        <div className="mb-2">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${c.text} opacity-80`}>
            {report.category}
          </span>
          <h3 className="font-semibold text-gray-900 text-sm mt-0.5 leading-snug">
            {report.name}
          </h3>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-4">
          {report.description}
        </p>

        {report.filters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {report.filters.includes("branch") && filters.branch && filters.branch !== "All" && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {filters.branch}
              </span>
            )}
            {report.filters.includes("status") && filters.status && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {filters.status}
              </span>
            )}
            {report.filters.includes("technique") && filters.technique && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {filters.technique}
              </span>
            )}
            {report.filters.includes("procedure") && filters.procedure && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {filters.procedure}
              </span>
            )}
            {report.filters.includes("paymentType") && filters.paymentType && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {filters.paymentType}
              </span>
            )}
            {report.filters.includes("payableType") && filters.payableType && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {payablePurposeLabel(filters.payableType)}
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => onDownload(report)}
          disabled={isLoading}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            isLoading
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : `${c.accent} text-white hover:opacity-90 hover:shadow-md active:scale-95`
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download Excel
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl shadow-xl border max-w-sm transition-all duration-300 ${
        isError
          ? "bg-red-50 border-red-200 text-red-800"
          : "bg-emerald-50 border-emerald-200 text-emerald-800"
      }`}
    >
      {isError ? (
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
      ) : (
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.message && (
          <p className="text-xs mt-0.5 opacity-80">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-black/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AdminReportsPage() {
  const [loadingId, setLoadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_favoriteReports") || "[]"); }
    catch { return []; }
  });

  const [datePreset, setDatePreset] = useState("last30");
  const [customDates, setCustomDates] = useState({ from: "", to: "" });
  const [pendingCustom, setPendingCustom] = useState({ from: "", to: "" });
  const [filters, setFilters] = useState({
    branch: "All",
    status: "",
    technique: "",
    staff: "",
    procedure: "",
    paymentType: "",
    payableType: "",
  });

  const showToast = (title, message, type = "success") => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const toggleFavorite = (id) => {
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem("admin_favoriteReports", JSON.stringify(next)); } catch {}
  };

  const clearFilters = () => {
    setDatePreset("last30");
    setCustomDates({ from: "", to: "" });
    setPendingCustom({ from: "", to: "" });
    setFilters({ branch: "All", status: "", technique: "", staff: "", procedure: "", paymentType: "", payableType: "" });
    setSearchTerm("");
  };

  const applyCustomDates = () => {
    if (!pendingCustom.from) return;
    setCustomDates(pendingCustom);
    setDatePreset("custom");
  };

  const visibleReports = useMemo(() => {
    let list = REPORTS;
    if (activeCategory !== "All") list = list.filter((r) => r.category === activeCategory);
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.description.toLowerCase().includes(s) ||
          r.category.toLowerCase().includes(s)
      );
    }
    return [...list].sort((a, b) => {
      const af = favorites.includes(a.id);
      const bf = favorites.includes(b.id);
      if (af && !bf) return -1;
      if (!af && bf) return 1;
      return 0;
    });
  }, [activeCategory, searchTerm, favorites]);

  const activeFilterCount = [
    filters.branch !== "All" && filters.branch,
    filters.status,
    filters.technique,
    filters.procedure,
    filters.paymentType,
    filters.payableType,
    datePreset !== "last30" && datePreset !== "allTime" && datePreset,
  ].filter(Boolean).length;

  const handleDownload = async (report) => {
    setLoadingId(report.id);

    try {
      const { from, to } = buildDateRange(datePreset, customDates);
      const isLogReport = !!report.apiPath;

      const params = new URLSearchParams({ type: report.type });

      if (from) params.append("from", from);
      if (to) params.append("to", to);

      if (filters.branch && filters.branch !== "All") params.append("branch", filters.branch);
      if (!isLogReport) {
        if (filters.status) params.append("statusFilter", filters.status);
        if (filters.technique) params.append("techniqueFilter", filters.technique);
        if (filters.staff) params.append("staffFilter", filters.staff);
        if (filters.procedure) params.append("procedureFilter", filters.procedure);
        if (filters.paymentType) params.append("paymentTypeFilter", filters.paymentType);
        if (filters.payableType) params.append("payableTypeFilter", filters.payableType);
      }

      const endpoint = report.apiPath || "/api/admin/reports";
      const res = await fetch(`${endpoint}?${params.toString()}`, {
        credentials: "include",
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || `Request failed (${res.status})`);
      }

      if (!result.data || result.data.length === 0) {
        showToast("No Data Found", "Try adjusting the date range or filters.", "error");
        return;
      }

      const { utils, writeFile } = await import("xlsx");
      const wb = utils.book_new();
      const ws = utils.json_to_sheet(result.data);

      // Width off the widest of the header and the first 200 values, so wide audit sheets
      // stay readable without hand-resizing every column.
      const cols = Object.keys(result.data[0] || {});
      const sample = result.data.slice(0, 200);
      ws["!cols"] = cols.map((k) => {
        const widest = sample.reduce(
          (max, row) => Math.max(max, String(row[k] ?? "").length),
          k.length,
        );
        return { wch: Math.min(Math.max(widest + 2, 12), 45) };
      });

      // Audit sheets are meant to be sliced — turn on the filter row.
      if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };

      // Money columns render as ₹ with Indian grouping instead of bare numbers.
      const moneyCols = cols.filter((k) => MONEY_COL_RE.test(k));
      moneyCols.forEach((k) => {
        const idx = cols.indexOf(k);
        if (idx === -1) return;
        const colLetter = utils.encode_col(idx);
        for (let r = 0; r < result.data.length; r++) {
          const cell = ws[`${colLetter}${r + 2}`];
          if (cell && cell.t === "n") cell.z = INR_FORMAT;
        }
      });

      utils.book_append_sheet(wb, ws, "Report");

      // For the payables statement, summarise the obligation lines only — the payment
      // lines are detail beneath them and would double-count.
      const payableLines =
        report.type === "payables-all"
          ? result.data.filter((r) => r.Row === "Payable")
          : [];
      const sum = (key) => payableLines.reduce((s, r) => s + (Number(r[key]) || 0), 0);

      const meta = [
        { Field: "Report Name", Value: report.name },
        { Field: "Category", Value: report.category },
        { Field: "Date Range", Value: datePreset === "custom" ? `${customDates.from} — ${customDates.to}` : datePreset },
        { Field: "Branch Filter", Value: filters.branch || "All" },
        ...(report.filters.includes("payableType")
          ? [{ Field: "Payable Type", Value: filters.payableType ? payablePurposeLabel(filters.payableType) : "All types" }]
          : []),
        ...(payableLines.length
          ? [
              { Field: "Payables", Value: payableLines.length },
              { Field: "Total Amount", Value: sum("Total Amount") },
              { Field: "Paid", Value: sum("Paid") },
              { Field: "Pending", Value: sum("Pending") },
            ]
          : []),
        { Field: "Total Records", Value: result.data.length },
        { Field: "Generated At", Value: new Date().toLocaleString("en-IN") },
        ...(result.truncated
          ? [{
              Field: "⚠ Truncated",
              Value: `Capped at the ${result.docLimit} most recent records — narrow the date range for a complete export.`,
            }]
          : []),
      ];
      const metaWs = utils.json_to_sheet(meta);
      metaWs["!cols"] = [{ wch: 22 }, { wch: 46 }];
      meta.forEach((m, i) => {
        const cell = metaWs[`B${i + 2}`];
        if (cell && cell.t === "n" && MONEY_COL_RE.test(m.Field)) cell.z = INR_FORMAT;
      });
      utils.book_append_sheet(wb, metaWs, "Info");

      const fileName = `${report.name.replace(/\s+/g, "_")}_${new Date()
        .toISOString()
        .split("T")[0]}.xlsx`;

      writeFile(wb, fileName);

      if (result.truncated) {
        showToast(
          "Downloaded — but truncated",
          `${result.data.length} rows saved. Capped at the ${result.docLimit} most recent records; narrow the date range for a complete export.`,
          "error",
        );
      } else {
        showToast("Report Downloaded!", `${result.data.length} records saved as ${fileName}`);
      }
    } catch (err) {
      console.error(err);
      showToast("Download Failed", err.message, "error");
    } finally {
      setLoadingId(null);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts = {};
    CATEGORIES.forEach((cat) => {
      counts[cat] = cat === "All" ? REPORTS.length : REPORTS.filter((r) => r.category === cat).length;
    });
    return counts;
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50">

      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-linear-to-br from-amber-500 via-orange-500 to-red-500 flex items-center justify-center shadow-md">
                    <FileBarChart className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">Reports Center</h1>
                </div>
                <p className="text-sm text-gray-500 ml-12">
                  Generate and download {REPORTS.length} report & log types across all modules
                </p>
              </div>

              <div className="flex items-center gap-3 ml-12 sm:ml-0">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-semibold text-amber-700">{favorites.length} Favorited</span>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-xl border border-red-200 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <Filter className="w-4.5 h-4.5 text-amber-600" />
                  <span className="font-semibold text-gray-900 text-sm">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span>{showFilters ? "Hide" : "Show"} Advanced</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Date Range
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {DATE_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setDatePreset(p.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            datePreset === p.value
                              ? "bg-amber-500 text-white shadow-sm"
                              : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setDatePreset("custom")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          datePreset === "custom"
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Branch
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {BRANCHES.map((b) => (
                        <button
                          key={b}
                          onClick={() => setFilters((f) => ({ ...f, branch: b }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filters.branch === b
                              ? "bg-amber-500 text-white shadow-sm"
                              : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                      Search Reports
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or category..."
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {datePreset === "custom" && (
                  <div className="flex flex-wrap items-end gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <Calendar className="w-4 h-4 text-amber-600 self-center" />
                    <div>
                      <label className="block text-xs font-semibold text-amber-700 mb-1">From</label>
                      <input
                        type="date"
                        value={pendingCustom.from}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, from: e.target.value }))}
                        className="px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-700 mb-1">To</label>
                      <input
                        type="date"
                        value={pendingCustom.to}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, to: e.target.value }))}
                        min={pendingCustom.from}
                        className="px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <button
                      onClick={applyCustomDates}
                      disabled={!pendingCustom.from}
                      className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Apply
                    </button>
                    {customDates.from && (
                      <span className="text-xs text-amber-700 font-medium">
                        Active: {customDates.from} → {customDates.to || customDates.from}
                      </span>
                    )}
                  </div>
                )}

                {showFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Patient Status
                      </label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Statuses</option>
                        {PATIENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Technique
                      </label>
                      <select
                        value={filters.technique}
                        onChange={(e) => setFilters((f) => ({ ...f, technique: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Techniques</option>
                        {TECHNIQUES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Procedure
                      </label>
                      <select
                        value={filters.procedure}
                        onChange={(e) => setFilters((f) => ({ ...f, procedure: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Procedures</option>
                        {PROCEDURES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Payment Type
                      </label>
                      <select
                        value={filters.paymentType}
                        onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Payment Types</option>
                        {PAYMENT_TYPES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Payable Type
                      </label>
                      <select
                        value={filters.payableType}
                        onChange={(e) => setFilters((f) => ({ ...f, payableType: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      >
                        <option value="">All Payable Types</option>
                        {PAYABLE_PURPOSES.map((p) => (
                          <option key={p} value={p}>{payablePurposeLabel(p)}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-400">
                        Applies to the Payables Report — pick Rent for just the rent ledger.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    activeCategory === cat
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-white text-gray-600 border border-gray-200 hover:border-amber-300 hover:text-amber-700 shadow-sm"
                  }`}
                >
                  {cat}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      activeCategory === cat
                        ? "bg-white/25 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {categoryCounts[cat]}
                  </span>
                </button>
              ))}
            </div>

            {visibleReports.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
                <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No reports match your search.</p>
                <button
                  onClick={() => { setSearchTerm(""); setActiveCategory("All"); }}
                  className="mt-3 text-sm text-amber-600 hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500 font-medium">
                    Showing <span className="font-bold text-gray-900">{visibleReports.length}</span> reports
                    {searchTerm && ` for "${searchTerm}"`}
                  </p>
                  {loadingId && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating report...
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {visibleReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      filters={filters}
                      loadingId={loadingId}
                      favorites={favorites}
                      onDownload={handleDownload}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">
                Quick Reference — Report Coverage
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Patient Reports",   count: 7, color: "bg-blue-50 text-blue-700 border-blue-200",     icon: HeartPulse,  cat: "Patient Reports" },
                  { label: "Staff Reports",     count: 6, color: "bg-purple-50 text-purple-700 border-purple-200", icon: Users,       cat: "Staff Reports" },
                  { label: "Financial Reports", count: 13, color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: IndianRupee, cat: "Financial Reports" },
                  { label: "Inventory Reports", count: 2, color: "bg-orange-50 text-orange-700 border-orange-200",  icon: Package,     cat: "Inventory Reports" },
                  { label: "Audit Logs",        count: 4, color: "bg-red-50 text-red-700 border-red-200",           icon: ShieldAlert, cat: "Audit Logs" },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setActiveCategory(item.cat)}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${item.color} transition-all hover:shadow-sm`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <div className="text-left">
                      <p className="text-xs font-bold leading-none">{item.count} reports</p>
                      <p className="text-[10px] mt-0.5 opacity-80">{item.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
