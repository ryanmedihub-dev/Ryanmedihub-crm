"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function LedgerTabs({ tabs }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  return (
    <div className="-mx-1 overflow-x-auto">
      <div className="flex gap-1.5 px-1 pb-1">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={qs ? `${tab.href}?${qs}` : tab.href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
