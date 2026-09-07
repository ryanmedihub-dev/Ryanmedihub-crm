"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Filter, X, Plus, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, TrendingUp, Edit, Users, IndianRupee, Activity, Trash2, Calendar, Stethoscope, Eye,
  Download, Loader2,
} from "lucide-react";
import { exportWorkbook, filterProvenanceRows } from "@/lib/exportToExcel";
import { fetchInterleavedRows } from "@/lib/finance/headedExport";

// Common designations — always shown as tabs. Any other free-form role that has employees
// is appended dynamically (see `categoryList` below) so custom posts aren't hidden.
const CATEGORY_OPTIONS = ["Doctor", "Agent", "Counsellor", "Technician", "Implanter", "Others", "Hr"];

const TECHNIQUES = [
  "Sapphire FUE", "DHI", "Turkish DHI", "Beard Transplant", "PRP",
  "Alopecia", "Headwash", "GFC", "Other",
];

// dot = the little status dot on the tab; active = the pill styling when selected.
const CAT_STYLE = {
  Doctor:     { dot: "bg-violet-500",  active: "bg-violet-50 text-violet-700 ring-violet-200" },
  Agent:      { dot: "bg-blue-500",    active: "bg-blue-50 text-blue-700 ring-blue-200" },
  Counsellor: { dot: "bg-emerald-500", active: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  Technician: { dot: "bg-orange-500",  active: "bg-orange-50 text-orange-700 ring-orange-200" },
  Implanter:  { dot: "bg-indigo-500",  active: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  Others:     { dot: "bg-slate-400",   active: "bg-slate-100 text-slate-700 ring-slate-200" },
  Hr:         { dot: "bg-pink-500",    active: "bg-pink-50 text-pink-700 ring-pink-200" },
};
const catStyle = (c) => CAT_STYLE[c] || { dot: "bg-slate-400", active: "bg-slate-100 text-slate-700 ring-slate-200" };

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
];
const hashIndex = (s, mod) =>
  [...String(s || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % mod;
const avatarClass = (s) => AVATAR_PALETTE[hashIndex(s, AVATAR_PALETTE.length)];
const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "?";

const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const fmtNumber = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

const EMPTY_FILTERS = {
  search: "", category: "", status: "",
  minPatients: "", maxPatients: "",
  minAmount: "", maxAmount: "",
  minGrafts: "", maxGrafts: "",
  dateFrom: "", dateTo: "", technique: "",
  minPending: "", onlyPending: false,
};

// The six money columns, shown when config.financeColumns is on. All six come from
// Payables raised against the employee, so Total = Salary + Incentive + other, and
// Pending = Payable − Paid on every line.
const FINANCE_COLUMNS = [
  { key: "totalPayable",     label: "Total Payable",   tone: "text-slate-900 font-semibold" },
  { key: "totalPaid",        label: "Total Paid",      tone: "text-emerald-600 font-semibold" },
  { key: "salaryPayable",    label: "Salary Payable",  tone: "text-slate-600" },
  { key: "salaryPaid",       label: "Salary Paid",     tone: "text-emerald-600" },
  { key: "incentivePayable", label: "Total Incentive", tone: "text-slate-600" },
  { key: "incentivePaid",    label: "Incentive Paid",  tone: "text-emerald-600" },
  { key: "advanceOutstanding", label: "Advance O/S",   tone: "text-amber-600 font-semibold" },
];

const EMPTY_FINANCE = {
  totalPayable: 0, totalPaid: 0, totalPending: 0,
  salaryPayable: 0, salaryPaid: 0, salaryPending: 0,
  incentivePayable: 0, incentivePaid: 0, incentivePending: 0,
  payableCount: 0, overdueCount: 0,
  advanceGiven: 0, advanceSettled: 0, advanceRecovered: 0, advanceOutstanding: 0, advanceCount: 0,
};

export default function StaffTable({ config = {} }) {
  const {
    SidebarComponent,
    addEmployeePath = null,
    editBasePath    = "/admin/employees/update",
    canDelete       = false,
    viewBasePath    = null,
    financeColumns  = false,
  } = config;

  const [data,     setData]     = useState({});
  const [filters,  setFilters]  = useState(EMPTY_FILTERS);
  const [drawerOpen, setDrawer] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [sort,     setSort]     = useState({ key: financeColumns ? "totalPayable" : "totalPatient", dir: "desc" });
  const [page,     setPage]     = useState(1);
  const [perPage,  setPerPage]  = useState(10);
  const [selectedCategory, setSelectedCategory] = useState("Doctor");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const p = new URLSearchParams();
        if (filters.dateFrom)  p.set("dateFrom",  filters.dateFrom);
        if (filters.dateTo)    p.set("dateTo",    filters.dateTo);
        if (filters.technique) p.set("technique", filters.technique);

        // The payable rollup is a separate query keyed by employee id — fetched alongside
        // so the roster and the money columns arrive together rather than popping in late.
        const [raw, finance] = await Promise.all([
          fetch(`/api/employees/get-patients?${p.toString()}`).then((r) => {
            if (!r.ok) throw new Error("Failed to fetch");
            return r.json();
          }),
          financeColumns
            ? fetch(`/api/employees/finance-summary?${p.toString()}`)
                .then((r) => (r.ok ? r.json() : { byEmployee: {} }))
                .catch(() => ({ byEmployee: {} }))
            : Promise.resolve({ byEmployee: {} }),
        ]);

        const byEmployee = finance?.byEmployee || {};
        const transformed = {};
        Object.keys(raw).forEach((cat) => {
          transformed[cat] = raw[cat].map((e) => ({
            ...e,
            status: e.isactive ? "active" : "inactive",
            ...(financeColumns ? (byEmployee[String(e._id)] || EMPTY_FINANCE) : {}),
          }));
        });
        setData(transformed);
      } catch {
        setData({});
      } finally {
        setLoading(false);
      }
    })();
  }, [filters.dateFrom, filters.dateTo, filters.technique, financeColumns]);

  const currentCategory = filters.category || selectedCategory;
  const hasGrafts          = ["Doctor", "Technician", "Implanter", "Others"].includes(currentCategory);
  const hasReadyForSurgery = ["Agent", "Counsellor"].includes(currentCategory);
  const isHr               = currentCategory === "Hr";

  // Standard tabs first, then any custom designation that actually has staff.
  const categoryList = useMemo(() => {
    const custom = Object.keys(data)
      .filter((k) => !CATEGORY_OPTIONS.includes(k) && (data[k]?.length || 0) > 0)
      .sort();
    return [...CATEGORY_OPTIONS, ...custom];
  }, [data]);

  const categoryData = useMemo(() => data[currentCategory] || [], [data, currentCategory]);

  const filtered = useMemo(() => {
    let list = [...categoryData];
    if (filters.search)      list = list.filter((i) => i.name.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.status)      list = list.filter((i) => i.status === filters.status);
    if (financeColumns) {
      if (filters.minAmount)  list = list.filter((i) => (i.totalPayable || 0) >= +filters.minAmount);
      if (filters.maxAmount)  list = list.filter((i) => (i.totalPayable || 0) <= +filters.maxAmount);
      if (filters.minPending) list = list.filter((i) => (i.totalPending || 0) >= +filters.minPending);
      if (filters.onlyPending) list = list.filter((i) => (i.totalPending || 0) > 0);
    } else {
      if (filters.minPatients) list = list.filter((i) => i.totalPatient >= +filters.minPatients);
      if (filters.maxPatients) list = list.filter((i) => i.totalPatient <= +filters.maxPatients);
      if (filters.minAmount)   list = list.filter((i) => i.amountReceived >= +filters.minAmount);
      if (filters.maxAmount)   list = list.filter((i) => i.amountReceived <= +filters.maxAmount);
      if (filters.minGrafts)   list = list.filter((i) => (i.graftsImplanted || 0) >= +filters.minGrafts);
      if (filters.maxGrafts)   list = list.filter((i) => (i.graftsImplanted || 0) <= +filters.maxGrafts);
    }
    list.sort((a, b) => {
      const av = a[sort.key] || 0, bv = b[sort.key] || 0;
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [categoryData, filters, sort, financeColumns]);

  const financeTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, i) => {
          Object.keys(EMPTY_FINANCE).forEach((k) => {
            acc[k] += i[k] || 0;
          });
          return acc;
        },
        { ...EMPTY_FINANCE },
      ),
    [filtered],
  );

  const totals = useMemo(() =>
    filtered.reduce((acc, i) => ({
      totalPatient:    acc.totalPatient    + (i.totalPatient    || 0),
      graftsImplanted: acc.graftsImplanted + (i.graftsImplanted || 0),
      amountReceived:  acc.amountReceived  + (i.amountReceived  || 0),
      readyForSurgery: acc.readyForSurgery + (i.readyForSurgery || 0),
      totalCandidates: acc.totalCandidates + (i.totalCandidates || 0),
      selected:        acc.selected        + (i.selected        || 0),
      rejected:        acc.rejected        + (i.rejected        || 0),
      scheduled:       acc.scheduled       + (i.scheduled       || 0),
    }), { totalPatient: 0, graftsImplanted: 0, amountReceived: 0, readyForSurgery: 0, totalCandidates: 0, selected: 0, rejected: 0, scheduled: 0 }),
  [filtered]);

  const total   = filtered.length;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages);
  const start   = (current - 1) * perPage;
  const rows    = filtered.slice(start, Math.min(start + perPage, total));
  useEffect(() => setPage(1), [filters, perPage, selectedCategory]);

  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const toggleSort   = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  const setFilter    = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete employee "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res  = await fetch(`/api/employees/delete/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setData((prev) => {
          const next = {};
          Object.keys(prev).forEach((cat) => { next[cat] = prev[cat].filter((e) => e._id !== id); });
          return next;
        });
      }
    } finally {
      setDeleting(null);
    }
  };

  // Payroll export (finance mode only): Overview = every employee's payable rollup,
  // Detail = one flat sheet of every employee payable + the payments against it.
  const handleFinanceExport = async () => {
    setExporting(true);
    try {
      const scope = { branch: "", dateFrom: filters.dateFrom || "", dateTo: filters.dateTo || "" };
      const [summaryJson, interleaved] = await Promise.all([
        fetch(`/api/employees/finance-summary${filters.dateFrom || filters.dateTo
          ? `?${new URLSearchParams({
              ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
              ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
            })}`
          : ""}`).then((r) => r.json()),
        fetchInterleavedRows({ kind: "payables", scope }),
      ]);

      // Names/roles from the roster already loaded into `data`, keyed by id.
      const nameById = {};
      Object.entries(data).forEach(([cat, list]) => {
        (list || []).forEach((e) => {
          nameById[String(e._id)] = { name: e.name, employeeId: e.employeeId || "", role: cat, active: e.status === "active" };
        });
      });

      const byEmployee = summaryJson?.byEmployee || {};
      const overviewRows = Object.entries(byEmployee).map(([id, f]) => ({
        Employee: nameById[id]?.name || "—",
        "Employee ID": nameById[id]?.employeeId || "—",
        Role: nameById[id]?.role || "—",
        Active: nameById[id] ? (nameById[id].active ? "Yes" : "No") : "—",
        "Total Payable": f.totalPayable,
        "Total Paid": f.totalPaid,
        "Total Pending": f.totalPending,
        "Salary Payable": f.salaryPayable,
        "Salary Paid": f.salaryPaid,
        "Incentive Payable": f.incentivePayable,
        "Incentive Paid": f.incentivePaid,
        Overdue: f.overdueCount,
      }));

      const detail = (interleaved.rows || []).filter((row) => row["Payee Type"] === "EMPLOYEE");
      if (interleaved.truncated) {
        alert(
          `Detail sheet capped at the ${interleaved.docLimit || 5000} newest payables — narrow the date range for a complete file.`,
        );
      }

      await exportWorkbook({
        filename: `Employees_payroll_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheets: [
          {
            name: "Info",
            rows: filterProvenanceRows({ dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
            colWidths: [22, 24],
          },
          {
            name: "Overview",
            rows: overviewRows,
            colWidths: [24, 12, 8, 14, 14, 14, 14, 14, 14, 14, 10],
            currencyCols: [
              "Total Payable", "Total Paid", "Total Pending",
              "Salary Payable", "Salary Paid", "Incentive Payable", "Incentive Paid",
            ],
          },
          {
            name: "Payables & Payments",
            rows: detail,
            colWidths: [8, 24, 12, 16, 16, 12, 10, 14, 12, 14, 12, 12, 14, 16, 18, 24],
            currencyCols: ["Total Amount", "Paid", "Pending", "Payment Amount"],
          },
        ],
      });
    } catch (err) {
      console.error("Payroll export failed:", err);
      alert("Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.category)    chips.push({ k: "category",    label: `Category: ${filters.category}` });
    if (filters.status)      chips.push({ k: "status",      label: `Status: ${filters.status === "active" ? "Active" : "Inactive"}` });
    if (financeColumns) {
      if (filters.minAmount)   chips.push({ k: "minAmount",   label: `Min Payable: ${fmtCurrency(filters.minAmount)}` });
      if (filters.maxAmount)   chips.push({ k: "maxAmount",   label: `Max Payable: ${fmtCurrency(filters.maxAmount)}` });
      if (filters.minPending)  chips.push({ k: "minPending",  label: `Min Pending: ${fmtCurrency(filters.minPending)}` });
      if (filters.onlyPending) chips.push({ k: "onlyPending", label: "Only with pending" });
    } else {
      if (filters.minPatients) chips.push({ k: "minPatients", label: `Min Patients: ${filters.minPatients}` });
      if (filters.maxPatients) chips.push({ k: "maxPatients", label: `Max Patients: ${filters.maxPatients}` });
      if (filters.minAmount)   chips.push({ k: "minAmount",   label: `Min Amount: ${fmtCurrency(filters.minAmount)}` });
      if (filters.maxAmount)   chips.push({ k: "maxAmount",   label: `Max Amount: ${fmtCurrency(filters.maxAmount)}` });
      if (filters.minGrafts)   chips.push({ k: "minGrafts",   label: `Min Grafts: ${filters.minGrafts}` });
      if (filters.maxGrafts)   chips.push({ k: "maxGrafts",   label: `Max Grafts: ${filters.maxGrafts}` });
      if (filters.technique)   chips.push({ k: "technique",   label: `Service: ${filters.technique}` });
    }
    if (filters.dateFrom)    chips.push({ k: "dateFrom",    label: `From: ${filters.dateFrom}` });
    if (filters.dateTo)      chips.push({ k: "dateTo",      label: `To: ${filters.dateTo}` });
    return chips;
  }, [filters, financeColumns]);

  const columnCount =
    3 +
    (financeColumns ? 6 : isHr ? 5 : 3 + (hasGrafts ? 1 : 0) + (hasReadyForSurgery ? 1 : 0)) +
    1;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {SidebarComponent && <SidebarComponent />}

      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-400 px-4 sm:px-6 lg:px-8 py-6 space-y-5">

          {/* ===== Header ===== */}
          <header className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    {financeColumns ? "Payroll & Staff" : "Staff Performance"}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {financeColumns
                      ? "Payable / paid split by salary and incentive, per employee"
                      : "Performance metrics across every staff category"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => setDrawer(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <Filter className="h-4 w-4 text-slate-500" />
                  Filters
                  {activeChips.length > 0 && (
                    <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white">
                      {activeChips.length}
                    </span>
                  )}
                </button>

                {financeColumns && (
                  <button
                    onClick={handleFinanceExport}
                    disabled={exporting}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-slate-500" />}
                    Export
                  </button>
                )}

                {addEmployeePath && (
                  <Link
                    href={addEmployeePath}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Employee
                  </Link>
                )}
              </div>
            </div>

            {activeChips.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {activeChips.map((c) => (
                  <span
                    key={c.k}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200"
                  >
                    {c.label}
                    <button onClick={() => setFilter(c.k, "")} className="rounded-full p-0.5 hover:bg-indigo-100">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button onClick={clearFilters} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                  Clear all
                </button>
              </div>
            )}
          </header>

          {/* ===== Category tabs ===== */}
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex gap-2 px-1">
              {categoryList.map((cat) => {
                const s = catStyle(cat);
                const active = currentCategory === cat;
                const count = data[cat]?.length || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setFilter("category", cat); }}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition ${
                      active
                        ? `${s.active} shadow-sm`
                        : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {cat}
                    <span
                      className={`grid h-5 min-w-5 place-items-center rounded-md px-1 text-[11px] font-bold ${
                        active ? "bg-white/70 text-slate-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ===== Stat cards ===== */}
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${financeColumns ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <SummaryCard title="Total Staff" value={fmtNumber(filtered.length)} icon={<Users className="h-5 w-5" />} color="indigo" />
            {financeColumns ? (
              <>
                <SummaryCard title="Total Payable"     value={fmtCurrency(financeTotals.totalPayable)}     icon={<IndianRupee className="h-5 w-5" />} color="slate" />
                <SummaryCard title="Total Paid"        value={fmtCurrency(financeTotals.totalPaid)}        icon={<TrendingUp className="h-5 w-5" />}  color="emerald" />
                <SummaryCard title="Salary Pending"    value={fmtCurrency(financeTotals.salaryPending)}    icon={<IndianRupee className="h-5 w-5" />} color="amber" />
                <SummaryCard title="Incentive Pending" value={fmtCurrency(financeTotals.incentivePending)} icon={<Activity className="h-5 w-5" />}    color="rose" />
              </>
            ) : isHr ? (
              <>
                <SummaryCard title="Total Assigned" value={fmtNumber(totals.totalCandidates)} icon={<Activity className="h-5 w-5" />}   color="slate" />
                <SummaryCard title="Selected"       value={fmtNumber(totals.selected)}        icon={<TrendingUp className="h-5 w-5" />} color="emerald" />
                <SummaryCard title="Rejected"       value={fmtNumber(totals.rejected)}        icon={<X className="h-5 w-5" />}          color="rose" />
              </>
            ) : (
              <>
                <SummaryCard title="Total Patients" value={fmtNumber(totals.totalPatient)} icon={<Activity className="h-5 w-5" />} color="slate" />
                {hasGrafts          && <SummaryCard title="Total Grafts"      value={fmtNumber(totals.graftsImplanted)} icon={<TrendingUp className="h-5 w-5" />} color="violet" />}
                {hasReadyForSurgery && <SummaryCard title="Ready for Surgery" value={fmtNumber(totals.readyForSurgery)}  icon={<Stethoscope className="h-5 w-5" />} color="amber" />}
                <SummaryCard title="Total Revenue" value={fmtCurrency(totals.amountReceived)} icon={<IndianRupee className="h-5 w-5" />} color="emerald" />
              </>
            )}
          </div>

          {/* ===== Table card ===== */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                />
              </div>
              <p className="text-xs font-medium text-slate-500">
                {loading ? "Loading…" : (
                  <>
                    <span className="font-bold text-slate-700">{total}</span> {currentCategory}
                    {total === 1 ? "" : "s"} shown
                  </>
                )}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Emp ID</th>
                    <th className="px-5 py-3">Status</th>
                    {financeColumns ? (
                      FINANCE_COLUMNS.map((c) => (
                        <Th key={c.key} label={c.label} align="right" sortKey={c.key} sort={sort} onSort={toggleSort} />
                      ))
                    ) : isHr ? (
                      <>
                        <Th label="Assigned"       align="right" sortKey="totalCandidates" sort={sort} onSort={toggleSort} />
                        <Th label="Selected"       align="right" sortKey="selected"        sort={sort} onSort={toggleSort} />
                        <Th label="Rejected"       align="right" sortKey="rejected"        sort={sort} onSort={toggleSort} />
                        <Th label="Scheduled"      align="right" sortKey="scheduled"       sort={sort} onSort={toggleSort} />
                        <Th label="Sel. Rate"      align="right" sortKey="selectionRate"   sort={sort} onSort={toggleSort} />
                      </>
                    ) : (
                      <>
                        <Th label="Patients"       align="right" sortKey="totalPatient"    sort={sort} onSort={toggleSort} />
                        {hasGrafts          && <Th label="Grafts"    align="right" sortKey="graftsImplanted" sort={sort} onSort={toggleSort} />}
                        {hasReadyForSurgery && <Th label="Ready"     align="right" sortKey="readyForSurgery" sort={sort} onSort={toggleSort} />}
                        <Th label="Revenue"        align="right" sortKey="amountReceived"  sort={sort} onSort={toggleSort} />
                        <Th label="Avg / Patient"  align="right" />
                      </>
                    )}
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: columnCount }).map((__, j) => (
                          <td key={j} className="px-5 py-4">
                            <div className={`h-4 animate-pulse rounded bg-slate-100 ${j === 0 ? "w-40" : "w-16 ml-auto"}`} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={columnCount} className="px-5 py-16 text-center">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100">
                          <Search className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900">No staff match this view</p>
                        <p className="mt-0.5 text-xs text-slate-500">Adjust the search or filters to see more.</p>
                        {activeChips.length > 0 && (
                          <button
                            onClick={clearFilters}
                            className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            Clear all filters
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item, idx) => {
                      const avg = item.totalPatient ? item.amountReceived / item.totalPatient : 0;
                      return (
                        <tr key={item._id || idx} className="group transition hover:bg-indigo-50/40">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${avatarClass(item.name)}`}>
                                {initials(item.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-semibold text-slate-900">{item.name}</span>
                                  {financeColumns && item.overdueCount > 0 && (
                                    <span
                                      className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 ring-1 ring-rose-200"
                                      title={`${item.overdueCount} payable(s) past their due date`}
                                    >
                                      {item.overdueCount} overdue
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400">{currentCategory}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 tabular-nums text-slate-500">{item.employeeId || "—"}</td>
                          <td className="px-5 py-3.5"><StatusBadge status={item.status} /></td>

                          {financeColumns ? (
                            FINANCE_COLUMNS.map((c) => (
                              <td key={c.key} className={`px-5 py-3.5 text-right tabular-nums ${c.tone}`}>
                                {fmtCurrency(item[c.key])}
                              </td>
                            ))
                          ) : isHr ? (
                            <>
                              <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">{item.totalCandidates || 0}</td>
                              <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-emerald-600">{item.selected || 0}</td>
                              <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-rose-500">{item.rejected || 0}</td>
                              <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-indigo-600">{item.scheduled || 0}</td>
                              <td className="px-5 py-3.5 text-right">
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                                    item.selectionRate >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {item.selectionRate || 0}%
                                </span>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">{item.totalPatient}</td>
                              {hasGrafts          && <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">{fmtNumber(item.graftsImplanted || 0)}</td>}
                              {hasReadyForSurgery && <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">{item.readyForSurgery || 0}</td>}
                              <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-900">{fmtCurrency(item.amountReceived)}</td>
                              <td className="px-5 py-3.5 text-right tabular-nums text-slate-500">{fmtCurrency(avg)}</td>
                            </>
                          )}

                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                              {viewBasePath && (
                                <Link
                                  href={`${viewBasePath}/${item._id}`}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                  title={financeColumns ? "View incentives — which patients they were earned on" : "View employee"}
                                >
                                  <Eye className="h-4 w-4" />
                                </Link>
                              )}
                              <Link
                                href={`${editBasePath}/${item._id}`}
                                className="grid h-8 w-8 place-items-center rounded-lg text-indigo-600 transition hover:bg-indigo-50"
                                title="Edit employee"
                              >
                                <Edit className="h-4 w-4" />
                              </Link>
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(item._id, item.name)}
                                  disabled={deleting === item._id}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50 disabled:opacity-40"
                                  title="Delete employee"
                                >
                                  {deleting === item._id
                                    ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
                                    : <Trash2 className="h-4 w-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {!loading && rows.length > 0 && (
                  <tfoot className="border-t-2 border-slate-100 bg-slate-50/70 text-sm font-semibold text-slate-900">
                    <tr>
                      <td className="px-5 py-3.5" colSpan={3}>Total</td>
                      {financeColumns ? (
                        FINANCE_COLUMNS.map((c) => (
                          <td key={c.key} className="px-5 py-3.5 text-right tabular-nums">
                            {fmtCurrency(financeTotals[c.key])}
                          </td>
                        ))
                      ) : isHr ? (
                        <>
                          <td className="px-5 py-3.5 text-right tabular-nums">{totals.totalCandidates}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-emerald-600">{totals.selected}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-rose-500">{totals.rejected}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-indigo-600">{totals.scheduled}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-500">
                            {totals.totalCandidates > 0 ? `${((totals.selected / totals.totalCandidates) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-5 py-3.5 text-right tabular-nums">{totals.totalPatient}</td>
                          {hasGrafts          && <td className="px-5 py-3.5 text-right tabular-nums">{fmtNumber(totals.graftsImplanted)}</td>}
                          {hasReadyForSurgery && <td className="px-5 py-3.5 text-right tabular-nums">{totals.readyForSurgery}</td>}
                          <td className="px-5 py-3.5 text-right tabular-nums">{fmtCurrency(totals.amountReceived)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-500">
                            {totals.totalPatient > 0 ? fmtCurrency(totals.amountReceived / totals.totalPatient) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-5 py-3.5" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:flex-row">
              <p className="text-xs text-slate-500">
                {total === 0 ? "No results" : (
                  <>Showing <b className="text-slate-700">{start + 1}</b>–<b className="text-slate-700">{Math.min(start + perPage, total)}</b> of <b className="text-slate-700">{total}</b></>
                )}
              </p>
              <div className="flex items-center gap-2.5">
                <select
                  value={perPage}
                  onChange={(e) => setPerPage(+e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                >
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={current <= 1}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="w-14 text-center text-xs font-medium text-slate-600">{current} / {pages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={current >= pages}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ===== Filter drawer ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Filters</h3>
                <p className="text-xs text-slate-500">Refine the staff view</p>
              </div>
              <button onClick={() => setDrawer(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <FilterSection title="Category" icon={<Filter className="h-4 w-4" />}>
                <FilterSelect
                  value={filters.category}
                  onChange={(v) => { setFilter("category", v); setSelectedCategory(v || "Doctor"); }}
                  options={[{ label: "All Categories", value: "" }, ...categoryList.map((c) => ({ label: c, value: c }))]}
                />
              </FilterSection>

              <FilterSection title="Status" icon={<Activity className="h-4 w-4" />}>
                <FilterSelect
                  value={filters.status}
                  onChange={(v) => setFilter("status", v)}
                  options={[{ label: "All Status", value: "" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }]}
                />
              </FilterSection>

              {financeColumns ? (
                <>
                  <FilterSection title="Total Payable" icon={<IndianRupee className="h-4 w-4" />}>
                    <div className="grid grid-cols-2 gap-3">
                      <FilterInput label="Min (₹)" value={filters.minAmount} onChange={(v) => setFilter("minAmount", v)} placeholder="0" />
                      <FilterInput label="Max (₹)" value={filters.maxAmount} onChange={(v) => setFilter("maxAmount", v)} placeholder="500000" />
                    </div>
                  </FilterSection>

                  <FilterSection title="Outstanding" icon={<Activity className="h-4 w-4" />}>
                    <FilterInput label="Min Pending (₹)" value={filters.minPending} onChange={(v) => setFilter("minPending", v)} placeholder="0" />
                    <label className="mt-3 flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={filters.onlyPending}
                        onChange={(e) => setFilter("onlyPending", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">Only staff with something still owed</span>
                    </label>
                  </FilterSection>
                </>
              ) : (
                <>
                  <FilterSection title="Patient Count" icon={<Users className="h-4 w-4" />}>
                    <div className="grid grid-cols-2 gap-3">
                      <FilterInput label="Min Patients" value={filters.minPatients} onChange={(v) => setFilter("minPatients", v)} placeholder="0" />
                      <FilterInput label="Max Patients" value={filters.maxPatients} onChange={(v) => setFilter("maxPatients", v)} placeholder="100" />
                    </div>
                  </FilterSection>

                  <FilterSection title="Amount Received" icon={<IndianRupee className="h-4 w-4" />}>
                    <div className="grid grid-cols-2 gap-3">
                      <FilterInput label="Min Amount (₹)" value={filters.minAmount} onChange={(v) => setFilter("minAmount", v)} placeholder="0" />
                      <FilterInput label="Max Amount (₹)" value={filters.maxAmount} onChange={(v) => setFilter("maxAmount", v)} placeholder="500000" />
                    </div>
                  </FilterSection>
                </>
              )}

              {!financeColumns && hasGrafts && (
                <FilterSection title="Grafts Implanted" icon={<TrendingUp className="h-4 w-4" />}>
                  <div className="grid grid-cols-2 gap-3">
                    <FilterInput label="Min Grafts" value={filters.minGrafts} onChange={(v) => setFilter("minGrafts", v)} placeholder="0" />
                    <FilterInput label="Max Grafts" value={filters.maxGrafts} onChange={(v) => setFilter("maxGrafts", v)} placeholder="30000" />
                  </div>
                </FilterSection>
              )}

              <FilterSection
                title={financeColumns ? "Payable Raised Between" : "Visit Date Range"}
                icon={<Calendar className="h-4 w-4" />}
              >
                <div className="grid grid-cols-2 gap-3">
                  <FilterDateInput label="From" value={filters.dateFrom} onChange={(v) => setFilter("dateFrom", v)} />
                  <FilterDateInput label="To"   value={filters.dateTo}   onChange={(v) => setFilter("dateTo",   v)} />
                </div>
              </FilterSection>

              {!financeColumns && (
                <FilterSection title="Service / Technique" icon={<Stethoscope className="h-4 w-4" />}>
                  <FilterSelect
                    value={filters.technique}
                    onChange={(v) => setFilter("technique", v)}
                    options={[{ label: "All Services", value: "" }, ...TECHNIQUES.map((t) => ({ label: t, value: t }))]}
                  />
                </FilterSection>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button onClick={clearFilters} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Reset All
              </button>
              <button onClick={() => setDrawer(false)} className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ label, sortKey, sort, onSort, align = "left" }) {
  const active = sortKey && sort?.key === sortKey;
  const right = align === "right";
  return (
    <th
      className={`px-5 py-3 font-semibold ${right ? "text-right" : "text-left"} ${
        sortKey ? "cursor-pointer select-none transition hover:text-slate-800" : ""
      }`}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {sortKey && (
          active
            ? (sort.dir === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-indigo-500" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-500" />)
            : <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
        )}
      </span>
    </th>
  );
}

function FilterSection({ title, icon, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <span className="text-slate-500">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FilterInput({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
      />
    </label>
  );
}

function FilterDateInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
      />
    </label>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SummaryCard({ title, value, icon, color }) {
  const tint = {
    indigo:  "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet:  "bg-violet-50 text-violet-600",
    amber:   "bg-amber-50 text-amber-600",
    rose:    "bg-rose-50 text-rose-600",
    slate:   "bg-slate-100 text-slate-600",
  }[color] || "bg-slate-100 text-slate-600";
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tint}`}>{icon}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    active:   { label: "Active",   dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    inactive: { label: "Inactive", dot: "bg-slate-400",   cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  }[status] || { label: "Unknown", dot: "bg-slate-400", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
