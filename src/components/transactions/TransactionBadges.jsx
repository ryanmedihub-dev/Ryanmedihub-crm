import { X } from "lucide-react";
import { METHOD_LABELS } from "@/constants/paymentMethods";
import { ENTRY_TYPES, ENTRY_TYPE_TONE_CLASSES } from "@/constants/entryTypes";

export function SectionLabel({ children }) {
  return (
    <p className="text-xs font-medium text-slate-500">
      {children}
    </p>
  );
}

export function CategoryBadge({ category }) {
  if (!category) return null;

  return (
    <span
      className="inline-flex items-center h-5 px-2 rounded-md bg-gray-100 text-xs font-medium text-gray-700 whitespace-nowrap"
    >
      {String(category).charAt(0) + String(category).slice(1).toLowerCase()}
    </span>
  );
}

export function MethodBadge({ method }) {
  if (!method) return null;

  return (
    <span
      className="inline-flex items-center h-5 px-2 rounded-md border border-gray-200 text-xs text-gray-600 whitespace-nowrap"
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
      className={`inline-flex items-center h-5 px-2 rounded-md border text-xs font-medium ${tone}`}
    >
      {type.label}
    </span>
  );
}

export function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 pl-2 pr-1 bg-white border border-gray-200 text-gray-700 rounded-md text-xs font-medium">
      {label}

      <button aria-label="Close"
        type="button"
        onClick={onRemove}
        className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
