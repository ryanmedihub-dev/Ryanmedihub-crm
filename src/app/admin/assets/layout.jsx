"use client";

import { Suspense } from "react";
import { LayoutDashboard, Landmark, HandCoins, Wallet, Banknote } from "lucide-react";
import { LedgerScopeProvider } from "@/components/finance/LedgerScopeProvider";
import LedgerTabs from "@/components/finance/LedgerTabs";

const TABS = [
  { href: "/admin/assets", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/assets/cash-book", label: "Cash Book", icon: Landmark },
  { href: "/admin/assets/receivables", label: "Receivables", icon: HandCoins },
  { href: "/admin/assets/advances", label: "Advances", icon: Wallet },
  { href: "/admin/assets/loan-accounts", label: "Loan Accounts", icon: Banknote },
];

export default function AssetsLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Assets</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Everything the business owns or is owed — cash &amp; bank, receivables, advances
              and loan accounts.
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
