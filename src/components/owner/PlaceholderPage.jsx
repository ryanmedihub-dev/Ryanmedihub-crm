import OwnerPage from "./OwnerPage";
import ComingSoon from "./ComingSoon";

export default function PlaceholderPage({ title, subtitle, part, icon = "🧭", message }) {
  return (
    <OwnerPage title={title} subtitle={subtitle || (part ? `Delivered in ${part}` : "Not yet available")}>
      <ComingSoon
        icon={icon}
        title={part ? `Coming in ${part}` : "Coming soon"}
        message={message}
      />
    </OwnerPage>
  );
}
