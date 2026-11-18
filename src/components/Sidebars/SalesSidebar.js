"use client";

import {
  LayoutDashboard,
  HeartPulse,
  CalendarPlus,
  Handshake,
  Receipt,
  Gift,
  FileBarChart,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/sales/dashboard", icon: LayoutDashboard },
      { label: "Patients", href: "/sales/patients", icon: HeartPulse },
      { label: "Book Appointment", href: "/sales/book-appointment", icon: CalendarPlus },
      { label: "Agents", href: "/sales/agents", icon: Handshake },
      { label: "Transactions", href: "/sales/transactions", icon: Receipt },
      { label: "Incentives", href: "/sales/incentives", icon: Gift },
      { label: "Reports", href: "/sales/reports", icon: FileBarChart },
    ],
  },
];

export default function SalesSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Sales"
      homeHref="/sales/dashboard"
      roleLabel="Sales team"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
