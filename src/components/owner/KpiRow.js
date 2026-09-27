import { KpiSkeleton } from "./Skeleton";
import CountUp from "./ai/CountUp";
import { ChevronRight } from "lucide-react";

function KpiCard({ item, isLead, index }) {
  const isClickable = !!item.onDrill;
  const Tag = isClickable ? "button" : "div";

  return (
    <Tag
      type={isClickable ? "button" : undefined}
      onClick={item.onDrill}
      aria-expanded={item.drillOpen ? true : undefined}
      className={`kpi ai-kpi-in${isLead ? " kpi-lead" : ""}`}
      style={{ "--ai-stagger-i": index }}
    >
      <span className="label">{item.label}</span>
      <span className="value">{item.rawValue != null ? <CountUp value={item.rawValue} format={item.format} /> : item.value}</span>
      {item.sub != null && <span className={`sub${item.kind ? ` ${item.kind}` : ""}`}>{item.sub}</span>}
      {isClickable && (
        <span className="drill-hint">
          {item.drillOpen ? "Hide details" : "View details"} <ChevronRight size={12} aria-hidden="true" />
        </span>
      )}
    </Tag>
  );
}

export default function KpiRow({ items = [], primaryIndex = 0, loading = false }) {
  if (loading) return <KpiSkeleton support={Math.max(1, (items.length || 5) - 1)} />;

  const hasLead = Number.isInteger(primaryIndex) && primaryIndex >= 0 && primaryIndex < items.length;
  const support = items.map((item, i) => (hasLead && i === primaryIndex ? null : <KpiCard key={item.label ?? i} item={item} index={i} />));

  
  
  if (!hasLead) return <div className="kpi-support">{support}</div>;

  return (
    <div className="kpi-band">
      <KpiCard item={items[primaryIndex]} isLead index={0} />
      <div className="kpi-support">{support}</div>
    </div>
  );
}
