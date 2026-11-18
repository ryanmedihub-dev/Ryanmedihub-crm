"use client";

import { useState, useMemo } from "react";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";
import ReportCard from "@/app/admin/reports/ReportCard";
import { buttonClass, inputClass } from "@/components/ui";
import { ALL_BRANCHES } from "@/lib/branches";
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
  Megaphone,
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
  UserX,
} from "lucide-react";

const BRANCHES = ["All", ...ALL_BRANCHES];

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

const HR_STATUSES = [
  "Applied", "Interview Scheduled", "Selected", "Rejected", "On Hold",
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
    description: "Every surgery detail — full surgical team, technique, grafts, donor condition, location, aftercare (headwash/bandage/PRP), medical readiness, and payments",
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
    description: "Complete employee list with role, branch, contact details, and patient count",
    icon: Users, color: "blue",
    filters: ["branch"],
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
    icon: PieChart, color: "purple",
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
    id: 22, type: "leads-all", category: "Leads Reports",
    name: "All Leads Report",
    description: "Complete leads data — tag, location, visit plan, remarks, and creation date",
    icon: Megaphone, color: "pink",
    filters: [],
  },

  {
    id: 30, type: "transaction-changes-log", category: "Audit Logs",
    name: "Transaction Changes Log",
    description: "Full audit trail of transaction edits — field-by-field changes, previous & new values, and editor details",
    icon: History, color: "blue",
    filters: ["branch"],
    apiPath: "/api/super-admin/logs",
  },
  {
    id: 31, type: "stock-changes-log", category: "Audit Logs",
    name: "Stock Changes Log",
    description: "Complete history of stock item edits — quantity, price, expiry changes with timestamps and editor info",
    icon: Package, color: "orange",
    filters: ["branch"],
    apiPath: "/api/super-admin/logs",
  },
  {
    id: 32, type: "patient-changes-log", category: "Audit Logs",
    name: "Patient Changes Log",
    description: "All patient record modifications — created and updated events with who made changes and when",
    icon: ShieldAlert, color: "purple",
    filters: ["branch"],
    apiPath: "/api/super-admin/logs",
  },

  {
    id: 23, type: "hr-interviews-all", category: "HR Reports",
    name: "All Candidates Report",
    description: "Complete interview list — position, status, experience, salary details, and evaluation scores",
    icon: Users, color: "blue",
    filters: ["hrStatus"],
  },
  {
    id: 24, type: "hr-selected", category: "HR Reports",
    name: "Selected Candidates",
    description: "All selected candidates with final salary, position, experience, and HR comments",
    icon: CheckCircle2, color: "green",
    filters: [],
  },
  {
    id: 25, type: "hr-rejected", category: "HR Reports",
    name: "Rejected Candidates",
    description: "Rejected candidates with evaluation scores and reason for rejection",
    icon: Users, color: "red",
    filters: [],
  },
  {
    id: 26, type: "hr-position-wise", category: "HR Reports",
    name: "Position-wise Summary",
    description: "Candidate count, selection rate, and average salary per position applied",
    icon: BarChart2, color: "purple",
    filters: [],
  },
  {
    id: 27, type: "hr-evaluation-scores", category: "HR Reports",
    name: "Evaluation Scores Report",
    description: "Candidate ratings — communication, technical, personality, motivation, stability",
    icon: TrendingUp, color: "indigo",
    filters: ["hrStatus"],
  },
  {
    id: 28, type: "hr-salary-analysis", category: "HR Reports",
    name: "Salary Analysis Report",
    description: "Previous vs expected vs final salary comparison across all candidates",
    icon: IndianRupee, color: "amber",
    filters: [],
  },
];

const CATEGORIES = ["All", ...new Set(REPORTS.map((r) => r.category))];


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
    return { from: custom.from, to: custom.to || custom.from };
  }
  return { from: null, to: null };
}

