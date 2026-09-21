import {
  FileText,
  Users,
  IndianRupee,
  Activity,
  TrendingUp,
  BarChart2,
  Package,
  Briefcase,
  Stethoscope,
  HeartPulse,
  ClipboardList,
  AlertCircle,
  ShieldAlert,
  History,
  RefreshCw,
} from "lucide-react";
import { ALL_BRANCHES } from "@/lib/branches";

export const BRANCHES = ["All", ...ALL_BRANCHES];

export const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "last7" },
  { label: "Last 30 Days", value: "last30" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "All Time", value: "allTime" },
  { label: "Custom", value: "custom" },
];

export const TECHNIQUES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant", "PRP",
  "Alopecia", "Headwash", "GFC", "Other",
];

export const PROCEDURES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant",
  "PRP", "GFC", "Medicine", "Other",
];

export const PAYMENT_TYPES = ["Booking", "Pending", "Full-payment", "Other"];

export const PATIENT_STATUSES = [
  "NEW", "NOT_VISITED", "NOT_CONVERTED", "CONSULTED",
  "SURGERY_BOOKED", "BOOKING_DONE", "CLOSED",
];

export const COLOR_MAP = {
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

export const REPORTS = [
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

export const CATEGORIES = ["All", ...new Set(REPORTS.map((r) => r.category))];
