import StaffTable from "@/components/StaffTable";

const CONFIG = {
  addEmployeePath: "/admin/employees/add-employee",
  editBasePath:    "/admin/employees/update",
  viewBasePath:    "/admin/employees",
  canDelete:       true,
  
  
  financeColumns:  true,
};

export default function AdminEmployeesPage() {
  return <StaffTable config={CONFIG} />;
}
