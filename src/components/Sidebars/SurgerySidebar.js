"use client";

import {
  LayoutDashboard,
  HeartPulse,
  CheckCircle2,
  Clock,
  Gift,
  FileBarChart,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/surgery/dashboard", icon: LayoutDashboard },
      { label: "Patients", href: "/surgery/patients", icon: HeartPulse },
      { label: "Visited Patients", href: "/surgery/visited", icon: CheckCircle2 },
      { label: "Not Visited", href: "/surgery/not-visited", icon: Clock },
      { label: "Incentives", href: "/surgery/incentives", icon: Gift },
      { label: "Reports", href: "/surgery/reports", icon: FileBarChart },
    ],
  },
];

export default function SurgerySidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Surgery"
      homeHref="/surgery/dashboard"
      roleLabel="Surgery team"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
