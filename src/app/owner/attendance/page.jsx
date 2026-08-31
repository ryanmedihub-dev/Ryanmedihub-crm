import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function AttendancePage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Productivity Attendance" subtitle="Not yet available" />
        <div className="content">
          <ComingSoon
            icon="◷"
            title="No attendance data to report on"
            message="Shift-level attendance and active-session tracking need an attendance / session model in the backend. That model doesn't exist yet, so there are no clock-ins, breaks or idle-time figures to surface here."
          />
        </div>
      </div>
    </div>
  );
}
