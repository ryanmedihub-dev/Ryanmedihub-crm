import StaffTable from "@/components/StaffTable";

const CONFIG = {
  addEmployeePath: "/admin/employees/add-employee",
  editBasePath:    "/admin/employees/update",
  viewBasePath:    "/admin/employees",
  canDelete:       true,
  // Admin sees the payroll view — payable / paid split by salary and incentive — instead of
  // the patient and graft counts HR and super-admin keep.
  financeColumns:  true,
};

export default function AdminEmployeesPage() {
  return <StaffTable config={CONFIG} />;
}
