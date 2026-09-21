import { Download, Loader2, Star } from "lucide-react";
import { payablePurposeLabel } from "@/constants/payablePurposes";
import { COLOR_MAP } from "./reportsConfig";

export default function ReportCard({ report, filters, loadingId, favorites, onDownload, onToggleFavorite }) {
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
