import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function SimHealthPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Phone & SIM Health" subtitle="Not yet available" />
        <div className="content">
          <ComingSoon
            icon="▤"
            title="SIM health isn't wired up yet"
            message="This screen needs per-SIM signal, balance and block status uploaded from the CallTrack app to the backend. Until that feed exists, there's nothing real to show — and a fabricated dashboard would be worse than none."
          />
        </div>
      </div>
    </div>
  );
}
