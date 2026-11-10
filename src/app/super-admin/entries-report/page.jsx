"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SuperAdminSidebar from "@/components/Sidebars/SuperAdminSidebar";
import SearchableMultiSelect from "@/components/SearchableMultiSelect";
import { ALL_BRANCHES } from "@/lib/branches";
import { ALL_STATUSES, FOCUS_STATUSES, ISSUE_SECTIONS } from "@/lib/entryAudit";
import { exportWorkbook, fetchAllPages, filterProvenanceRows } from "@/lib/exportToExcel";
import {
  AlertTriangle,
  AlertOctagon,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileWarning,
  Info,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

const PRIORITY_META = {
  high: {
    label: "High",
    bar: "bg-red-500",
    chip: "bg-red-100 text-red-700 border-red-200",
    soft: "bg-red-50 border-red-200",
    text: "text-red-700",
    icon: AlertOctagon,
  },
  medium: {
    label: "Medium",
    bar: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 border-amber-200",
    soft: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    icon: AlertTriangle,
  },
  low: {
    label: "Low",
    bar: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
    soft: "bg-slate-50 border-slate-200",
    text: "text-slate-600",
    icon: Info,
  },
  clean: {
    label: "Clean",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
    soft: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    icon: CheckCircle2,
  },
};

const TYPE_META = {
  missing: { label: "Empty field", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  format: { label: "Wrong format", chip: "bg-red-50 text-red-700 border-red-200" },
  invalid: { label: "Wrong entry", chip: "bg-red-50 text-red-700 border-red-200" },
};

const STATUS_CHIP = {
  CLOSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SURGERY_BOOKED: "bg-blue-50 text-blue-700 border-blue-200",
  BOOKING_DONE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  CONSULTED: "bg-purple-50 text-purple-700 border-purple-200",
  NOT_CONVERTED: "bg-orange-50 text-orange-700 border-orange-200",
  NOT_VISITED: "bg-slate-50 text-slate-600 border-slate-200",
  NEW: "bg-sky-50 text-sky-700 border-sky-200",
};

const DATE_FIELDS = [
  { value: "visitDate", label: "Visit Date" },
  { value: "surgeryDate", label: "Surgery Date" },
  { value: "createdAt", label: "Entry Created" },
];

const SORTS = [
  { value: "priority", label: "Priority (highest first)" },
  { value: "issues", label: "Most issues" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Patient name" },
  { value: "status", label: "Status" },
];

const opts = (arr) => arr.map((v) => ({ value: v, label: v.replace(/_/g, " ") }));

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      })
    : "—";

const INITIAL = {
  branches: [],
  statuses: FOCUS_STATUSES,
  priority: [],
  sections: [],
  types: [],
  search: "",
  dateField: "visitDate",
  dateFrom: "",
  dateTo: "",
  sort: "priority",
  limit: 50,
};

/* ── Priority bar ──────────────────────────────────────────────────────────── */

function PriorityBar({ counts, priority }) {
  const total = counts.high + counts.medium + counts.low || 1;
  const meta = PRIORITY_META[priority || "clean"];
  const Icon = meta.icon;

  return (
    <div className="min-w-[150px]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${meta.text}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wide ${meta.text}`}>
          {meta.label}
        </span>
        <span className="text-[11px] text-slate-400 font-medium">
          {counts.high + counts.medium + counts.low} issue
          {counts.high + counts.medium + counts.low === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {["high", "medium", "low"].map((s) =>
          counts[s] ? (
            <div
              key={s}
              className={PRIORITY_META[s].bar}
              style={{ width: `${(counts[s] / total) * 100}%` }}
              title={`${counts[s]} ${PRIORITY_META[s].label.toLowerCase()}`}
            />
          ) : null
        )}
        {!counts.high && !counts.medium && !counts.low && (
          <div className="bg-emerald-500 w-full" />
        )}
      </div>
      <div className="flex gap-2 mt-1 text-[10px] font-semibold">
        {counts.high > 0 && <span className="text-red-600">{counts.high} high</span>}
        {counts.medium > 0 && <span className="text-amber-600">{counts.medium} med</span>}
        {counts.low > 0 && <span className="text-slate-500">{counts.low} low</span>}
      </div>
    </div>
  );
}

/* ── Issue list for an expanded row ────────────────────────────────────────── */

function IssueDetails({ row }) {
  const alerts = row.issues.filter((i) => i.type !== "missing");
  const bySection = row.issues
    .filter((i) => i.type === "missing")
    .reduce((acc, i) => {
      (acc[i.section] = acc[i.section] || []).push(i);
      return acc;
    }, {});

  return (
    <div className="px-5 py-4 bg-slate-50/80 border-t border-slate-200 space-y-4">
      {alerts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-700 mb-2.5">
            <FileWarning className="w-4 h-4" />
            Red alert — wrong entry / wrong file format
          </p>
          <ul className="space-y-2">
            {alerts.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase ${
                    PRIORITY_META[i.severity].chip
                  }`}
                >
                  {i.severity}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{i.label}</p>
                  {i.detail && <p className="text-xs text-slate-600 mt-0.5">{i.detail}</p>}
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{i.field}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(bySection).length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2.5">
            <ClipboardList className="w-4 h-4" />
            Missing for status “{row.status.replace(/_/g, " ")}”
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(bySection).map(([section, items]) => (
              <div key={section} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                  {section}
                </p>
                <ul className="space-y-1.5">
                  {items.map((i, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_META[i.severity].bar}`} />
                      <span className="text-[13px] text-slate-700">{i.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Link
          href={`/admin/patients/${row._id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Eye className="w-3.5 h-3.5" /> View record
        </Link>
        <Link
          href={`/admin/patients/edit/${row._id}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-xs font-semibold text-white hover:bg-amber-600"
        >
          <Pencil className="w-3.5 h-3.5" /> Fix entry
        </Link>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function EntriesReportPage() {
  const [filters, setFilters] = useState(INITIAL);
  const [applied, setApplied] = useState(INITIAL);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState({});
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const buildQuery = useCallback(
    (f, p, limit = f.limit) => {
      const q = new URLSearchParams({
        page: String(p),
        limit: String(limit),
        sort: f.sort,
        dateField: f.dateField,
      });
      if (f.branches.length) q.set("branches", f.branches.join(","));
      if (f.statuses.length) q.set("statuses", f.statuses.join(","));
      if (f.priority.length) q.set("priority", f.priority.join(","));
      if (f.sections.length) q.set("sections", f.sections.join(","));
      if (f.types.length) q.set("types", f.types.join(","));
      if (f.search.trim()) q.set("search", f.search.trim());
      if (f.dateFrom) q.set("dateFrom", f.dateFrom);
      if (f.dateTo) q.set("dateTo", f.dateTo);
      return `/api/super-admin/entries-report?${q.toString()}`;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetch(buildQuery(applied, page))
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.error || json.message || "Failed to load");
        setData(json);
      })
      .catch((e) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [applied, page, buildQuery]);

  const apply = () => {
    setPage(1);
    setOpen({});
    setApplied(filters);
  };

  const reset = () => {
    setFilters(INITIAL);
    setApplied(INITIAL);
    setPage(1);
    setOpen({});
  };

  const togglePriority = (p) =>
    setFilters((f) => ({
      ...f,
      priority: f.priority.includes(p) ? f.priority.filter((x) => x !== p) : [...f.priority, p],
    }));

  const toggleType = (t) =>
    setFilters((f) => ({
      ...f,
      types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t],
    }));

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllPages(
        (p, lim) => buildQuery(applied, p, lim),
        "rows",
        { limit: 500, maxPages: 20 }
      );
      const flat = rows.flatMap((r) =>
        r.issues.map((i) => ({
          Patient: r.name,
          Phone: r.phone,
          Branch: r.branch,
          Status: r.status,
          Priority: r.priority,
          "Visit Date": r.visitDate ? new Date(r.visitDate) : "",
          "Surgery Date": r.surgeryDate ? new Date(r.surgeryDate) : "",
          Section: i.section,
          "Issue Type": TYPE_META[i.type]?.label || i.type,
          Severity: i.severity,
          Issue: i.label,
          Detail: i.detail || "",
          Field: i.field,
        }))
      );
      await exportWorkbook({
        filename: `entries-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheets: [
          { name: "Entry Issues", rows: flat.length ? flat : [{ Note: "No issues found" }] },
          {
            name: "Summary",
            rows: [
              ...filterProvenanceRows({
                branch: applied.branches.join(", "),
                dateFrom: applied.dateFrom,
                dateTo: applied.dateTo,
              }),
              { Field: "Statuses", Value: applied.statuses.join(", ") || "All" },
              { Field: "High priority patients", Value: summary?.high ?? 0 },
              { Field: "Medium priority patients", Value: summary?.medium ?? 0 },
              { Field: "Low priority patients", Value: summary?.low ?? 0 },
              { Field: "Clean patients", Value: summary?.clean ?? 0 },
              { Field: "Patients scanned", Value: summary?.scanned ?? 0 },
              { Field: "Patients exported", Value: rows.length },
              { Field: "Issue rows exported", Value: flat.length },
              ...(truncated
                ? [{ Field: "Note", Value: "Export capped at 10,000 patients - narrow the filters for the rest" }]
                : []),
            ],
          },
        ],
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;
  const rows = data?.rows || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (applied.limit || 50)));

  const cards = useMemo(
    () => [
      { key: "high", value: summary?.high ?? 0, caption: "patients need urgent correction" },
      { key: "medium", value: summary?.medium ?? 0, caption: "patients with incomplete details" },
      { key: "low", value: summary?.low ?? 0, caption: "patients missing optional fields" },
      { key: "clean", value: summary?.clean ?? 0, caption: "patients fully compliant" },
    ],
    [summary]
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <SuperAdminSidebar />

      <main className="flex-1 min-w-0 p-5 lg:p-7 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-linear-to-br from-amber-500 to-red-500 flex items-center justify-center shadow-md">
                <FileWarning className="w-5 h-5 text-white" />
              </span>
              Entries Report
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Major patient fields audited against what each status requires — personal,
              counselling, HIV/HCV, surgery team and documents uploaded in the wrong format.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((s) => !s)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {showFilters ? "Hide" : "Filters"}
            </button>
            <button
              onClick={() => setApplied({ ...applied })}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={exportExcel}
              disabled={exporting || loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ key, value, caption }) => {
            const meta = PRIORITY_META[key];
            const Icon = meta.icon;
            const active = applied.priority.includes(key);
            const clean = key === "clean";
            return (
              <button
                key={key}
                disabled={clean}
                onClick={() => {
                  const next = active
                    ? applied.priority.filter((x) => x !== key)
                    : [...applied.priority, key];
                  setFilters((f) => ({ ...f, priority: next }));
                  setApplied((a) => ({ ...a, priority: next }));
                  setPage(1);
                }}
                className={`text-left rounded-2xl border p-4 transition-all ${
                  clean ? "bg-white border-slate-200 cursor-default" : "hover:shadow-sm"
                } ${
                  active ? `${meta.soft} ring-2 ring-offset-1 ring-slate-300` : "bg-white border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${meta.text}`}>
                    {meta.label} priority
                  </span>
                  <Icon className={`w-4 h-4 ${meta.text}`} />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">{value}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{caption}</p>
                <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={meta.bar}
                    style={{
                      width: `${summary?.scanned ? (value / summary.scanned) * 100 : 0}%`,
                      height: "100%",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <SearchableMultiSelect
                label="Branch"
                icon={Building2}
                value={filters.branches}
                onChange={(branches) => setFilters((f) => ({ ...f, branches }))}
                options={opts(ALL_BRANCHES)}
                allLabel="All branches"
              />
              <SearchableMultiSelect
                label="Patient Status"
                icon={ClipboardList}
                value={filters.statuses}
                onChange={(statuses) => setFilters((f) => ({ ...f, statuses }))}
                options={opts(ALL_STATUSES)}
                allLabel="Booking / Surgery / Closed"
              />
              <SearchableMultiSelect
                label="Issue Area"
                icon={MapPin}
                value={filters.sections}
                onChange={(sections) => setFilters((f) => ({ ...f, sections }))}
                options={opts(ISSUE_SECTIONS)}
                allLabel="All areas"
              />
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block mb-2">
                  Search
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && apply()}
                    placeholder="Name or phone"
                    className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block mb-2">
                  Date Field
                </label>
                <select
                  value={filters.dateField}
                  onChange={(e) => setFilters((f) => ({ ...f, dateField: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {DATE_FIELDS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block mb-2">
                  From
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block mb-2">
                  To
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block mb-2">
                  Sort
                </label>
                <select
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                    Priority
                  </p>
                  <div className="flex gap-1.5">
                    {["high", "medium", "low"].map((p) => (
                      <button
                        key={p}
                        onClick={() => togglePriority(p)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          filters.priority.includes(p)
                            ? PRIORITY_META[p].chip
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {PRIORITY_META[p].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                    Issue Type
                  </p>
                  <div className="flex gap-1.5">
                    {Object.entries(TYPE_META).map(([t, m]) => (
                      <button
                        key={t}
                        onClick={() => toggleType(t)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                          filters.types.includes(t)
                            ? m.chip
                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filters.limit}
                  onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value) }))}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {[25, 50, 100, 200].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <X className="w-4 h-4" /> Reset
                </button>
                <button
                  onClick={apply}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Top recurring issues */}
        {data?.topIssues?.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2.5">
              Most common gaps in this selection
            </p>
            <div className="flex flex-wrap gap-2">
              {data.topIssues.map((t) => (
                <span
                  key={`${t.label}-${t.severity}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${
                    PRIORITY_META[t.severity].chip
                  }`}
                >
                  {t.label}
                  <span className="font-bold tabular-nums">{t.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
            <p className="text-sm font-semibold text-slate-700">
              {loading ? "Auditing…" : `${(data?.total || 0).toLocaleString("en-IN")} patients flagged`}
              {summary?.scanned ? (
                <span className="text-slate-400 font-normal">
                  {" "}
                  of {summary.scanned.toLocaleString("en-IN")} scanned
                </span>
              ) : null}
            </p>
            {!loading && rows.length > 0 && (
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages}
              </p>
            )}
          </div>

          {loading ? (
            <div className="py-20 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-20 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">No entry problems found</p>
              <p className="text-xs text-slate-400 mt-1">
                Every patient in this selection matches what their status requires.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8" />
                    <th className="text-left px-3 py-2.5 font-bold">Patient</th>
                    <th className="text-left px-3 py-2.5 font-bold">Branch</th>
                    <th className="text-left px-3 py-2.5 font-bold">Status</th>
                    <th className="text-left px-3 py-2.5 font-bold">Priority</th>
                    <th className="text-left px-3 py-2.5 font-bold">Missing / wrong</th>
                    <th className="text-left px-3 py-2.5 font-bold">Dates</th>
                    <th className="text-right px-3 py-2.5 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const isOpen = !!open[r._id];
                    const alerts = r.issues.filter((i) => i.type !== "missing");
                    const missing = r.issues.filter((i) => i.type === "missing");
                    return (
                      <Fragment key={r._id}>
                        <tr
                          className={`hover:bg-slate-50/70 cursor-pointer ${
                            r.priority === "high" ? "bg-red-50/30" : ""
                          }`}
                          onClick={() => setOpen((o) => ({ ...o, [r._id]: !o[r._id] }))}
                        >
                          <td className="pl-3">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-slate-800">{r.name || "—"}</p>
                            <p className="text-xs text-slate-500">{r.phone || "—"}</p>
                            {r.counsellor && (
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Counsellor: {r.counsellor}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-600">{r.branch || "—"}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                                STATUS_CHIP[r.status] || STATUS_CHIP.NEW
                              }`}
                            >
                              {r.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <PriorityBar counts={r.counts} priority={r.priority} />
                          </td>
                          <td className="px-3 py-3 max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {alerts.slice(0, 2).map((i, idx) => (
                                <span
                                  key={`a${idx}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-red-200 bg-red-50 text-[10px] font-bold text-red-700"
                                >
                                  <AlertOctagon className="w-3 h-3" />
                                  {i.label}
                                </span>
                              ))}
                              {missing.slice(0, alerts.length ? 2 : 4).map((i, idx) => (
                                <span
                                  key={`m${idx}`}
                                  className={`px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${
                                    PRIORITY_META[i.severity].chip
                                  }`}
                                >
                                  {i.label}
                                </span>
                              ))}
                              {r.issues.length >
                                alerts.slice(0, 2).length + missing.slice(0, alerts.length ? 2 : 4).length && (
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-600">
                                  +
                                  {r.issues.length -
                                    alerts.slice(0, 2).length -
                                    missing.slice(0, alerts.length ? 2 : 4).length}{" "}
                                  more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                            <p className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {fmtDate(r.visitDate)}
                            </p>
                            {r.surgeryDate && (
                              <p className="text-slate-400 mt-0.5">Sx {fmtDate(r.surgeryDate)}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            <Link
                              href={`/admin/patients/edit/${r._id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-[11px] font-semibold text-white hover:bg-slate-800"
                            >
                              <Pencil className="w-3 h-3" /> Fix
                            </Link>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <IssueDetails row={r} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
