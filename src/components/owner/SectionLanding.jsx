import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import AiBriefPanel from "./ai/AiBriefPanel";

export default function SectionLanding({ title, subtitle, part, items = [], feature }) {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title={title} subtitle={subtitle} />
        <div className="content">
          {feature && <AiBriefPanel feature={feature} scope={{}} title={title} compact />}
          {part && (
            <p className="muted" style={{ fontSize: "var(--fs-13)" }}>
              This section is being built in <strong>{part}</strong>. The pages below are placeholders
              until then.
            </p>
          )}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {items.map((it) => (
              <Link key={it.href} href={it.href} className="card section-landing-card" style={{ display: "block", textDecoration: "none" }}>
                <div className="card-title">
                  <div>
                    <h3>{it.label}</h3>
                    {it.note && <p>{it.note}</p>}
                  </div>
                  <span aria-hidden="true" style={{ color: it.ready ? "var(--accent)" : "var(--ink-muted)" }}>
                    {it.ready ? "›" : "soon"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
