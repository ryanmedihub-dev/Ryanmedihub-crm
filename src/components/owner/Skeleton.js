export default function Skeleton({ variant, width, height, style, className = "", count = 1 }) {
  const base = `skeleton${variant ? ` skeleton-${variant}` : ""}${className ? ` ${className}` : ""}`;
  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={base} style={{ width, height, ...style }} />
        ))}
      </>
    );
  }
  return <div className={base} style={{ width, height, ...style }} />;
}

// KPI band placeholder that matches the lead + support layout.
export function KpiSkeleton({ support = 4 }) {
  return (
    <div className="kpi-band">
      <div className="skeleton skeleton-kpi lead" />
      <div className="kpi-support">
        {Array.from({ length: support }).map((_, i) => (
          <div key={i} className="skeleton skeleton-kpi" />
        ))}
      </div>
    </div>
  );
}

// A block of fake table rows to drop inside a .table-wrap while loading.
export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="table-wrap">
      <div style={{ padding: "4px 0" }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    </div>
  );
}
