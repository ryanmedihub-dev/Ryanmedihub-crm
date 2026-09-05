"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Sidebar from "@/components/Sidebars/SalesSidebar";
import usePatientPicker from "@/lib/usePatientPicker";
import IncentiveEntryForm from "@/components/IncentiveEntryForm";

export default function SalesIncentivesPage() {
  const picker = usePatientPicker();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Incentives</h1>
                <p className="text-gray-600 mt-1">
                  Record a per-patient incentive owed to an employee.
                </p>
              </div>

              <Link
                href="/sales/transactions"
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Link>
            </div>

            <IncentiveEntryForm picker={picker} />
          </div>
        </div>
      </main>
    </div>
  );
}
