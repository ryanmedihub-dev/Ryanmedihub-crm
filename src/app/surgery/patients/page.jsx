import { Suspense } from "react";
import SurgerySidebar from "@/components/Sidebars/SurgerySidebar";
import PatientTable from "@/components/PatientTable";

const CONFIG = {
  basePath:        "/surgery/patients",
  title:           "Patients",
  subtitle:        "Manage and track patient records",
  columns:         ["name","phone","branch","visitDate","status","package","pending"],
  actions:         ["view","edit"],
  showCsvExport:   false,
  showAddButton:   true,
  addButtonHref:   "/surgery/add-patient",
  defaultPageSize: 10,
  pageSizeOptions: [10, 25, 50],
  enableSorting:   true,
  formatCurrency:  true,
  filters: {
    showSurgeryDate:     true,
    showSurgeryLocation: true,
    showVisited:         true,
    showReadyForSurgery: true,
    showDoctor:          true,
    showSeniorTech:      true,
    showImplanter:       true,
  },
};

export default function SurgeryPatientsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <SurgerySidebar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" /></div>}>
        <PatientTable config={CONFIG} />
      </Suspense>
    </div>
  );
}
