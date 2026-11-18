"use client";

import {
  LayoutDashboard,
  ClipboardList,
  QrCode,
  Globe,
  UserCheck,
  UserX,
  UsersRound,
  Gift,
  FileText,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/hr/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    title: "Recruitment",
    items: [
      { label: "All Candidates", href: "/hr/candidates", icon: ClipboardList },
      { label: "Visited (QR)", href: "/hr/visited", icon: QrCode },
      { label: "Applied Online", href: "/hr/applied", icon: Globe },
      { label: "Selected", href: "/hr/selected", icon: UserCheck },
      { label: "Rejected", href: "/hr/rejected", icon: UserX },
    ],
  },
  {
    title: "Team",
    items: [
      { label: "Employees", href: "/hr/employees", icon: UsersRound },
      { label: "Incentives", href: "/hr/incentives", icon: Gift },
      { label: "Reports", href: "/hr/reports", icon: FileText },
    ],
  },
];

export default function HRSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="HR"
      homeHref="/hr/dashboard"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
