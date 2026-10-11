import Link from "next/link";

/**
 * The card grid every section landing uses to link into its own pages.
 * `items`: `{ href, label, note?, ready? }`. `ready: false` marks a page that
 * exists but has no data source yet.
 */
export default function SectionLinks({ items = [] }) {
  return (
    <div className="link-grid">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="link-card">
          <div className="link-card-text">
            <h3>{it.label}</h3>
            {it.note && <p>{it.note}</p>}
          </div>
          <span className={`link-card-cue${it.ready === false ? " muted" : ""}`} aria-hidden="true">
            {it.ready === false ? "soon" : "›"}
          </span>
        </Link>
      ))}
    </div>
  );
}
