import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import OwnerTopbar from "./OwnerTopbar";
import ComingSoon from "./ComingSoon";

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
