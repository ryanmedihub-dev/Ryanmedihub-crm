"use client";

import {
  LayoutDashboard,
  HeartPulse,
  UsersRound,
  Building2,
  Landmark,
  ScrollText,
  Banknote,
  Scale,
  HandCoins,
  Wallet,
  Store,
  Receipt,
  FileBarChart,
  Archive,
  Droplets,
  Boxes,
  Upload,
  FileUp,
  SlidersHorizontal,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Patients", href: "/admin/patients", icon: HeartPulse },
      { label: "Employees", href: "/admin/employees", icon: UsersRound },
      { label: "Collab Settlement", href: "/admin/collab-settlement", icon: Building2 },
    ],
  },
  {
    title: "Financial",
    items: [
      { label: "Assets", href: "/admin/assets", icon: Landmark,
        children: [
          { label: "Cash Book", href: "/admin/assets/cash-book" },
          { label: "Receivables", href: "/admin/assets/receivables" },
          { label: "Advances", href: "/admin/assets/advances" },
          { label: "Loan Accounts", href: "/admin/assets/loan-accounts" },
        ] },
      { label: "Liabilities", href: "/admin/liabilities", icon: ScrollText,
        children: [
          { label: "Rent & Utilities", href: "/admin/liabilities/payables/rent" },
          { label: "Employee Payables", href: "/admin/liabilities/payables/employees" },
          { label: "Other Payables", href: "/admin/liabilities/payables/other" },
          { label: "Suspense", href: "/admin/liabilities/suspense" },
          { label: "Borrowings", href: "/admin/liabilities/borrowings" },
        ] },
      { label: "Financing", href: "/admin/financing", icon: Banknote },
      { label: "Close Book", href: "/admin/close-book", icon: Scale },
      { label: "Receipts", href: "/admin/receipts", icon: HandCoins },
      { label: "Payments", href: "/admin/payments", icon: Wallet },
      { label: "Vendors", href: "/admin/vendors", icon: Store },
      { label: "Transactions", href: "/admin/transactions", icon: Receipt },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/admin/reports", icon: FileBarChart },
      { label: "Deleted Log", href: "/admin/deleted-data", icon: Archive },
    ],
  },
  {
    title: "Extra Details",
    items: [
      { label: "PRP & GFC", href: "/admin/prp", icon: Droplets },
      { label: "Stocks", href: "/admin/stocks", icon: Boxes },
    ],
  },
  {
    title: "Bulk Tools",
    roles: ["admin","super-admin","owner"],
    items: [
      { label: "Uploads", href: "/admin/uploads", icon: Upload },
      { label: "Patient Bulk Import", href: "/admin/patient-bulk-import", icon: FileUp, roles: ["super-admin","owner"] },
    ],
  },
  {
    title: "Settings",
    roles: ["super-admin","owner"],
    items: [
      { label: "Master Data", href: "/admin/settings/master-data", icon: SlidersHorizontal },
    ],
  },
];

export default function AdminSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Admin"
      homeHref="/admin/dashboard"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
