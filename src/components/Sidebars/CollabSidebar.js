"use client";

import {
  LayoutDashboard,
  HeartPulse,
  ClipboardList,
  UserPlus,
  UserMinus,
  Receipt,
  Wallet,
  Droplets,
  History,
  FileBarChart,
} from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [
      { label: "Dashboard", href: "/collab/dashboard", icon: LayoutDashboard },
      { label: "Patients", href: "/collab/patients", icon: HeartPulse },
      { label: "Consult Form", href: "/collab/book-consult", icon: ClipboardList },
      { label: "Add Patient", href: "/collab/add-patient", icon: UserPlus },
      { label: "Not Visited", href: "/collab/not-visited", icon: UserMinus },
      { label: "Transactions", href: "/collab/transactions", icon: Receipt },
      { label: "Settlement", href: "/collab/collab-settlement", icon: Wallet },
      { label: "PRP", href: "/collab/prp", icon: Droplets },
      { label: "Old PRP", href: "/collab/old-prp-patients", icon: History },
      { label: "Reports", href: "/collab/reports", icon: FileBarChart },
    ],
  },
];

export default function CollabSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Collab"
      homeHref="/collab/dashboard"
      roleLabel="Collab staff"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
