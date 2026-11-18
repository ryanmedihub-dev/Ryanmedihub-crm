"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export default function LedgerTabs({ tabs }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  return (
    <nav aria-label="Sections" className="overflow-x-auto scrollbar-hide border-b border-gray-200">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={qs ? `${tab.href}?${qs}` : tab.href}
              aria-current={active ? "page" : undefined}
              className={`group -mb-px inline-flex shrink-0 items-center gap-2 h-10 px-3 border-b-2 text-sm transition-colors duration-150 ${
                active
                  ? "border-indigo-600 text-gray-900 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
              }`}
            >
              {Icon && <Icon className={`w-4 h-4 ${active ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-500"}`} />}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
