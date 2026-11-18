"use client";

import { HeartPulse } from "lucide-react";
import AppSidebar from "./AppSidebar";

const SECTIONS = [
  {
    items: [{ label: "Patients", href: "/counsellor/patients", icon: HeartPulse }],
  },
];

export default function CounsellorSidebar({ sidebarOpen, setSidebarOpen } = {}) {
  return (
    <AppSidebar
      panel="Counsellor"
      homeHref="/counsellor/patients"
      roleLabel="Counsellor"
      sections={SECTIONS}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    />
  );
}
