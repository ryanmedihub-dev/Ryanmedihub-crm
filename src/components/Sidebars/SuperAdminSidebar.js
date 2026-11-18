"use client";

import {
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Filter,
  HeartPulse,
  UsersRound,
  Receipt,
  Boxes,
  FileBarChart,
  TrendingUp,
  ClipboardList,
  Settings,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/super-admin/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "Leads Data",
    items: [
      { label: "Leads", href: "/super-admin/leads", icon: Megaphone },
      { label: "Interview Leads", href: "/super-admin/interviews", icon: ShieldCheck },
      { label: "Lead Funnel", href: "/super-admin/lead-funnel", icon: Filter },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Patients", href: "/super-admin/patients", icon: HeartPulse },
      { label: "Employees", href: "/super-admin/employees", icon: UsersRound },
    ],
  },
  {
    title: "Financial",
    items: [
      { label: "Transactions", href: "/super-admin/transactions", icon: Receipt },
      { label: "Stocks", href: "/super-admin/stocks", icon: Boxes },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/super-admin/reports", icon: FileBarChart },
      { label: "Performance", href: "/super-admin/performance", icon: TrendingUp },
      { label: "Entries Report", href: "/super-admin/entries-report", icon: ClipboardList },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Total Users", href: "/super-admin/manage-users", icon: Settings },
    ],
  },
];

export default function SuperAdminSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Super Admin"
      homeHref="/super-admin/dashboard"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
