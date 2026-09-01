"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  HeartPulse,
  UsersRound,
  Receipt,
  FileBarChart,
  TrendingUp,
  Shield,
  X,
  Menu,
  Boxes,
  Store,
  Archive,
  Droplets,
  Building2,
  Wallet,
  HandCoins,
  Scale,
  Landmark,
  ScrollText,
  FileText,
  Banknote,
  SlidersHorizontal,
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
            ? "bg-linear-to-r from-indigo-50 to-purple-50 text-indigo-700 shadow-sm border border-indigo-100"
            : "text-gray-600 hover:bg-gray-50 hover:text-indigo-600 hover:shadow-sm"
        }`}
      >
        <Icon
          className={`w-4.5 h-4.5 shrink-0 transition-all duration-200 ${
            active
              ? "text-indigo-600 scale-110"
              : "text-gray-400 group-hover:text-indigo-500 group-hover:scale-110"
          }`}
        />
        <span className="grow leading-none">{label}</span>
        {active && (
          <div className="w-2 h-2 rounded-full bg-indigo-500 nav-dot-pulse" />
        )}
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

export default function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const userName = session?.user?.name || session?.user?.email || "Admin";
  const userEmail = session?.user?.email || "";
  const initials = userName.slice(0, 2).toUpperCase();

  const isActive = (href, exact = false) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

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
          <Link
            href="/admin/dashboard"
            onClick={close}
            className="flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center shadow-md brand-glow">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-none">
                RyanCRM
              </p>
              <p className="text-gray-400 text-[10px] mt-0.5 font-medium">
                Admin Control Center
              </p>
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

        <nav className="flex-1 overflow-y-auto mt-4 px-3 pb-4 scrollbar-hide">
          <NavSection title="">
            <NavItem
              label="Dashboard"
              href="/admin/dashboard"
              icon={LayoutDashboard}
              active={isActive("/admin/dashboard", true)}
              onClick={close}
            />
          </NavSection>

          <NavSection title="Management">
            <NavItem
              label="Patients"
              href="/admin/patients"
              icon={HeartPulse}
              active={isActive("/admin/patients")}
              onClick={close}
            />
            <NavItem
              label="Employees"
              href="/admin/employees"
              icon={UsersRound}
              active={isActive("/admin/employees")}
              onClick={close}
            />
            <NavItem
              label="Collab Settlement"
              href="/admin/collab-settlement"
              icon={Building2}
              active={isActive("/admin/collab-settlement")}
              onClick={close}
            />
          </NavSection>

          <NavSection title="Financial">
            <NavItem
              label="Assets"
              href="/admin/assets"
              icon={Landmark}
              active={isActive("/admin/assets")}
              onClick={close}
            />
            <NavItem
              label="Liabilities"
              href="/admin/liabilities"
              icon={ScrollText}
              active={isActive("/admin/liabilities")}
              onClick={close}
            />
            <NavItem
              label="Financing"
              href="/admin/financing"
              icon={Banknote}
              active={isActive("/admin/financing")}
              onClick={close}
            />
            <NavItem
              label="Close Book"
              href="/admin/close-book"
              icon={Scale}
              active={isActive("/admin/close-book")}
              onClick={close}
            />
            <NavItem
              label="Receipts"
              href="/admin/receipts"
              icon={HandCoins}
              active={isActive("/admin/receipts")}
              onClick={close}
            />
            <NavItem
              label="Payments"
              href="/admin/payments"
              icon={Wallet}
              active={isActive("/admin/payments")}
              onClick={close}
            />
            <NavItem
              label="Vendors"
              href="/admin/vendors"
              icon={Store}
              active={isActive("/admin/vendors")}
              onClick={close}
            />
            <NavItem
              label="Transactions"
              href="/admin/transactions"
              icon={Receipt}
              active={isActive("/admin/transactions")}
              onClick={close}
            />

          </NavSection>

          <NavSection title="Analytics">
            <NavItem
              label="Reports"
              href="/admin/reports"
              icon={FileBarChart}
              active={isActive("/admin/reports")}
              onClick={close}
            />
            <NavItem
              label="Deleted Log"
              href="/admin/deleted-data"
              icon={Archive}
              active={isActive("/admin/deleted-data")}
              onClick={close}
            />
          </NavSection>
          <NavSection title="Extra Details">
            <NavItem
              label="PRP & GFC"
              href="/admin/prp"
              icon={Droplets}
              active={isActive("/admin/prp")}
              onClick={close}
            />
            <NavItem
              label="Stocks"
              href="/admin/stocks"
              icon={Boxes}
              active={isActive("/admin/stocks")}
              onClick={close}
            />
          </NavSection>

          {(session?.user?.role === "super-admin" || session?.user?.role === "owner") && (
            <NavSection title="Settings">
              <NavItem
                label="Master Data"
                href="/admin/settings/master-data"
                icon={SlidersHorizontal}
                active={isActive("/admin/settings/master-data")}
                onClick={close}
              />
            </NavSection>
          )}
        </nav>

        <div className="shrink-0 border-t border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-linear-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-gray-900 text-sm font-semibold truncate leading-none">
                {userName}
              </p>
              <p className="text-gray-400 text-[11px] truncate mt-0.5">
                {userEmail}
              </p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
