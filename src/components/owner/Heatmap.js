import { Fragment } from "react";

function defaultColorFor(value, { min, max }) {
  if (value == null) return "var(--surface-2)";
  const range = max - min || 1;
  const t = Math.min(1, Math.max(0, (value - min) / range));
  
  const pct = Math.round(12 + t * 66);
  return `color-mix(in srgb, var(--info) ${pct}%, var(--surface))`;
}

export default function Heatmap({
  rows = [],
  cols = [],
  data = [],
  colorFor = defaultColorFor,
  formatValue = (v) => v,
  rowLabelWidth = 120,
}) {
  const flat = data.flat().filter((v) => v != null);
  const min = flat.length ? Math.min(...flat) : 0;
  const max = flat.length ? Math.max(...flat) : 1;

  return (
    <div
      className="heatmap"
      style={{ gridTemplateColumns: `${rowLabelWidth}px repeat(${cols.length}, minmax(44px, 1fr))` }}
    >
      <span />
      {cols.map((col, ci) => (
        <span className="heat-hour" key={`col-${ci}`}>
          {col}
        </span>
      ))}
      {rows.map((row, ri) => (
        <Fragment key={`row-${ri}`}>
          <span className="heat-label">{row}</span>
          {cols.map((_, ci) => {
            const value = data[ri]?.[ci];
            return (
              <span
                className="heat-cell"
                key={`cell-${ri}-${ci}`}
                style={{ background: colorFor(value, { min, max }) }}
                title={value != null ? String(value) : ""}
              >
                {value != null ? formatValue(value) : ""}
              </span>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
