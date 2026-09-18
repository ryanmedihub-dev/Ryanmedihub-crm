import React from "react";
import { KpiSkeleton } from "./Skeleton";
// Assuming you have an icon library like lucide-react installed
import { TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";

// Helper for trend styling and icons
const getTrendConfig = (kind) => {
  switch (kind) {
    case "good":
      return { colors: "text-emerald-700 bg-emerald-50", Icon: TrendingUp };
    case "bad":
      return { colors: "text-rose-700 bg-rose-50", Icon: TrendingDown };
    default:
      return { colors: "text-slate-600 bg-slate-100", Icon: Minus };
  }
};

function KpiCard({ item, isLead }) {
  const isClickable = !!item.onDrill;
  const CardWrapper = isClickable ? "button" : "div";
  const { colors: trendColors, Icon: TrendIcon } = getTrendConfig(item.kind);

  return (
    <CardWrapper
      type={isClickable ? "button" : undefined}
      onClick={item.onDrill}
      aria-expanded={item.drillOpen ? true : undefined}
      className={`
        relative flex flex-col justify-between p-5 rounded-2xl border text-left transition-all duration-200
        ${isClickable ? "hover:shadow-lg hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer group" : ""}
        ${isLead 
          ? "bg-gradient-to-br from-blue-50 to-white border-blue-100 shadow-sm md:col-span-2" 
          : "bg-white border-slate-200 shadow-sm"}
      `}
    >
      <div className="flex justify-between items-start gap-4">
        <span className="text-sm font-medium text-slate-500 tracking-tight">
          {item.label}
        </span>
        
        {/* Drill-down hint icon */}
        {isClickable && (
          <ChevronRight 
            className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" 
            aria-hidden="true" 
          />
        )}
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <span className={`font-semibold text-slate-900 ${isLead ? "text-4xl" : "text-3xl"}`}>
          {item.value}
        </span>
      </div>

      {item.sub != null && (
        <div className="mt-4 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${trendColors}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            {item.sub}
          </span>
          <span className="text-xs text-slate-400">vs last period</span>
        </div>
      )}
    </CardWrapper>
  );
}

export default function KpiRow({ items = [], primaryIndex = 0, loading = false }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSkeleton support={Math.max(1, (items.length || 5) - 1)} />
      </div>
    );
  }

  const hasLead =
    Number.isInteger(primaryIndex) &&
    primaryIndex >= 0 &&
    primaryIndex < items.length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {hasLead && (
        <KpiCard item={items[primaryIndex]} isLead={true} />
      )}
      
      {items.map((item, i) => {
        // Skip the lead item as it's already rendered
        if (hasLead && i === primaryIndex) return null;
        return <KpiCard key={item.label ?? i} item={item} isLead={false} />;
      })}
    </div>
  );
}