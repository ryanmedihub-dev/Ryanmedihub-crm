"use client";

/*
 * RyanCRM UI primitives. One file on purpose: these are thin, Tailwind-only
 * wrappers so every page speaks the same visual language.
 * Tokens (colors, radii, shadows, easing) live in app/globals.css @theme.
 */

import Link from "next/link";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

const cx = (...c) => c.filter(Boolean).join(" ");

/* ── Button ─────────────────────────────────────────────── */
const BTN_VARIANT = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-xs",
  secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 shadow-xs",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs",
  "danger-ghost": "text-rose-600 hover:bg-rose-50 active:bg-rose-100",
};
const BTN_SIZE = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-10 px-4 text-sm gap-2",
  icon: "h-9 w-9 justify-center",
  "icon-sm": "h-8 w-8 justify-center",
};
export const buttonClass = (variant = "secondary", size = "md", className) =>
  cx(
    "inline-flex items-center font-medium rounded-lg whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98]",
    "disabled:opacity-50 disabled:pointer-events-none",
    BTN_VARIANT[variant],
    BTN_SIZE[size],
    className
  );

export function Button({ variant, size, loading, icon: Icon, children, className, type = "button", href, ...rest }) {
  const inner = (
    <>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden />}
      {children}
    </>
  );
  if (href)
    return (
      <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
        {inner}
      </Link>
    );
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  );
}

/* ── Form controls ──────────────────────────────────────── */
export const inputClass = (invalid, className) =>
  cx(
    "w-full h-9 px-3 text-sm text-gray-900 bg-white border rounded-lg shadow-xs",
    "placeholder:text-gray-400 transition-[border-color,box-shadow] duration-150",
    "focus:outline-none focus:ring-3 focus:ring-indigo-500/15 focus:border-indigo-500",
    "disabled:bg-gray-50 disabled:text-gray-500",
    invalid ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15" : "border-gray-200 hover:border-gray-300",
    className
  );

export function Field({ label, htmlFor, hint, error, required, children, className }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-rose-600 flex items-center gap-1" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ invalid, className, ...rest }) {
  return <input className={inputClass(invalid, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ invalid, className, children, ...rest }) {
  return (
    <select className={inputClass(invalid, cx("pr-8 cursor-pointer", className))} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ invalid, className, ...rest }) {
  return <textarea className={inputClass(invalid, cx("h-auto min-h-20 py-2", className))} aria-invalid={invalid || undefined} {...rest} />;
}

/* ── Badge ──────────────────────────────────────────────── */
const BADGE = {
  gray: "bg-gray-100 text-gray-700",
  indigo: "bg-indigo-50 text-indigo-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-rose-50 text-rose-700",
  purple: "bg-purple-50 text-purple-700",
  teal: "bg-teal-50 text-teal-700",
  orange: "bg-orange-50 text-orange-700",
};
export function Badge({ tone = "gray", dot, children, className }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 h-5 px-2 rounded-md text-xs font-medium whitespace-nowrap", BADGE[tone] || BADGE.gray, className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

/* ── Layout ─────────────────────────────────────────────── */
export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 text-balance">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-500 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Page({ children, className }) {
  return <main className={cx("flex-1 min-w-0 px-4 pt-16 pb-6 sm:px-6 lg:px-8 lg:py-7", className)}>{children}</main>;
}

export function Panel({ title, description, actions, children, className, bodyClassName, flush }) {
  return (
    <section className={cx("bg-white border border-gray-200 rounded-xl", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx(flush ? "" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── States ─────────────────────────────────────────────── */
export function EmptyState({ icon: Icon = Inbox, title = "Nothing here yet", description, action, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      <span className="w-10 h-10 rounded-lg bg-gray-100 text-gray-400 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this", description, onRetry, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center py-12 px-6", className)} role="alert">
      <span className="w-10 h-10 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>}
      {onRetry && (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx("rounded-md bg-gray-100 animate-pulse", className)} aria-hidden />;
}

export function Spinner({ label = "Loading…", className }) {
  return (
    <div className={cx("flex items-center justify-center gap-2 py-16 text-sm text-gray-500", className)} role="status">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/* ── Table shell ────────────────────────────────────────── */
// Class strings, so existing <table> markup can adopt them without rewrites.
export const table = {
  wrap: "overflow-x-auto",
  table: "min-w-full text-sm",
  thead: "bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10",
  th: "px-4 h-9 text-left text-xs font-medium text-gray-500 whitespace-nowrap",
  thNum: "px-4 h-9 text-right text-xs font-medium text-gray-500 whitespace-nowrap",
  tbody: "divide-y divide-gray-100",
  tr: "hover:bg-gray-50/70 transition-colors",
  td: "px-4 py-2.5 text-gray-700 whitespace-nowrap",
  tdNum: "px-4 py-2.5 text-right text-gray-900 tabular-nums whitespace-nowrap",
};

/* ── Form section ───────────────────────────────────────── */
// Settings-style block: title + description on the left, fields in a 2-col grid on the right.
export function FormSection({ title, description, children, last }) {
  return (
    <fieldset className={cx("grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-x-8 gap-y-4 px-5 sm:px-6 py-6", !last && "border-b border-gray-100")}>
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-5 text-gray-500">{description}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">{children}</div>
    </fieldset>
  );
}

// Sticky footer for a FormSection form: required note on the left, actions on the right.
export function FormActions({ children }) {
  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-gray-200 bg-gray-50/95 rounded-b-xl">
      <p className="hidden sm:block text-xs text-gray-500"><span className="text-rose-500">*</span> Required</p>
      <div className="flex items-center gap-2 ml-auto">{children}</div>
    </div>
  );
}
