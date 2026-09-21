import { Suspense } from "react";
import ReceptionSidebar from "@/components/Sidebars/ReceptionSidebar";
import PatientTable from "@/components/PatientTable";

const CONFIG = {
  basePath:        "/reception/patients",
  title:           "All Patients",
  subtitle:        "Manage and track patient records",
  columns:         ["name","phone","branch","visitDate","status","package"],
  actions:         ["view","edit"],
  showCsvExport:   false,
  showAddButton:   true,
  addButtonHref:   "/reception/add-patient",
  defaultPageSize: 50,
  pageSizeOptions: [10, 25, 50, 100],
  enableSorting:   true,
  formatCurrency:  false,
  filters: {
    showSurgeryDate:     true,
    showVisited:         true,
    showReadyForSurgery: true,
    showDoctor:          false,
    showSeniorTech:      false,
    showImplanter:       false,
  },
};

export default function ReceptionPatientsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <ReceptionSidebar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" /></div>}>
        <PatientTable config={CONFIG} />
      </Suspense>
    </div>
  );
}
