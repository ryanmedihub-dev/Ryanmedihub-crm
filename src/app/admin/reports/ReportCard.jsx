import { Download, Loader2, Star } from "lucide-react";
import { payablePurposeLabel } from "@/constants/payablePurposes";
import { buttonClass } from "@/components/ui";

/*
 * One report as a list row: name + what's inside on the left, the filters it will
 * apply and the download on the right. Rows scan faster than a wall of cards and
 * keep the download in the same place for every report.
 */
export default function ReportCard({ report, filters, loadingId, favorites, onDownload, onToggleFavorite }) {
  const Icon = report.icon;
  const isLoading = loadingId === report.id;
  const isFav = favorites.includes(report.id);

  const applied = [
    report.filters.includes("branch") && filters.branch && filters.branch !== "All" && filters.branch,
    report.filters.includes("status") && filters.status,
    report.filters.includes("technique") && filters.technique,
    report.filters.includes("procedure") && filters.procedure,
    report.filters.includes("paymentType") && filters.paymentType,
    report.filters.includes("payableType") && filters.payableType && payablePurposeLabel(filters.payableType),
  ].filter(Boolean);

  return (
    <li className="group flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5 transition-colors duration-150 hover:bg-gray-50/70">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-medium text-gray-900">{report.name}</h3>
            <span className="text-xs text-gray-400">{report.category}</span>
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-gray-500 line-clamp-2 max-w-3xl">{report.description}</p>
          {applied.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {applied.map((a) => (
                <span key={a} className="inline-flex items-center h-5 px-1.5 rounded bg-gray-100 text-[11px] font-medium text-gray-600">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 pl-11 sm:pl-0 shrink-0">
        <button
          onClick={() => onToggleFavorite(report.id)}
          className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
            isFav ? "text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
          }`}
          title={isFav ? "Remove from favorites" : "Add to favorites"}
          aria-label={isFav ? `Remove ${report.name} from favorites` : `Add ${report.name} to favorites`}
          aria-pressed={isFav}
          type="button"
        >
          <Star className={`h-4 w-4 ${isFav ? "fill-amber-400" : ""}`} />
        </button>
        <button
          onClick={() => onDownload(report)}
          disabled={isLoading}
          type="button"
          aria-label={`Download ${report.name} as Excel`}
          className={buttonClass("secondary", "sm", "min-w-[7.5rem] justify-center")}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-gray-500" />}
          {isLoading ? "Generating…" : "Download"}
        </button>
      </div>
    </li>
  );
}
