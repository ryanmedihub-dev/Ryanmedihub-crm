import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function HrActionsPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="HR Action Center" subtitle="Not yet available" />
        <div className="content">
          <ComingSoon
            icon="▣"
            title="No HR action tracking yet"
            message="Warnings, PIPs, promotions and exit workflows need an HR action-tracking system to record and follow them. Until that exists there's no case history to list or act on here."
          />
        </div>
      </div>
    </div>
  );
}
