"use client";

import {
  LayoutDashboard,
  HeartPulse,
  ClipboardList,
  UserPlus,
  UserMinus,
  Receipt,
  Gift,
  Droplets,
  History,
  FileBarChart,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/reception/dashboard", icon: LayoutDashboard },
      { label: "Patients", href: "/reception/patients", icon: HeartPulse },
      { label: "Consult Form", href: "/reception/book-consult", icon: ClipboardList },
      { label: "Add Patient", href: "/reception/add-patient", icon: UserPlus },
      { label: "Not Visited", href: "/reception/not-visited", icon: UserMinus },
      { label: "Transactions", href: "/reception/transactions", icon: Receipt },
      { label: "Incentives", href: "/reception/incentives", icon: Gift },
      { label: "PRP", href: "/reception/prp", icon: Droplets },
      { label: "Old PRP", href: "/reception/old-prp-patients", icon: History },
      { label: "Reports", href: "/reception/reports", icon: FileBarChart },
    ],
  },
];

export default function ReceptionSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Reception"
      homeHref="/reception/dashboard"
      roleLabel="Reception staff"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
