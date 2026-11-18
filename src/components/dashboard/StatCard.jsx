"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

// Kept for callers that still tint their own icons (transaction toolbar, summary panels).
const TONES = {
  blue: "text-blue-600 bg-blue-50",
  indigo: "text-indigo-600 bg-indigo-50",
  violet: "text-violet-600 bg-violet-50",
  purple: "text-purple-600 bg-purple-50",
  emerald: "text-emerald-600 bg-emerald-50",
  green: "text-emerald-600 bg-emerald-50",
  teal: "text-teal-600 bg-teal-50",
  amber: "text-amber-600 bg-amber-50",
  orange: "text-orange-600 bg-orange-50",
  red: "text-rose-600 bg-rose-50",
  rose: "text-rose-600 bg-rose-50",
  pink: "text-pink-600 bg-pink-50",
  gray: "text-gray-500 bg-gray-100",
};

// Accepts a tone name or a legacy Tailwind gradient string ("from-blue-500 to-blue-600").
export function toneClass(tone = "gray") {
  const key = tone.match(/from-(\w+)-/)?.[1] || tone;
  return TONES[key] || TONES.gray;
}

/*
 * A KPI tile: label, figure, one line of context. No icon tile — the label names the
 * metric and colour is reserved for meaning (the trend arrow), so a row of these reads
 * as data, not decoration. `icon` / `tone` are accepted and ignored for compatibility.
 */
export default function StatCard({ title, value, trend, subtitle, onClick, href }) {
  const hasTrend = typeof trend === "number" && trend !== 0;
  const up = trend > 0;
  const interactive = !!(onClick || href);

  const body = (
    <>
      <p className="flex items-center justify-between gap-2 text-[13px] font-medium text-gray-500 leading-5">
        <span className="truncate">{title}</span>
        {interactive && (
          <ArrowUpRight
            className="w-3.5 h-3.5 shrink-0 text-gray-300 transition-colors duration-150 group-hover:text-gray-600"
            aria-hidden
          />
        )}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums leading-8 whitespace-nowrap">
        {value}
      </p>
      {(hasTrend || subtitle) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-gray-500">
          {hasTrend && (
            <span className={`inline-flex items-center font-medium tabular-nums ${up ? "text-emerald-700" : "text-rose-700"}`}>
              {up ? <ArrowUpRight className="w-3 h-3" aria-hidden /> : <ArrowDownRight className="w-3 h-3" aria-hidden />}
              {up ? "+" : ""}
              {trend}%
            </span>
          )}
          {subtitle && <span className="truncate">{subtitle}</span>}
        </p>
      )}
    </>
  );

  const cls = "group block w-full h-full min-w-0 text-left bg-white rounded-xl border border-gray-200 px-4 py-3.5 sm:px-5 sm:py-4";
  const hover = " transition-[border-color,background-color] duration-150 hover:border-gray-300 hover:bg-gray-50/50 cursor-pointer";

  if (href) return <Link href={href} className={cls + hover}>{body}</Link>;
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls + hover + " press"}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}
