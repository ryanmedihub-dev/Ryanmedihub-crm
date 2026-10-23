"use client";

/* Shared surface for the stock panel.
   Slate surfaces, one emerald accent for anything clickable or active,
   and amber/rose reserved for what the data itself is saying. */

import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";

/* ---------- formatting ---------- */

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export const inrExact = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

export const compact = (n) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

export const num = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

export const day = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";

export const when = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
      })
    : "—";

/* ---------- class tokens ---------- */

export const input =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15 disabled:bg-slate-50 disabled:text-slate-400";
export const inputBad =
  "h-10 w-full rounded-lg border border-rose-300 bg-rose-50/40 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/15";
export const inputEdited =
  "h-10 w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 text-sm text-slate-900 transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/15";
export const textarea =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15";
export const labelCls = "mb-1.5 block text-xs font-medium text-slate-600";
export const th =
  "px-4 py-2.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap";
export const td = "px-4 py-3 text-sm text-slate-700 align-middle";
export const tr = "border-t border-slate-100 hover:bg-slate-50/70 transition-colors";

/* ---------- shell ---------- */

export function Page({ sidebar: Sidebar, section, title, lead, actions, back, children, wide }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen bg-[#f6f7f9]">
      {Sidebar && <Sidebar />}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className={`mx-auto flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 lg:px-8 ${wide ? "" : "max-w-[1240px]"}`}>
            {back && (
              <button
                onClick={() => (typeof back === "string" ? router.push(back) : router.back())}
                className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Go back"
              >
                <ChevronLeft className="h-4.5 w-4.5" />
              </button>
            )}

            <div className="min-w-0 pl-8 lg:pl-0">
              <p className="text-xs text-slate-400">
                Stock <span className="px-1 text-slate-300">/</span> {section}
              </p>
              <h1 className="truncate text-[18px] font-semibold tracking-tight text-slate-900">{title}</h1>
            </div>

            {lead && <p className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 lg:block">{lead}</p>}

            {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </header>

        <div className={`mx-auto space-y-5 px-5 py-6 lg:px-8 ${wide ? "" : "max-w-[1240px]"}`}>{children}</div>
      </main>
    </div>
  );
}

/* ---------- surfaces ---------- */

export function Card({ title, note, action, children, flush, className = "" }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>
            {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/* KPI band: one card split by rules, numbers carrying the page */
export function Stats({ items }) {
  return (
    <div className="grid grid-cols-2 divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x">
      {items.map((s, i) => (
        <button
          key={s.label}
          type="button"
          disabled={!s.onClick}
          onClick={s.onClick}
          className={`px-5 py-4 text-left transition-colors ${i < 2 ? "border-b border-slate-200 sm:border-b-0" : ""} ${i % 2 === 1 ? "border-l border-slate-200 sm:border-l-0" : ""} ${s.onClick ? "cursor-pointer hover:bg-slate-50" : "cursor-default"}`}
        >
          <p
            className={`text-[26px] font-semibold leading-none tracking-tight tabular-nums ${
              s.tone === "amber" ? "text-amber-600" : s.tone === "rose" ? "text-rose-600" : "text-slate-900"
            }`}
          >
            {s.value}
          </p>
          <p className="mt-2 text-xs text-slate-500">{s.label}</p>
        </button>
      ))}
    </div>
  );
}

/* ---------- atoms ---------- */

const tones = {
  ok:      { dot: "bg-emerald-500", text: "text-emerald-700" },
  low:     { dot: "bg-amber-500",   text: "text-amber-700"   },
  bad:     { dot: "bg-rose-500",    text: "text-rose-700"    },
  neutral: { dot: "bg-slate-400",   text: "text-slate-600"   },
  info:    { dot: "bg-sky-500",     text: "text-sky-700"     },
};

export function Status({ tone = "neutral", children }) {
  const t = tones[tone] || tones.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${t.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

export function Chip({ icon: Icon, children, tone = "slate" }) {
  const map = {
    slate:   "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${map[tone]}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

const btnVariants = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50",
  quiet:   "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ghost:   "text-slate-600 hover:bg-slate-100",
  danger:  "bg-rose-600 text-white hover:bg-rose-700",
};

export function Btn({ variant = "quiet", icon: Icon, busy, children, className = "", ...rest }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${btnVariants[variant]} ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function IconBtn({ icon: Icon, tone = "slate", label, ...rest }) {
  const hover = tone === "rose" ? "hover:bg-rose-50 hover:text-rose-600" : "hover:bg-slate-100 hover:text-slate-900";
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors disabled:opacity-40 ${hover}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Field({ label, required, hint, error, children, className = "" }) {
  return (
    <div className={className}>
      {label && (
        <label className={labelCls}>
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* read-only key/value line used across detail views */
export function Row({ label, children, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-sm font-medium tabular-nums ${
          tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-600" : "text-slate-900"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

export function Spinner({ note }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />
      {note && <p className="mt-3 text-sm text-slate-500">{note}</p>}
    </div>
  );
}

export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-5 w-5 text-slate-400" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- table ---------- */

export function DataTable({ head, children, loading, empty, footer, minWidth }) {
  const cols = head.length;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr className="bg-slate-50/70">
              {head.map((h, i) => {
                const col = typeof h === "string" ? { label: h } : h;
                return (
                  <th
                    key={col.label || i}
                    onClick={col.onClick}
                    className={`${th} ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""} ${
                      col.onClick ? "cursor-pointer select-none hover:text-slate-900" : ""
                    }`}
                  >
                    {col.label}
                    {col.sortMark}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={cols}>
                  <Spinner note={typeof loading === "string" ? loading : null} />
                </td>
              </tr>
            ) : empty ? (
              <tr>
                <td colSpan={cols}>{empty}</td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
      {footer && !loading && !empty && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-2.5 text-xs text-slate-500">{footer}</div>
      )}
    </>
  );
}

/* ---------- modal ---------- */

export function Modal({ title, children, onClose, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
