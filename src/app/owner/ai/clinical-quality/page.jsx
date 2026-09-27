import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar } from "@/components/owner";
import AiOrb from "@/components/owner/ai/AiOrb";

export default function ClinicalAiQualityPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Clinical AI Quality" subtitle="Not yet available" />
        <div className="content">
          <div className="coming-soon">
            <div className="coming-soon-inner">
              <AiOrb state="idle" size={64} />
              <span className="cs-tag">AI module coming online</span>
              <h2>Clinical AI quality review isn&apos;t connected to a data source yet</h2>
              <p>Graft-count checks, technique consistency and photo-vs-plan matching are under development in their own workstream, with their own model and scoring. It will land here once that&apos;s ready — a fabricated dashboard, AI or otherwise, would be worse than none.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
