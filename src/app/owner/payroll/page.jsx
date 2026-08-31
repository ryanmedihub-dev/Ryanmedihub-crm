import OwnerSidebar from "@/components/Sidebars/OwnerSidebar";
import { OwnerTopbar, ComingSoon } from "@/components/owner";

export default function PayrollPage() {
  return (
    <div className="app">
      <OwnerSidebar />
      <div className="main">
        <OwnerTopbar title="Incentives & Payroll" subtitle="Not yet available" />
        <div className="content">
          <ComingSoon
            icon="₹"
            title="No payroll engine yet"
            message="Base salary and incentive rate are stored per employee (see All Staff 360°), but there's no engine that runs a pay cycle, applies incentive rules and produces payslips. That's what this screen needs before it can show anything."
          />
        </div>
      </div>
    </div>
  );
}
