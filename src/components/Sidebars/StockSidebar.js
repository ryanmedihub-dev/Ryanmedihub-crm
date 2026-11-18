"use client";

import {
  LayoutDashboard,
  PackagePlus,
  PackageCheck,
  ArrowLeftRight,
  ClipboardList,
  Store,
  UserPlus,
  ReceiptText,
  FilePlus2,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/stocks/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "New product", href: "/stocks/create", icon: PackagePlus, exact: true },
      { label: "Record purchase", href: "/stocks/addStock", icon: PackageCheck, exact: true },
      { label: "Transfer stock", href: "/stocks/transfer", icon: ArrowLeftRight, exact: true },
      { label: "Audit", href: "/stocks/audit", icon: ClipboardList, exact: true },
    ],
  },
  {
    title: "Partners",
    items: [
      { label: "Vendors", href: "/stocks/vendors", icon: Store, exact: true },
      { label: "New vendor", href: "/stocks/vendors/create", icon: UserPlus, exact: true },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Transactions", href: "/stocks/transactions", icon: ReceiptText, exact: true },
      { label: "New transaction", href: "/stocks/transactions/create", icon: FilePlus2, exact: true },
    ],
  },
];

export default function StockSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Inventory"
      homeHref="/stocks/dashboard"
      roleLabel="Stock manager"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      // Pages that drive the drawer render their own menu button.
      floatingButton={typeof setSidebarOpen !== "function"}
    />
  );
}
