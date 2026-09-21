import { AlertCircle, CheckCircle2, X } from "lucide-react";

export default function Toast({ toast, onDismiss }) {
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
