import { KpiSkeleton } from "./Skeleton";

function KpiCard({ item, lead }) {
  const subClass = item.sub != null
    ? `sub${item.kind && item.kind !== "good" ? ` ${item.kind}` : item.kind === "good" ? " good" : ""}`
    : "";

  const inner = (
    <>
      <div className="label">{item.label}</div>
      <div className="value">{item.value}</div>
      {item.sub != null && <div className={subClass}>{item.sub}</div>}
      {item.onDrill && (
        <span className="drill-hint" aria-hidden="true">▸ view rows</span>
      )}
    </>
  );

  const className = `kpi${lead ? " kpi-lead" : ""}`;

  if (item.onDrill) {
    return (
      <button
        type="button"
        className={className}
        onClick={item.onDrill}
        aria-expanded={item.drillOpen ? true : undefined}
      >
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

export default function KpiRow({ items = [], primaryIndex = 0, loading = false }) {
  if (loading) {
    return <KpiSkeleton support={Math.max(1, (items.length || 5) - 1)} />;
  }

  const hasLead =
    Number.isInteger(primaryIndex) &&
    primaryIndex >= 0 &&
    primaryIndex < items.length;

  if (!hasLead) {
    return (
      <div className="kpi-support">
        {items.map((item, i) => (
          <KpiCard key={item.label ?? i} item={item} />
        ))}
      </div>
    );
  }

  const lead = items[primaryIndex];
  const rest = items.filter((_, i) => i !== primaryIndex);

  return (
    <div className="kpi-band">
      <KpiCard item={lead} lead />
      <div className="kpi-support">
        {rest.map((item, i) => (
          <KpiCard key={item.label ?? i} item={item} />
        ))}
      </div>
    </div>
  );
}
