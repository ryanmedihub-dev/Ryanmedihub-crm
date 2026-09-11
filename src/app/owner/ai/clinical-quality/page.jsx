import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function ClinicalAiQualityPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Clinical AI Quality" subtitle="Not yet available" />
        <div className="content">
          <ComingSoon
            icon="⬡"
            title="Being built separately"
            message="The clinical AI quality review — graft-count checks, technique consistency, photo-vs-plan matching — is under development in its own workstream. It will land here once that model and its scoring are ready."
          />
        </div>
      </div>
    </div>
  );
}
