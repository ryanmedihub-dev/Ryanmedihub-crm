import { Suspense } from "react";
import SalesSidebar from "@/components/Sidebars/SalesSidebar";
import PatientTable from "@/components/PatientTable";

const CONFIG = {
  basePath:        "/sales/patients",
  title:           "All Patients Data",
  subtitle:        "",
  columns:         ["name","phone","branch","visitDate","status","counsellor","technique","package","received","pending","reference"],
  actions:         ["view"],
  showCsvExport:   false,
  showAddButton:   false,
  defaultPageSize: 20,
  pageSizeOptions: [20, 50, 100, 200],
  enableSorting:   false,
  formatCurrency:  true,
  filters: {
    showSurgeryDate:     false,
    showVisited:         false,
    showReadyForSurgery: false,
    showDoctor:          false,
    showSeniorTech:      false,
    showImplanter:       false,
  },
};

export default function SalesPatientsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <SalesSidebar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" /></div>}>
        <PatientTable config={CONFIG} />
      </Suspense>
    </div>
  );
}
