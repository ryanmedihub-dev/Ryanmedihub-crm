

const GLYPH = { 4: "▲" };

export default function AttentionRamp({ level = 0, label, showLabel = true }) {
  const lvl = Math.max(0, Math.min(4, Math.round(level)));
  return (
    <span className="ramp" data-level={lvl}>
      <span className="ramp-bars" aria-hidden="true">
        <span className="ramp-seg" />
        <span className="ramp-seg" />
        <span className="ramp-seg" />
        <span className="ramp-seg" />
      </span>
      {GLYPH[lvl] && <span className="ramp-glyph" aria-hidden="true">{GLYPH[lvl]}</span>}
      {showLabel && label != null && <span className="ramp-label">{label}</span>}
      <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        severity {lvl} of 4{label ? `, ${label}` : ""}
      </span>
    </span>
  );
}

export function priorityToLevel(priority) {
  const map = { P0: 4, P1: 3, P2: 2, P3: 1, P4: 1 };
  return map[priority] ?? 0;
}
