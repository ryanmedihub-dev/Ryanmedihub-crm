"use client";

import { Suspense } from "react";
import { LayoutDashboard, Home, Users, Wallet, HelpCircle, HandCoins } from "lucide-react";
import { LedgerScopeProvider } from "@/components/finance/LedgerScopeProvider";
import LedgerTabs from "@/components/finance/LedgerTabs";

const TABS = [
  { href: "/admin/liabilities", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/liabilities/payables/rent", label: "Rent", icon: Home },
  { href: "/admin/liabilities/payables/employees", label: "Employees", icon: Users },
  { href: "/admin/liabilities/payables/other", label: "Other Payables", icon: Wallet },
  { href: "/admin/liabilities/suspense", label: "Suspense", icon: HelpCircle },
  { href: "/admin/liabilities/borrowings", label: "Borrowings", icon: HandCoins },
];

export default function LiabilitiesLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Liabilities</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Everything the business owes — payables, suspense entries and borrowings.
            </p>
          </div>
          <Suspense fallback={<div className="h-9 w-full max-w-md bg-gray-100 rounded-xl animate-pulse" />}>
            <LedgerScopeProvider>
              <LedgerTabs tabs={TABS} />
              {children}
            </LedgerScopeProvider>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
