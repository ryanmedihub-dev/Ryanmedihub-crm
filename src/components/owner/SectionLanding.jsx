import Link from "next/link";
import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";

// Section landing / "dashboard page" for a top-level owner group (Owner Panel v2,
// F8). Parts 1–6 replace each of these with a real summary dashboard; until then
// it lists the section's children so the nav has somewhere to land.
//
//   <SectionLanding
//     title="Employees"
//     subtitle="Agents, counsellors, surgery, HR and leadership rollups"
//     part="Part 1"
//     items={[
//       { href: "/owner/employees/agents", label: "Agents", note: "Calls, leads, conversion, pay", ready: true },
//       { href: "/owner/employees/counsellors", label: "Counsellors", note: "Coming in Part 1" },
//     ]}
//   />

export default function SectionLanding({ title, subtitle, part, items = [] }) {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title={title} subtitle={subtitle} />
        <div className="content">
          {part && (
            <p className="muted" style={{ fontSize: "var(--fs-13)" }}>
              This section is being built in <strong>{part}</strong>. The pages below are placeholders
              until then.
            </p>
          )}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {items.map((it) => (
              <Link key={it.href} href={it.href} className="card" style={{ display: "block", textDecoration: "none" }}>
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
