import { Suspense } from "react";
import Sidebar from "@/components/Sidebars/SuperAdminSidebar";
import PatientTable from "@/components/PatientTable";
import { ALL_BRANCHES } from "@/lib/branches";

const CONFIG = {
  basePath:        "/admin/patients",
  title:           "Patient Management",
  subtitle:        "Comprehensive patient data overview",
  columns:         ["visitDate","name","phone","branch","technique","package","received","pending","status","reference"],
  actions:         ["view","edit"],
  showCsvExport:   true,
  showAddButton:   false,
  defaultPageSize: 50,
  pageSizeOptions: [10, 25, 50, 100],
  enableSorting:   true,
  formatCurrency:  false,
  locationOptions: ALL_BRANCHES,
  filters: {
    showSurgeryDate:     true,
    showVisited:         true,
    showReadyForSurgery: true,
    showDoctor:          false,
    showSeniorTech:      false,
    showImplanter:       false,
  },
};

export default function AdminPatientsPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" /></div>}>
        <PatientTable config={CONFIG} />
      </Suspense>
    </div>
  );
}
