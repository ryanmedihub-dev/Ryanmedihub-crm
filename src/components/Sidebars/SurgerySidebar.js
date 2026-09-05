"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  HeartPulse,
  CheckCircle2,
  FileBarChart,
  Stethoscope,
  Clock,
  X,
  Menu,
  FileCheck,
  Gift
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
          ? "bg-green-100 text-green-700 font-semibold shadow-sm border border-green-200"
          : "text-gray-600 hover:bg-gray-50 hover:shadow-sm font-medium"
      }`}
    >
      <Icon className={`w-4.5 h-4.5 shrink-0 transition-all duration-200 ${isActive ? "text-green-600 scale-110" : "text-gray-400 group-hover:text-green-500 group-hover:scale-110"}`} />
      <span className="grow">{item}</span>
      {isActive && <div className="w-2 h-2 rounded-full bg-green-500 nav-dot-pulse-green"></div>}
    </button>
  </Link>
);

export default function SurgerySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState("User");

  useEffect(() => {
    const name = document.cookie
      .split('; ')
      .find(row => row.startsWith('userName='))
      ?.split('=')[1];
    if (name) setUserName(decodeURIComponent(name));
  }, []);

  const navItems = [
    { name: "Dashboard",       path: "/surgery/dashboard",   icon: LayoutDashboard },
    { name: "Patients",        path: "/surgery/patients",    icon: HeartPulse },
    { name: "Visited Patients",path: "/surgery/visited",     icon: CheckCircle2 },
    { name: "Not Visited",     path: "/surgery/not-visited", icon: Clock },
    { name: "Incentives",      path: "/surgery/incentives",  icon: Gift },
    { name: "Reports",         path: "/surgery/reports",     icon: FileBarChart },
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
        className={`fixed left-0 top-0 lg:sticky w-80 bg-white border-r shadow-sm p-6 space-y-6 z-50 h-screen transition-transform duration-300 flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link href="/surgery/dashboard" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-linear-to-r from-green-600 to-emerald-600 rounded-lg flex items-center justify-center brand-glow">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900">RyanCRM</h1>
              <p className="text-xs text-gray-500">Surgery Panel</p>
            </div>
          </Link>
          <button
            className="lg:hidden p-1 hover:bg-gray-100 rounded"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-green-600" />
              <span className="text-xs text-gray-600">This Month</span>
            </div>
            <p className="text-lg font-bold text-gray-900">6</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="flex items-center gap-2 mb-1">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-gray-600">Completed</span>
            </div>
            <p className="text-lg font-bold text-gray-900">4</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
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
          <div className="p-3 bg-linear-to-r from-green-50 to-emerald-50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-linear-to-r from-green-600 to-emerald-600 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-600">Surgery Team</p>
              </div>
            </div>
          </div>

          <LogoutButton />


        </div>
      </aside>
    </>
  );
}