"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  LayoutDashboard,
  UserPlus,
  HeartPulse,
  ClipboardList,
  Receipt,
  UserMinus,
  FileBarChart,
  X,
  Menu,
  Users,
  Droplets,
  History,
  Gift,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "../LogoutButton";

const NavItem = ({ item, href, isActive, onClick, icon: Icon }) => (
  <Link href={href} className="block w-full">
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 rounded-xl transition-all duration-200 flex items-center gap-3 group hover:scale-[1.01] ${
        isActive
          ? "bg-indigo-100 text-indigo-700 font-semibold shadow-sm border border-indigo-200"
          : "text-gray-600 hover:bg-gray-50 hover:shadow-sm font-medium"
      }`}
    >
      <Icon className={`w-4.5 h-4.5 shrink-0 transition-all duration-200 ${isActive ? "text-indigo-600 scale-110" : "text-gray-400 group-hover:text-indigo-500 group-hover:scale-110"}`} />
      <span className="grow">{item}</span>
      {isActive && <div className="w-2 h-2 rounded-full bg-indigo-500 nav-dot-pulse"></div>}
    </button>
  </Link>
);

export default function ReceptionSidebar({ sidebarOpen: externalOpen, setSidebarOpen: setExternalOpen } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const sidebarOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setSidebarOpen = setExternalOpen || setInternalOpen;
  const [userName, setUserName] = useState("User");

  useEffect(() => {
    const name = document.cookie
      .split('; ')
      .find(row => row.startsWith('userName='))
      ?.split('=')[1];
    if (name) setUserName(decodeURIComponent(name));
  }, []);

  const navItems = [
    { name: "Dashboard",    path: "/reception/dashboard",   icon: LayoutDashboard },
    { name: "Patients",     path: "/reception/patients",    icon: HeartPulse },
    { name: "Consult Form", path: "/reception/book-consult",icon: ClipboardList },
    { name: "Add Patient",  path: "/reception/add-patient", icon: UserPlus },
    { name: "Not Visited",  path: "/reception/not-visited", icon: UserMinus },
    { name: "Transactions", path: "/reception/transactions",icon: Receipt },
    { name: "Incentives",   path: "/reception/incentives",  icon: Gift },
    { name: "PRP",          path: "/reception/prp",               icon: Droplets },
    { name: "Old PRP",      path: "/reception/old-prp-patients", icon: History },
    { name: "Reports",      path: "/reception/reports",          icon: FileBarChart },
  ];


  return (
    <>
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md"
      >
        <Menu className="w-6 h-6 text-gray-700" />
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <aside
        className={`fixed left-0 top-0 lg:sticky w-72 bg-white border-r shadow-sm p-6 space-y-6 z-50 h-screen transition-transform duration-300 flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link href="/reception/dashboard" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-linear-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center brand-glow">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900">RyanCRM</h1>
              <p className="text-xs text-gray-500">Reception Panel</p>
            </div>
          </Link>
          <button
            className="lg:hidden p-1 hover:bg-gray-100 rounded"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto lg:mt-4 scrollbar-hide">
          {navItems.map((item) => (
            <NavItem
              key={item.name}
              item={item.name}
              href={item.path}
              icon={item.icon}
              isActive={pathname === item.path}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="space-y-3 border-t pt-4">
          <div className="p-3 bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-linear-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-600">Reception Staff</p>
              </div>
            </div>
          </div>

          <LogoutButton />

        </div>
      </aside>
    </>
  );
}