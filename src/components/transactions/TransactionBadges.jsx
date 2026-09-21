import { X } from "lucide-react";
import { METHOD_LABELS } from "@/constants/paymentMethods";
import { ENTRY_TYPES, ENTRY_TYPE_TONE_CLASSES } from "@/constants/entryTypes";
import { getCategoryStyle, getMethodStyle } from "./transactionsHelpers";

export function SectionLabel({ children }) {
  return (
    <p className="text-[17px] font-bold uppercase tracking-wider text-slate-400">
      {children}
    </p>
  );
}

export function CategoryBadge({ category }) {
  if (!category) return null;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md border text-[11px] font-bold ${getCategoryStyle(
        category
      )}`}
    >
      {category}
    </span>
  );
}

export function MethodBadge({ method }) {
  if (!method) return null;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold ${getMethodStyle(
        method
      )}`}
    >
      {METHOD_LABELS[method] || method}
    </span>
  );
}

export function EntryBadge({ row }) {
  const type = ENTRY_TYPES[row.entryType];

  if (!type || row.entryType === "REGULAR") return null;

  const tone =
    ENTRY_TYPE_TONE_CLASSES[type.tone] ||
    ENTRY_TYPE_TONE_CLASSES.gray;

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md border text-[10px] font-bold ${tone}`}
    >
      {type.label}
    </span>
  );
}

export function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-white border border-indigo-100 text-indigo-700 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm">
      {label}

      <button
        type="button"
        onClick={onRemove}
        className="text-indigo-400 hover:text-indigo-700"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
