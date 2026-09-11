
// The single currency formatter for the app. The owner panel's `rupee()` in
// src/lib/owner/format.js wraps this (adds rounding + a "—" for missing values) —
// extend one of these two, never add a third.
export const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString("en-IN")}`;

export const formatDate = (date) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const STATUS_STYLES = {
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
  "Partially Paid": "bg-amber-100 text-amber-700 border-amber-200",
  "Partially Received": "bg-amber-100 text-amber-700 border-amber-200",
  Paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Received: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Overdue: "bg-red-100 text-red-700 border-red-200",
  Cancelled: "bg-gray-100 text-gray-400 border-gray-200 line-through",
  OPEN: "bg-gray-100 text-gray-600 border-gray-200",
  SETTLED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-gray-100 text-gray-400 border-gray-200 line-through",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
        STATUS_STYLES[status] || "bg-gray-100 text-gray-600 border-gray-200"
      }`}
    >
      {status}
    </span>
  );
}
