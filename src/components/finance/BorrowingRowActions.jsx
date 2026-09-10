"use client";

import Link from "next/link";
import { HandCoins } from "lucide-react";

export default function BorrowingRowActions() {
  return (
    <Link
      href="/admin/liabilities/borrowings"
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
    >
      <HandCoins className="w-3.5 h-3.5" /> Manage
    </Link>
  );
}
