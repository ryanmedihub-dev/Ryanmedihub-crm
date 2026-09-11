import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function AiHealthPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="AI Health & Audit" subtitle="Not yet available" />
        <div className="content">
          <ComingSoon
            icon="◆"
            title="Nothing to audit yet"
            message="There's no production AI system running against live leads or calls right now. Once one is in place, this screen will track its uptime, decisions and error rate — until then there's no signal to audit."
          />
        </div>
      </div>
    </div>
  );
}
