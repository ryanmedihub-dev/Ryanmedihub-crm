"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  UsersRound,
  UserCheck,
  UserX,
  Briefcase,
  X,
  Menu,
  ClipboardList,
  FileText,
  QrCode,
  Globe,
  Gift,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import LogoutButton from "../LogoutButton";

function NavItem({ label, href, icon: Icon, active, onClick }) {
  return (
    <Link href={href} onClick={onClick} className="block">
      <span
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group hover:scale-[1.01] ${
          active
            ? "bg-linear-to-r from-violet-50 to-purple-50 text-violet-700 shadow-sm border border-violet-100"
            : "text-gray-600 hover:bg-gray-50 hover:text-violet-600 hover:shadow-sm"
        }`}
      >
        <Icon
          className={`w-4.5 h-4.5 shrink-0 transition-all duration-200 ${
            active
              ? "text-violet-600 scale-110"
              : "text-gray-400 group-hover:text-violet-500 group-hover:scale-110"
          }`}
        />
        <span className="grow leading-none">{label}</span>
        {active && <div className="w-2 h-2 rounded-full bg-violet-500 nav-dot-pulse-violet" />}
      </span>
    </Link>
  );
}

function NavSection({ title, children }) {
  return (
    <div className="mb-1">
      {title && (
        <p className="px-3 mb-1.5 mt-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          {title}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function HRSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const userName = session?.user?.name || session?.user?.email || "HR Manager";
  const userEmail = session?.user?.email || "";
  const initials = userName.slice(0, 2).toUpperCase();

  const isActive = (href, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`fixed left-0 top-0 lg:sticky w-64 h-screen bg-white border-r border-gray-200 shadow-sm flex flex-col z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 flex items-center justify-between shrink-0">
          <Link href="/hr/dashboard" onClick={close} className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-violet-500 via-purple-500 to-indigo-500 flex items-center justify-center shadow-md brand-glow">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-none">RyanCRM</p>
              <p className="text-violet-600 text-[10px] mt-0.5 font-semibold">HR Panel</p>
            </div>
          </Link>
          <button
            className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            onClick={close}
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="mx-4 border-t border-gray-100" />

        <nav className="flex-1 overflow-y-auto px-3 pb-4 mt-5 scrollbar-hide">
          <NavSection title="">
            <NavItem
              label="Dashboard"
              href="/hr/dashboard"
              icon={LayoutDashboard}
              active={isActive("/hr/dashboard", true)}
              onClick={close}
            />
          </NavSection>

          <NavSection title="Recruitment">
            <NavItem
              label="All Candidates"
              href="/hr/candidates"
              icon={ClipboardList}
              active={isActive("/hr/candidates")}
              onClick={close}
            />
            <NavItem
              label="Visited (QR)"
              href="/hr/visited"
              icon={QrCode}
              active={isActive("/hr/visited")}
              onClick={close}
            />
            <NavItem
              label="Applied Online"
              href="/hr/applied"
              icon={Globe}
              active={isActive("/hr/applied")}
              onClick={close}
            />
            <NavItem
              label="Selected"
              href="/hr/selected"
              icon={UserCheck}
              active={isActive("/hr/selected")}
              onClick={close}
            />
            <NavItem
              label="Rejected"
              href="/hr/rejected"
              icon={UserX}
              active={isActive("/hr/rejected")}
              onClick={close}
            />
          </NavSection>

          <NavSection title="Team">
            <NavItem
              label="Employees"
              href="/hr/employees"
              icon={UsersRound}
              active={isActive("/hr/employees")}
              onClick={close}
            />
            <NavItem
              label="Incentives"
              href="/hr/incentives"
              icon={Gift}
              active={isActive("/hr/incentives")}
              onClick={close}
            />
            <NavItem
              label="Reports"
              href="/hr/reports"
              icon={FileText}
              active={isActive("/hr/reports")}
              onClick={close}
            />
          </NavSection>
        </nav>

        <div className="shrink-0 border-t border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-violet-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-gray-900 text-sm font-semibold truncate leading-none">{userName}</p>
              <p className="text-violet-600 text-[11px] truncate mt-0.5 font-medium">HR Manager</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