function PieChart(props) { return <BarChart2 {...props} />; }


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
      <button aria-label="Close"
        onClick={onDismiss}
        className="p-1 rounded-lg hover:bg-black/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function SuperAdminReportsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sa_favoriteReports") || "[]"); }
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
    hrStatus: "",
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
    try { localStorage.setItem("sa_favoriteReports", JSON.stringify(next)); } catch {}
  };

  const clearFilters = () => {
    setDatePreset("last30");
    setCustomDates({ from: "", to: "" });
    setPendingCustom({ from: "", to: "" });
    setFilters({ branch: "All", status: "", technique: "", staff: "", procedure: "", paymentType: "", hrStatus: "" });
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
    filters.hrStatus,
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
        if (filters.hrStatus) params.append("hrStatus", filters.hrStatus);
      }

      const endpoint = report.apiPath || "/api/super-admin/reports";
      const res = await fetch(`${endpoint}?${params.toString()}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || `Request failed (${res.status})`);
      }

      if (!result.data || result.data.length === 0) {
        showToast(
          "No Data Found",
          "Try adjusting the date range or filters.",
          "error"
        );
        return;
      }

      const { utils, writeFile } = await import("xlsx");
      const wb = utils.book_new();
      const ws = utils.json_to_sheet(result.data);

      const cols = Object.keys(result.data[0] || {});
      ws["!cols"] = cols.map((k) => ({
        wch: Math.min(Math.max(k.length + 2, 12), 40),
      }));

      utils.book_append_sheet(wb, ws, "Report");

      const meta = [
        { Field: "Report Name", Value: report.name },
        { Field: "Category", Value: report.category },
        { Field: "Date Range", Value: datePreset === "custom" ? `${customDates.from} — ${customDates.to}` : datePreset },
        { Field: "Branch Filter", Value: filters.branch || "All" },
        { Field: "Total Records", Value: result.data.length },
        { Field: "Generated At", Value: new Date().toLocaleString("en-IN") },
      ];
      const metaWs = utils.json_to_sheet(meta);
      metaWs["!cols"] = [{ wch: 20 }, { wch: 40 }];
      utils.book_append_sheet(wb, metaWs, "Info");

      const fileName = `${report.name.replace(/\s+/g, "_")}_${new Date()
        .toISOString()
        .split("T")[0]}.xlsx`;

      writeFile(wb, fileName);

      showToast(
        "Report Downloaded!",
        `${result.data.length} records saved as ${fileName}`
      );
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
      <SuperAdminSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="flex-1 overflow-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-semibold tracking-tight text-gray-900">Reports</h1>
                </div>
                <p className="text-sm text-gray-500">
                  {REPORTS.length} Excel exports across patients, staff, finance, inventory and audit logs
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" aria-hidden />
                  {favorites.length} favorited
                </span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className={buttonClass("ghost", "sm")}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center h-5 px-1.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                  className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <span>{showFilters ? "Fewer" : "More"} filters</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)] gap-4 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Date Range
                    </label>
                    <div role="group" aria-label="Date range" className="inline-flex flex-wrap p-0.5 rounded-lg border border-gray-200 bg-gray-50">
                      {DATE_PRESETS.filter((p) => p.value !== "custom").map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setDatePreset(p.value)}
                          aria-pressed={datePreset === p.value}
                          className={`h-8 px-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors duration-150 ${
                            datePreset === p.value
                              ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setDatePreset("custom")}
                        aria-pressed={datePreset === "custom"}
                        className={`h-8 px-2.5 rounded-md text-[13px] whitespace-nowrap transition-colors duration-150 ${
                          datePreset === "custom"
                            ? "bg-white text-gray-900 font-medium shadow-xs ring-1 ring-gray-200"
                            : "text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="rp-branch" className="block text-xs font-medium text-gray-600 mb-1.5">
                      Branch
                    </label>
                    <select
                      id="rp-branch"
                      value={filters.branch}
                      onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}
                      className={inputClass(false, "pr-8")}
                    >
                      {BRANCHES.map((b) => (
                        <option key={b} value={b}>{b === "All" ? "All branches" : b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rp-search" className="block text-xs font-medium text-gray-600 mb-1.5">
                      Search
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="rp-search"
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Report name or category…"
                        className={inputClass(false, "pl-9 pr-8")}
                      />
                      {searchTerm && (
                        <button aria-label="Clear search"
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
                  <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">From</label>
                      <input
                        type="date"
                        value={pendingCustom.from}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, from: e.target.value }))}
                        className={inputClass(false, "w-auto")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
                      <input
                        type="date"
                        value={pendingCustom.to}
                        onChange={(e) => setPendingCustom((p) => ({ ...p, to: e.target.value }))}
                        min={pendingCustom.from}
                        className={inputClass(false, "w-auto")}
                      />
                    </div>
                    <button
                      onClick={applyCustomDates}
                      disabled={!pendingCustom.from}
                      className={buttonClass("primary")}
                    >
                      Apply
                    </button>
                    {customDates.from && (
                      <span className="text-xs text-gray-600 font-medium tabular-nums">
                        Active: {customDates.from} → {customDates.to || customDates.from}
                      </span>
                    )}
                  </div>
                )}

                {showFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-1 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Patient Status
                      </label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Statuses</option>
                        {PATIENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Technique
                      </label>
                      <select
                        value={filters.technique}
                        onChange={(e) => setFilters((f) => ({ ...f, technique: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Techniques</option>
                        {TECHNIQUES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Procedure
                      </label>
                      <select
                        value={filters.procedure}
                        onChange={(e) => setFilters((f) => ({ ...f, procedure: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Procedures</option>
                        {PROCEDURES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Payment Type
                      </label>
                      <select
                        value={filters.paymentType}
                        onChange={(e) => setFilters((f) => ({ ...f, paymentType: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Payment Types</option>
                        {PAYMENT_TYPES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        HR Candidate Status
                      </label>
                      <select
                        value={filters.hrStatus}
                        onChange={(e) => setFilters((f) => ({ ...f, hrStatus: e.target.value }))}
                        className={inputClass(false, "pr-8")}
                      >
                        <option value="">All Statuses</option>
                        {HR_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div role="tablist" aria-label="Report category" className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-gray-200">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  role="tab"
                  aria-selected={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`-mb-px flex items-center gap-2 h-10 px-3 border-b-2 text-sm whitespace-nowrap transition-colors duration-150 ${
                    activeCategory === cat
                      ? "border-indigo-600 text-gray-900 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  {cat}
                  <span
                    className={`text-xs tabular-nums ${
                      activeCategory === cat ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {categoryCounts[cat]}
                  </span>
                </button>
              ))}
            </div>

            {visibleReports.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-14 px-6 text-center">
                <Search className="w-5 h-5 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-900">No reports match your search</p>
                <button
                  onClick={() => { setSearchTerm(""); setActiveCategory("All"); }}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-gray-500">
                    <span className="font-medium text-gray-900 tabular-nums">{visibleReports.length}</span> reports
                    {searchTerm && ` for "${searchTerm}"`}
                  </p>
                  {loadingId && (
                    <div className="flex items-center gap-2 text-[13px] text-gray-600" role="status">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating report…
                    </div>
                  )}
                </div>

                <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
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
                </ul>
              </>
            )}


          </div>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
