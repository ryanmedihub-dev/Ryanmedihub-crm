"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PackagePlus,
  PackageCheck,
  ArrowLeftRight,
  ClipboardList,
  Store,
  UserPlus,
  ReceiptText,
  FilePlus2,
  Boxes,
  Menu,
  X,
} from "lucide-react";
import LogoutButton from "../LogoutButton";

const GROUPS = [
  {
    label: "OVERVIEW",
    items: [{ name: "Dashboard", path: "/stocks/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "INVENTORY",
    items: [
      { name: "New product",   path: "/stocks/create",   icon: PackagePlus },
      { name: "Record purchase", path: "/stocks/addStock", icon: PackageCheck },
      { name: "Transfer stock", path: "/stocks/transfer", icon: ArrowLeftRight },
      { name: "Audit",          path: "/stocks/audit",    icon: ClipboardList },
    ],
  },
  {
    label: "PARTNERS",
    items: [
      { name: "Vendors",    path: "/stocks/vendors",        icon: Store },
      { name: "New vendor", path: "/stocks/vendors/create", icon: UserPlus },
    ],
  },
  {
    label: "SALES",
    items: [
      { name: "Transactions",    path: "/stocks/transactions",        icon: ReceiptText },
      { name: "New transaction", path: "/stocks/transactions/create", icon: FilePlus2 },
    ],
  },
];

/* Opens itself on mobile, unless a page drives it with its own menu button
   (the transactions page does) — then it follows those props. */
export default function StockSidebar({ sidebarOpen, setSidebarOpen }) {
  const pathname = usePathname();
  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = typeof setSidebarOpen === "function";
  const open = controlled ? !!sidebarOpen : selfOpen;
  const setOpen = controlled ? setSidebarOpen : setSelfOpen;
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const name = document.cookie.split("; ").find((r) => r.startsWith("userName="))?.split("=")[1];
    if (name) setUserName(decodeURIComponent(name));
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {!controlled && (
        <button
          onClick={() => setOpen(true)}
          className="fixed left-4 top-3.5 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {open && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/stocks/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
              <Boxes className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-slate-900">RyanCRM</p>
              <p className="text-xs text-slate-400">Inventory</p>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 mt-4 pb-4 scrollbar-hide">
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-slate-400">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        active
                          ? "bg-slate-100 font-medium text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-emerald-700" />}
                      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-emerald-700" : "text-slate-400"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-3 py-3">
          {userName && (
            <div className="mb-2 flex items-center gap-2.5 px-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-medium text-slate-900">{userName}</p>
                <p className="text-xs text-slate-400">Stock manager</p>
              </div>
            </div>
          )}
          <LogoutButton className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900" />
        </div>
      </aside>
    </>
  );
}
