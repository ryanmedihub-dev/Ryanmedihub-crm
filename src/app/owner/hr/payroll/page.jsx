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
            message="What exists today — per-employee salary and incentive due / paid / pending for a period, with branch, operating-unit, role and month rollups from the SALARY payables — is on Finance › Salary & Incentive (/owner/finance/salary-incentive). What does not exist is a pay-run engine: a pay cycle, incentive rules applied to targets, and payslips. Until that is built this screen stays a placeholder rather than a second copy of the salary page."
          />
        </div>
      </div>
    </div>
  );
}
