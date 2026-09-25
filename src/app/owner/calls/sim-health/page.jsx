import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar } from "@/components/owner";
import AiOrb from "@/components/owner/ai/AiOrb";

// No AI call here — there is nothing real to analyse yet (see the honest line
// below), so nothing is faked. Restyled per Part 5 as "AI module coming
// online" instead of the shared generic ComingSoon block.
export default function SimHealthPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Phone & SIM Health" subtitle="Not yet available" />
        <div className="content">
          <div className="coming-soon">
            <div className="coming-soon-inner">
              <AiOrb state="idle" size={64} />
              <span className="cs-tag">AI module coming online</span>
              <h2>Phone &amp; SIM health analysis isn't connected to a data source yet</h2>
              <p>This screen needs per-SIM signal, balance and block status uploaded from the CallTrack app to the backend. Until that feed exists, there's nothing real to show — and a fabricated dashboard, AI or otherwise, would be worse than none.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
