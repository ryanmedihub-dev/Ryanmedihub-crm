import {
  LayoutGrid,
  User,
  Sparkles,
  Package,
  TrendingDown,
  Wallet,
  AlertCircle,
} from "lucide-react";

export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export const getTodayDate = () => isoDate(new Date());

export const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisMonth", label: "This Month" },
  { key: "all", label: "All Time" },
];

export const getPresetRange = (key) => {
  if (key === "yesterday") {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const v = isoDate(y);
    return { dateFrom: v, dateTo: v };
  }
  if (key === "thisMonth") {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: isoDate(first), dateTo: getTodayDate() };
  }
  if (key === "all") {
    return { dateFrom: "", dateTo: "" };
  }
  return { dateFrom: getTodayDate(), dateTo: getTodayDate() };
};

export const matchingPreset = (dateFrom, dateTo) => {
  const found = DATE_PRESETS.find((p) => {
    const r = getPresetRange(p.key);
    return (dateFrom || "") === r.dateFrom && (dateTo || "") === r.dateTo;
  });
  return found?.key || null;
};

export const calculateNetAmount = (transaction) =>
  Math.max(0, parseFloat(transaction?.amount) || 0);

export const formatDateForDisplay = (date) => {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatTime = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const getPatientName = (row) =>
  row.patient?.personal?.name ||
  row.patientName ||
  "Walk-in Customer";

export const getPatientPhone = (row) =>
  row.patient?.personal?.phone ||
  row.patientPhone ||
  "";

export const getMedicineName = (row) =>
  typeof row.medicineId === "object"
    ? row.medicineId?.name || "Medicine"
    : "Medicine";

export const getExpenseGiverName = (row) => {
  if (row.expenseGiver?.type === "VENDOR") {
    return typeof row.expenseGiver.vendorId === "object"
      ? row.expenseGiver.vendorId?.name ||
          row.expenseGiver.name ||
          "Vendor"
      : row.expenseGiver.name || "Vendor";
  }

  return row.expenseGiver?.name || "N/A";
};

export const parseList = (raw) =>
  raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

export const MULTI_FILTER_KEYS = [
  "branch",
  "paymentMethod",
  "procedure",
  "furtherMode",
  "expenseCategory",
  "expenseType",
  "entryType",
];

export const FILTER_KEYS = [
  "branch",
  "dateFrom",
  "dateTo",
  "paymentMethod",
  "procedure",
  "furtherMode",
  "expenseCategory",
  "expenseType",
  "entryType",
];

export const defaultFilters = () => ({
  branch: [],
  dateFrom: getTodayDate(),
  dateTo: getTodayDate(),
  paymentMethod: [],
  procedure: [],
  furtherMode: [],
  expenseCategory: [],
  expenseType: [],
  entryType: [],
});

export const filtersFromParams = (params) => ({
  branch: parseList(params.get("branch")),
  dateFrom: params.get("dateFrom") || getTodayDate(),
  dateTo: params.get("dateTo") || getTodayDate(),
  paymentMethod: parseList(params.get("paymentMethod")),
  procedure: parseList(params.get("procedure")),
  furtherMode: parseList(params.get("furtherMode")),
  expenseCategory: parseList(params.get("expenseCategory")),
  expenseType: parseList(params.get("expenseType")),
  entryType: parseList(params.get("entryType")),
});

export const filterEquals = (a, b) =>
  Array.isArray(a) || Array.isArray(b)
    ? (a || []).length === (b || []).length &&
      (a || []).every((v, i) => v === (b || [])[i])
    : a === b;

export const TRANSACTION_CATEGORIES = [
  {
    value: "ALL",
    label: "All",
    icon: LayoutGrid,
    tone: "slate",
  },
  {
    value: "TRANSPLANT",
    label: "Transplants",
    icon: User,
    tone: "indigo",
  },
  {
    value: "SERVICE",
    label: "Services",
    icon: Sparkles,
    tone: "pink",
  },
  {
    value: "MEDICINE",
    label: "Medicine",
    icon: Package,
    tone: "emerald",
  },
  {
    value: "EXPENSE",
    label: "Expenses",
    icon: TrendingDown,
    tone: "rose",
  },
  {
    value: "CONTRA",
    label: "Contra",
    icon: Wallet,
    tone: "violet",
  },
  {
    value: "SUSPENSE",
    label: "Suspense",
    icon: AlertCircle,
    tone: "amber",
  },
];

export const NON_TRANSACTION_TABS = ["CONTRA", "SUSPENSE"];

export const VALID_CATEGORIES = new Set(
  TRANSACTION_CATEGORIES.map((x) => x.value)
);

export const REVENUE_CATEGORIES = [
  "TRANSPLANT",
  "SERVICE",
  "MEDICINE",
];

export const TRANSPLANT_PROCEDURES = [
  "Sapphire FUE",
  "DHI",
  "Turkish DHI",
  "Beard Transplant",
];

export const SERVICE_PROCEDURES = [
  "PRP",
  "GFC",
  "Alopecia",
  "Headwash",
  "Canacot",
];

export const UNTRACKED_FURTHER_MODE = "__UNTRACKED__";

export const getCategoryStyle = (category) => {
  const styles = {
    TRANSPLANT:
      "bg-indigo-50 text-indigo-700 border-indigo-100",
    SERVICE:
      "bg-pink-50 text-pink-700 border-pink-100",
    MEDICINE:
      "bg-emerald-50 text-emerald-700 border-emerald-100",
    EXPENSE:
      "bg-rose-50 text-rose-700 border-rose-100",
    CONTRA:
      "bg-violet-50 text-violet-700 border-violet-100",
    SUSPENSE:
      "bg-amber-50 text-amber-700 border-amber-100",
  };

  return (
    styles[category] ||
    "bg-slate-50 text-slate-700 border-slate-100"
  );
};

export const getMethodStyle = (method) => {
  const styles = {
    cash: "bg-emerald-50 text-emerald-700",
    upi: "bg-blue-50 text-blue-700",
    card: "bg-purple-50 text-purple-700",
    banking: "bg-indigo-50 text-indigo-700",
    bajaj_loan: "bg-orange-50 text-orange-700",
    fibe_loan: "bg-orange-50 text-orange-700",
    hdfc_skin_bank_transfer: "bg-sky-50 text-sky-700",
    hdfc_ryan_medihub_bank_transfer:
      "bg-teal-50 text-teal-700",
    icici_medihub_bank_transfer:
      "bg-rose-50 text-rose-700",
  };

  return (
    styles[method?.toLowerCase()] ||
    "bg-slate-50 text-slate-700"
  );
};
