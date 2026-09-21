import { Suspense } from "react";
import Sidebar from "@/components/Sidebars/SalesSidebar";
import TransactionTable from "@/components/TransactionTable";

const CONFIG = {
  title:           "Revenue Transactions",
  subtitle:        "All revenue transactions and payment details",
  columns:         ["date","patient","branch","procedure","paymentType","method","amount"],
  actions:         ["view","bill"],
  viewBasePath:    "/sales/patients",
  showCsvExport:   true,
  defaultPageSize: 25,
  pageSizeOptions: [25, 50, 100],
  defaultCostType: "Revenue",
  filters: {
    showCostType:    false,
    showCategory:    false,
    showMethod:      true,
    showPaymentType: true,
    showBranch:      true,
  },
};

export default function SalesRevenuePage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin h-10 w-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full" /></div>}>
        <TransactionTable config={CONFIG} />
      </Suspense>
    </div>
  );
}
