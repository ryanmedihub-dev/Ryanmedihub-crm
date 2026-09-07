"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const MAP = {
  ok: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2, label: "Ready" },
  warning: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle, label: "Warning" },
  error: { cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle, label: "Error" },
};

export default function RowStatusPill({ status }) {
  const p = MAP[status] || MAP.error;
  const { Icon } = p;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${p.cls}`}>
      <Icon className="h-3 w-3" /> {p.label}
    </span>
  );
}
