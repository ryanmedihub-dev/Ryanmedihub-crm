const DOT_COLOR = {
  good: "green",
  warn: "orange",
  bad: "red",
  info: "blue",
  purple: "purple",
  neutral: "gray",
};

const GLYPH = {
  good: "●", 
  warn: "▲", 
  bad: "▲", 
  info: "●",
  purple: "●",
  neutral: "○", 
};

export default function Badge({ kind = "neutral", dot = false, glyph = false, children }) {
  return (
    <span className={`badge ${kind}`}>
      {dot && <span className={`dot ${DOT_COLOR[kind] || "gray"}`} />}
      {glyph && !dot && <span className="badge-glyph" aria-hidden="true">{GLYPH[kind] || GLYPH.neutral}</span>}
      {children}
    </span>
  );
}
