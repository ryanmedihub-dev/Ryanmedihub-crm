import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import ComingSoon from "./ComingSoon";

// A route that exists so the nav has somewhere to land, but whose real content is
// delivered by a later part of the Owner Panel v2 series.
//
//   <PlaceholderPage title="Counsellors" part="Part 1" icon="❝"
//     message="Counsellor roster with conversion + revenue, built in Part 1." />

export default function PlaceholderPage({ title, subtitle, part, icon = "🧭", message }) {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title={title} subtitle={subtitle || (part ? `Delivered in ${part}` : "Not yet available")} />
        <div className="content">
          <ComingSoon
            icon={icon}
            title={part ? `Coming in ${part}` : "Coming soon"}
            message={message}
          />
        </div>
      </div>
    </div>
  );
}
