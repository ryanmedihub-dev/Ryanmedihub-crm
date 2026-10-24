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
      className={`kpi ai-kpi-in${isLead ? " kpi-lead" : ""}${isClickable ? " kpi-clickable" : ""}`}
      style={{ "--ai-stagger-i": index }}
    >
      <div className="kpi-top">
        <span className="label">{item.label}</span>
      </div>
      <div className="kpi-mid">
        <span className="value">
          {item.rawValue != null ? <CountUp value={item.rawValue} format={item.format} /> : item.value}
        </span>
      </div>
      {item.sub != null && item.sub !== "" && (
        <div className="kpi-bottom">
          <span className={`sub${item.kind ? ` ${item.kind}` : ""}`}>{item.sub}</span>
        </div>
      )}
      {isClickable && (
        <span className="drill-hint">
          {item.drillOpen ? "Hide details" : "View details"} <ChevronRight size={12} aria-hidden="true" />
        </span>
      )}
    </Tag>
  );
}

export default function KpiRow({ items = [], primaryIndex = null, balanced = true, loading = false }) {
  const isBalanced = balanced && primaryIndex == null;

  if (loading) {
    return <KpiSkeleton count={items.length || 6} balanced={isBalanced} />;
  }

  if (isBalanced) {
    return (
      <div className="kpi-grid">
        {items.map((item, i) => (
          <KpiCard key={item.label ?? i} item={item} index={i} />
        ))}
      </div>
    );
  }

  const hasLead = Number.isInteger(primaryIndex) && primaryIndex >= 0 && primaryIndex < items.length;
  const support = items.map((item, i) =>
    hasLead && i === primaryIndex ? null : <KpiCard key={item.label ?? i} item={item} index={i} />
  );

  if (!hasLead) return <div className="kpi-support">{support}</div>;

  return (
    <div className="kpi-band">
      <KpiCard item={items[primaryIndex]} isLead index={0} />
      <div className="kpi-support">{support}</div>
    </div>
  );
}
