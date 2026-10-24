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

export function KpiSkeleton({ count = 6, balanced = true }) {
  if (balanced) {
    return (
      <div className="kpi-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton skeleton-kpi" style={{ minHeight: 96 }} />
        ))}
      </div>
    );
  }
  return (
    <div className="kpi-band">
      <div className="skeleton skeleton-kpi lead" />
      <div className="kpi-support">
        {Array.from({ length: Math.max(1, count - 1) }).map((_, i) => (
          <div key={i} className="skeleton skeleton-kpi" />
        ))}
      </div>
    </div>
  );
}

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
